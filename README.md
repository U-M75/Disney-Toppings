# KSC Disney Topping Update

A mobile-first, KSC-branded Next.js app for scheduled Disney DIY Toppings kiosk checks. It creates signed form links, records one of 28 style answers, receives photos directly into Vercel Blob, stores cycles/submissions in Supabase Postgres, and posts a Slack summary with native Slack photo files in the alert thread. **This version does not use Redis or Upstash.**

## What is included

- Next.js 14.2.35 App Router, React 18.3.1, plain JavaScript, and plain CSS.
- Signed `cycleId.hmac` links with configurable expiry and timezone-aware dates.
- Protected GET/POST alert and reminder cron routes. No Slack Workflow Builder, Events API, interactive endpoint, slash command, or signing secret is used.
- Twenty-eight editable default styles in `config/styles.js`; `STYLES_JSON` may replace them with another array of exactly 28 styles.
- Direct Vercel Blob browser uploads, JPEG compression (1600 px longest edge / quality 0.8), 5 MB maximum uploaded object, and a server-authorized cleanup endpoint for removed photos.
- Supabase Postgres tables for cycles, submissions, photo ownership, and idempotency locks; application data is retained for 90 days and removed by the scheduled endpoints.
- Slack Web API calls with 429/`Retry-After` handling, threaded/broadcast submission summaries, external native-file upload, and photo-link fallback.
- No-index metadata and a disallow-all `robots.txt` response.

## Brand assets and design choices

The only supplied color was KSC pink `#FFA8BD`; the additional live-site colors and exact font names were left blank. This project therefore uses a replaceable pastel palette in the `:root` CSS variables at the top of `app/globals.css`: cream/off-white surfaces, dark plum text, pale pink, mint, and lilac accents. It does **not** claim these are the site's complete live palette.

The interface uses **Nunito** for headings and body text as a compact, readable fallback; KSC's exact brand font has not been verified. It is loaded through `next/font/google`. Replace the import in `app/layout.js` when the approved font is available. No custom font files are included. If licensed fonts are supplied, place their `.woff2` files in `public/fonts/`, switch to `next/font/local`, and retain the `--font-heading` / `--font-body` variables.

`public/ksc-logo.svg` is a simple **KSC placeholder wordmark**, not an official logo. Replace it with the approved KSC artwork at the same path (or update the image references). The reference thumbnails are optional; each default style has no image.

## Local development

Requirements: Node.js 22.x and npm.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Before testing APIs locally, create a Supabase project, run `supabase/schema.sql` in its SQL Editor, and fill `.env.local`. The home page at `/` is intentionally just a team-only message. A real form link is created by `/api/cron/send` after Supabase and Slack are configured.

Production build:

```sh
npm run build
npm start
```

## GitHub and Vercel deployment

1. Create a GitHub repository and push the contents of this folder (the folder itself is the repository root; do not nest the project one level deeper).
2. In Vercel, choose **Add New → Project**, import the GitHub repository, select **Next.js** as the Framework Preset, and use Node.js **22.x** in Project Settings → General → Node.js Version.
3. Create a **Supabase project**. In Supabase **SQL Editor**, run the complete contents of `supabase/schema.sql` once. This creates the required tables with Row Level Security enabled and no client policies.
4. In Supabase **Project Settings → API** (or API Keys), copy the Project URL and the server-only `service_role` key. Set them in Vercel as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Do not use the anon/publishable key for these server operations, and never expose the service-role key as a `NEXT_PUBLIC_*` variable.
5. In Vercel **Storage** or **Marketplace**, connect/create a **Vercel Blob** store (adds `BLOB_READ_WRITE_TOKEN`). Photos are stored in Blob; operational records are stored in Supabase.
6. In **Settings → Environment Variables**, add the variables listed below. Use **Production** for the live app. Add them to **Preview** if preview deployments should be testable, and to **Development** if you use `vercel dev`. For `APP_BASE_URL`, set the public origin of that environment; scheduled jobs should always point at the Production URL. Do not put real values in GitHub or commit `.env.local`.
7. Click **Deploy**. After adding or changing environment variables later, trigger a **new redeployment**; existing deployments do not receive changed variables.
8. After deploy, open `https://YOUR-PRODUCTION-DOMAIN/api/health`. It reports booleans for environment-variable presence and a Supabase reachability boolean only; it never returns secret values.
9. Use the existing Slack app and schedule cron-job.org as described below. Vercel Cron is deliberately not configured in this repository.

## Supabase database setup

The SQL file `supabase/schema.sql` creates these tables:

- `ksc_cycles`: signed-form cycle metadata, Slack alert thread data, reminder status, and submission summary fields.
- `ksc_submissions`: latest JSON submission for a cycle; a repeat submission replaces this row.
- `ksc_uploaded_photos`: verifies that each photo URL was uploaded by the signed form for that cycle.
- `ksc_locks`: unique, expiring lock rows prevent duplicate alert/reminder/submission work when requests overlap.

All four tables have Row Level Security enabled and client roles are not granted access. The app uses `SUPABASE_SERVICE_ROLE_KEY` only in server-side routes. The alert and reminder endpoints prune records older than 90 days. Never put the service-role key in browser code, a public repository, or a `NEXT_PUBLIC_` variable.

## Slack app setup

Use your existing Slack app; this project does not require creating a new app or using the included manifest. Confirm that the bot has `chat:write` and `files:write` scopes (the bot must also be invited to the target channel). Copy its **Bot User OAuth Token** (`xoxb-…`) into Vercel as `SLACK_BOT_TOKEN`; never share or commit the token.

Invite the bot to the alert channel with `/invite @botname`, replacing `@botname` with its actual Slack name. Use the channel ID such as `C0123456789`, not `#channel-name`, for `SLACK_ALERT_CHANNEL_ID`. Optionally set `SLACK_RESULTS_CHANNEL_ID` to another channel ID; if it is empty, results stay in the alert thread. For the temporary test-mode flow below, point `SLACK_ALERT_CHANNEL_ID` at a dedicated testing channel.

The Slack alert and result use ten `:pinkline:` emoji shortcodes as a divider. Slack will render them as pink artwork only if this workspace has a custom emoji named `pinkline`; otherwise Slack may display the shortcode text.

## Environment variables

| Name | Required | Example / format | Notes |
|---|---:|---|---|
| `SLACK_BOT_TOKEN` | Yes | `xoxb-1234567890-1234567890-abcdefghijklmnop` | Bot User OAuth Token. Keep server-only. |
| `SLACK_ALERT_CHANNEL_ID` | Yes | `C0123456789` | Channel ID for `disney-team`, not the channel name. |
| `SLACK_RESULTS_CHANNEL_ID` | No | `C0123456789` | Defaults to the alert channel. A different channel receives a top-level summary mirror because Slack cannot thread across channels. |
| `SLACK_ALERT_MENTION` | No | `<!here>` | Defaults to `<!here>`. Set to an explicitly empty value to disable mentions. |
| `FORM_SECRET` | Yes | Long random value, e.g. generated by `openssl rand -base64 48` | HMAC key for form links. Never expose it. |
| `CRON_SECRET` | Yes | A second, separate long random value | Cron `Authorization` bearer value. Never expose it. |
| `APP_BASE_URL` | Yes | `https://ksc-topping-update.vercel.app` | Public site origin, HTTPS in production, no path/trailing slash. |
| `BLOB_READ_WRITE_TOKEN` | Yes | `vercel_blob_rw_…` | Added by connecting a Vercel Blob store. Server-only. |
| `SUPABASE_URL` | Yes | `https://<project-ref>.supabase.co` | Project URL from Supabase API settings. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | `<service-role secret>` | Server-only key. Never use as `NEXT_PUBLIC_*`. |
| `APP_TIMEZONE` | No | `America/Los_Angeles` | Defaults to `America/Los_Angeles`; use a valid IANA time zone. Keep this default for the Pacific schedules below. |
| `LOCATIONS` | No | `Disney CA, Downtown Disney` | Comma-separated dropdown choices; defaults to `Disney CA`. |
| `STYLES_JSON` | No | `[ {"id":"style-1","name":"Topping A"}, ... ]` | Valid JSON array with exactly 28 unique `{id,name,imageUrl?}` items. `imageUrl` must be HTTP(S). If absent, `config/styles.js` supplies Style 1 … Style 28. |
| `REQUIRE_PHOTO` | No | `true` or `false` | Defaults to `true`. `false`, `0`, `no`, or `off` disables the required-photo check. |
| `SHOW_BAGS_FIELD` | No | `true` or `false` | Defaults to `true`. Hides the optional bags field when false. |
| `FORM_LINK_VALID_HOURS` | No | `72` | Defaults to 72; accepted range is 1–8760 hours. |
| `ENABLE_SLACK_TEST_MODE` | No | `true` only while testing | Defaults to off. Enables a temporary no-database Slack/form test tool; remove the variable and redeploy when testing is complete. |

### Generating the two secrets

Run these locally and use separate outputs for `FORM_SECRET` and `CRON_SECRET`:

```sh
openssl rand -base64 48
openssl rand -base64 48
```

## cron-job.org setup (recommended)

Schedules are intentionally external to the application. In cron-job.org, create four jobs and set each job's timezone to **America/Los_Angeles**. Use the production domain in place of `APP_BASE_URL`.

| Job | Schedule | URL | Method | Header |
|---|---|---|---|---|
| Alert — Thursday | Every Thursday at 23:00 | `APP_BASE_URL/api/cron/send` | GET | `Authorization: Bearer CRON_SECRET` |
| Alert — Sunday | Every Sunday at 23:00 | `APP_BASE_URL/api/cron/send` | GET | `Authorization: Bearer CRON_SECRET` |
| Reminder — Friday | Every Friday at 08:00 | `APP_BASE_URL/api/cron/reminder` | GET | `Authorization: Bearer CRON_SECRET` |
| Reminder — Monday | Every Monday at 08:00 | `APP_BASE_URL/api/cron/reminder` | GET | `Authorization: Bearer CRON_SECRET` |

For each job, select the cron-job.org timezone **America/Los_Angeles** (do not convert to a fixed UTC offset), enter the URL, select **GET**, and add the exact `Authorization` header. cron-job.org handles daylight saving time for its timezone-aware schedules.

To test an alert immediately, call `GET APP_BASE_URL/api/cron/send?force=1` with the same bearer header. `force=1` posts a fresh alert for the current Pacific date and refreshes that date's link expiry; use it carefully because it creates a real Slack post. Without `force=1`, a second alert for the same Pacific date is skipped. The reminder route intentionally has no force option: it can only post once for a cycle. To test it, send an alert, leave the cycle unsubmitted, and call `GET APP_BASE_URL/api/cron/reminder` with the bearer header.

### Optional Vercel Pro Cron alternative

Vercel Cron uses UTC. If you intentionally switch away from cron-job.org, create duplicate UTC entries for both daylight-saving offsets and pass `guard=pacific` so only the entry that lands inside the correct local hour acts. Keep `APP_TIMEZONE=America/Los_Angeles`. Use `0 6 * * 5` and `0 7 * * 5` for the Thursday 23:00 alert, and `0 6 * * 1` and `0 7 * * 1` for the Sunday 23:00 alert; all call `/api/cron/send?guard=pacific`. For reminders, use `0 15 * * 5` and `0 16 * * 5` for Friday 08:00, and `0 15 * * 1` and `0 16 * * 1` for Monday 08:00; call `/api/cron/reminder?guard=pacific`. The send guard accepts only Thursday/Sunday 23:00–23:59 local time; the reminder guard accepts only Friday/Monday 08:00–08:59 local time. The duplicate entry that lands at the wrong local hour returns `{ "skipped": true }`. This ZIP does **not** contain a `vercel.json` `crons` block; add Vercel Cron configuration only if you deliberately choose that alternative.

## API behavior

- `GET|POST /api/cron/send`: requires `Authorization: Bearer <CRON_SECRET>`. Creates one cycle per current timezone date, signs its form link, posts a Block Kit alert, saves the alert channel/timestamp to Supabase, and skips duplicate dates unless `?force=1`.
- `GET|POST /api/cron/reminder`: same authorization. Checks the latest cycle and posts one threaded reminder only if no submission exists.
- `GET /f/[token]`: verifies the signed link and expiry on the server. Invalid, expired, missing, or unavailable links show a branded message with no stack trace.
- `POST /api/upload`: Vercel Blob client-upload handler. It validates the signed form link before issuing an upload token, restricts content types to JPEG/PNG/WebP/HEIC, and caps each object at 5 MB. Only photo URLs registered in Supabase for that cycle are accepted at submit time.
- `POST /api/upload/delete`: authenticated best-effort cleanup used when a worker removes a photo or changes a style to Not Needed.
- `POST /api/submit`: validates name, location, exactly 28 unique answers, status values, needed-style photos, and bags values. Supabase persistence happens before Slack delivery, so a Slack failure does not discard the submission. A repeated submission replaces the current cycle's saved version and is labelled “Updated submission”.
- `GET /api/health`: booleans only for configured environment-variable names plus Supabase reachability.
- `POST /api/test/start` and `POST /api/test/submit`: only active when `ENABLE_SLACK_TEST_MODE=true`; provide a temporary form and Slack thread test without database writes. The test console is at `/test-console`.

If `SLACK_RESULTS_CHANNEL_ID` differs from the alert channel, Slack does not permit replying to a thread in one channel from another channel. To preserve the requested alert-thread reply/broadcast, the app posts the canonical reply (and Slack file attachments) in the alert thread, then mirrors the summary as a top-level message in the configured results channel.

## Updating styles and locations

The default 28 objects are in `config/styles.js` and use IDs `style-1` through `style-28`. You may rename them there, or set `STYLES_JSON` in the deployment environment. The override must be a JSON array of **exactly 28** entries with unique simple IDs and non-empty names. Example shape (include all 28 objects in the real value):

```json
[
  { "id": "style-1", "name": "Pink Cloud", "imageUrl": "https://example.com/pink-cloud.jpg" },
  { "id": "style-2", "name": "Strawberry Sprinkle" }
]
```

Locations are a comma-separated list such as `Disney CA, Downtown Disney`. The first location is the fallback selection unless `Disney CA` is present, in which case Disney CA is selected by default.

## Smoke-test plan

1. Open `/api/health`. Confirm `supabaseReachable: true` and that required variable flags are true. This endpoint does not reveal any values.
2. From a terminal, run an authenticated `GET APP_BASE_URL/api/cron/send?force=1`. Confirm a JSON success response and the alert Block Kit message/button in the target Slack channel. The button URL should use the production origin and be signed.
3. Open the form link on an iPhone or Android phone. Check the logo, 28 styles, mobile one-column layout, date, and location. Mark one style Needed, take/select a photo, wait for the upload bar/preview, and mark every other style.
4. Submit. Confirm the success counts and Needed list. In Slack, confirm the summary is a broadcast thread reply and that the photo appears as a native Slack file in that same thread. If Slack file upload is blocked, the thread should contain the photo-link fallback and the saved submission should remain intact.
5. Test reminders before submitting a test cycle by calling `/api/cron/reminder` with the bearer header. Confirm one thread reminder and that a second call reports it was already posted. Submit that cycle and call again; it should skip because the cycle is submitted.
6. Test link expiry using a short `FORM_LINK_VALID_HOURS` in a non-production environment, send a new forced alert, wait until expiry, and confirm the branded expired-link message. Do not shorten the production setting just for this test.
7. Reopen a submitted link. Confirm the “Already submitted by …” notice. Submit a changed answer again; Slack should label it “Updated submission” and Supabase should contain the latest version.
8. Optional checks: set `SLACK_ALERT_MENTION` empty to disable the ping; set `REQUIRE_PHOTO=false`; set `SHOW_BAGS_FIELD=false`; and verify the corresponding form behavior in a Preview deployment.


## Temporary Slack/form test without Supabase

The temporary test mode is for checking the form UI and Slack alert/reply while Supabase is not configured. It does **not** test Blob photo uploads, database persistence, reminders, or production cron behavior. Test responses are not saved; the temporary link expires after 30 minutes.

1. Set `SLACK_ALERT_CHANNEL_ID` to a dedicated Slack testing channel and invite the existing bot to it.
2. In Vercel Production Environment Variables, set `ENABLE_SLACK_TEST_MODE=true` and redeploy the test-mode code.
3. Open `https://YOUR-PRODUCTION-DOMAIN/test-console`. Enter `CRON_SECRET` directly into the page (do not paste it into Slack or chat) and choose **Send test alert to Slack**.
4. Open the clearly labeled test alert in Slack, then use its button to fill all 28 styles. Photos are disabled. Submit; the result appears as a clearly labeled reply in the same Slack thread but is not saved.
5. When finished, remove `ENABLE_SLACK_TEST_MODE` from Vercel and redeploy. The test console and test links will then be disabled.

The test trigger uses the `CRON_SECRET` authorization header. Test links are HMAC-signed with `FORM_SECRET`, restricted to the configured alert channel, and expire after 30 minutes. Do not leave test mode enabled longer than needed.

## Security and operational notes

- `FORM_SECRET`, `CRON_SECRET`, `SLACK_BOT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, and Blob credentials are server-only. Never commit them.
- The signed form token is a bearer link and must be treated as private. It is present in the form URL by design; the HMAC secret is not sent to the browser.
- API errors return clear messages and do not return stack traces or secret values. Slack API failure after a successful Supabase save returns a saved-success response with an explicit delivery warning.
- Supabase tables use Row Level Security and the service-role key is only read by server-side code. The Supabase client is never bundled into browser code.
- The app does not log tokens or secrets. `robots` disallows crawling, and the entire site has `noindex, nofollow` metadata.
- Photo objects are deleted after Slack confirms native file completion, and the UI best-effort deletes photos removed before submit. A user who uploads a photo and abandons the form without removing it can leave an unreferenced public Blob object; Vercel Blob does not provide automatic per-object expiry in this app, so review Blob storage periodically or add an organization-specific cleanup policy.
- Keep `APP_TIMEZONE` at `America/Los_Angeles` for the provided cron schedules and guards. IANA timezone formatting/weekday/hour checks are used; no UTC offset is hardcoded in runtime logic.

## Known limitations

- The project pins the specifically requested Next.js 14.2.x line. In this environment, `npm audit` reports a critical upstream vulnerability for Next.js 14.2.35; the available audit fix moves to a newer major version and would violate the requested stack constraint. The app uses no `next/image` optimizer or Server Actions, but that does not eliminate every upstream framework risk. For an internet-facing production service, plan a tested upgrade to a currently maintained, patched Next.js version when the stack constraint can change.
- Supabase, Slack, and Vercel Blob cannot be live-verified without your project/workspace credentials and stores. The package build can be verified locally; the end-to-end credentialed flow still needs the smoke tests above.
- A photo uploaded and then abandoned without using Remove may remain as an unreferenced public Blob object. Removed photos and photos successfully attached to Slack are deleted; abandoned uploads need periodic storage review or a separate cleanup policy.
- Slack cannot place a message in a thread owned by another channel. When the results channel differs from the alert channel, the app keeps the threaded/broadcast reply and native attachments in the alert channel and mirrors only the summary to the results channel.
- The additional colors, exact KSC fonts, and official logo were not supplied. The pastel colors, Fredoka/Nunito fonts, and SVG wordmark are clearly marked fallbacks/placeholders.
