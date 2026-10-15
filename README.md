# KSC Disney Topping Update

A mobile-first, KSC-branded Next.js app for scheduled Disney DIY Toppings kiosk checks. It creates signed form links, collects Bin 1–14, Needed/Not Needed, required bags-remaining counts, and display-time replacement flags for each of 28 styles; it requires photos for Needed or Replace, stores photos in Vercel Blob and cycles/submissions in Supabase Postgres, and posts a full Slack inventory summary with native photo files in the alert thread. **This version does not use Redis or Upstash.**

## What is included

- Next.js 14.2.35 App Router, React 18.3.1, plain JavaScript, and plain CSS.
- Signed `cycleId.hmac` links with configurable expiry and timezone-aware dates.
- Protected GET/POST alert and reminder cron routes. No Slack Workflow Builder, Events API, interactive endpoint, slash command, or signing secret is used.
- Twenty-eight default placeholder labels, `Style 1` through `Style 28`, in `config/styles.js`; no real topping names are invented. `STYLES_JSON` may replace them only if the operator later chooses to.
- A required Bin 1–14 selector (bins may be shared), Needed/Not Needed status, bags-remaining count, and explicit Yes/No replacement choice for display time on every style card. Photos are mandatory for any style marked Needed or Replace.
- Vercel Blob photo uploads through a same-origin server route, JPEG compression (1600 px longest edge / quality 0.8), browser-side HEIC/HEIF-to-JPEG conversion when needed, a 4 MiB compressed request cap to stay below Vercel Function body limits, a 5 MB storage-side object ceiling, and a server-authorized cleanup endpoint for removed photos.
- Supabase Postgres tables for cycles, submissions, photo ownership, and idempotency locks; application data is retained for 90 days and removed by the scheduled endpoints.
- Slack Web API calls with 429/`Retry-After` handling, threaded/broadcast submission summaries, external native-file upload, and photo-link fallback.
- No-index metadata and a disallow-all `robots.txt` response.

## Brand assets and design choices

The interface now follows Kawaii Slime Company's current site palette: KSC pink `#FFA8BD`, soft pink `#FFE6F0`, aqua blues `#7CD5F3` / `#9ADFF7` / `#C7EAF8`, yellow `#FFF28A`, warm brown `#8A5D3B`, white, and blush-card `#FFF5F9`. These are centralized as CSS variables in `app/globals.css`.

Typography follows the site's current theme: Quicksand for headings and body text, and Nunito for buttons. The variable WOFF2 files are self-hosted in `public/fonts/` so the app does not rely on an external font CDN; their SIL Open Font License files are included alongside them.

`public/ksc-logo.svg` remains a simple **KSC placeholder wordmark**, not an official logo; its colors are aligned with the site palette. Replace it with approved KSC artwork at the same path if supplied. The reference thumbnails are optional; each default style has no image.

## Local development

Requirements: Node.js 22.x and npm.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Before testing APIs locally, create a Supabase project, run `supabase/schema.sql` in its SQL Editor, and fill `.env.local`. The home page at `/` gives staff concise instructions to open the latest private Topping Update link in Slack. A real form link is created by `/api/cron/send` after Supabase and Slack are configured.

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
6. In **Settings → Environment Variables**, add the variables listed below. Use **Production** for the live app. Add them to **Preview** only if preview deployments should be testable, and to **Development** if you use `vercel dev`. For `APP_BASE_URL`, set the public origin of that environment; scheduled jobs should always point at the Production URL. Do not put real values in GitHub or commit `.env.local`.
7. Confirm the existing Slack app bot scopes and channel access as described below.
8. Click **Deploy**. After adding or changing environment variables later, trigger a **new redeployment**; existing deployments do not receive changed variables.
9. After deploy, open `https://YOUR-PRODUCTION-DOMAIN/api/health`. It reports booleans for environment-variable presence and a Supabase reachability boolean only; it never returns secret values.
10. Keep the already-configured and enabled cron-job.org schedule unchanged. The alert schedule remains Thursday and Sunday at 11 PM `America/Los_Angeles`; this project update requires no cron edits. Vercel Cron and a `vercel.json` cron block are not used.

## Supabase database setup

The SQL file `supabase/schema.sql` creates these tables:

- `ksc_cycles`: signed-form cycle metadata, Slack alert thread data, reminder status, and submission summary fields.
- `ksc_submissions`: latest JSON submission for a cycle; a repeat submission replaces this row.
- `ksc_uploaded_photos`: verifies that each photo URL was uploaded by the signed form for that cycle.
- `ksc_locks`: unique, expiring lock rows prevent duplicate alert/reminder/submission work when requests overlap.

All four tables have Row Level Security enabled and client roles are not granted access. The app uses `SUPABASE_SERVICE_ROLE_KEY` only in server-side routes. The alert and reminder endpoints prune records older than 90 days. Never put the service-role key in browser code, a public repository, or a `NEXT_PUBLIC_` variable.

## Slack app setup

Use your existing Slack app; this project does not require creating a new app or using the included manifest. Confirm that the bot has `chat:write` and `files:write` scopes (the bot must also be invited to the target channel). Copy its **Bot User OAuth Token** (`xoxb-…`) into Vercel as `SLACK_BOT_TOKEN`; never share or commit the token.

Invite the bot to the alert channel with `/invite @botname`, replacing `@botname` with its actual Slack name. Use the channel ID such as `C0123456789`, not `#channel-name`, for `SLACK_ALERT_CHANNEL_ID`. Optionally set `SLACK_RESULTS_CHANNEL_ID` to another channel ID; if it is empty, results stay in the alert thread. The temporary test tool posts to the configured alert channel; only change that target if you intentionally want an isolated testing channel.

The Slack alert and result use ten `:pinkline:` emoji shortcodes as a divider. Slack will render them as pink artwork only if this workspace has a custom emoji named `pinkline`; otherwise Slack may display the shortcode text.

## Environment variables

| Name | Required | Example / format | Notes |
|---|---:|---|---|
| `SLACK_BOT_TOKEN` | Yes | `xoxb-…` | Bot User OAuth Token. Keep server-only. |
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
| `STYLES_JSON` | No | `[ {"id":"style-1","name":"Style 1"}, ... ]` | Valid JSON array with exactly 28 unique `{id,name,imageUrl?}` items. `imageUrl` must be HTTP(S). If absent, `config/styles.js` supplies the selected Style 1 … Style 28 placeholders. |
| `FORM_LINK_VALID_HOURS` | No | `72` | Defaults to 72; accepted range is 1–8760 hours. |
| `ENABLE_SLACK_TEST_MODE` | No | `true` only while testing | Defaults to off. Enables a temporary no-database Slack/form test tool; remove the variable and redeploy when testing is complete. |

### Generating the two secrets

Run these locally and use separate outputs for `FORM_SECRET` and `CRON_SECRET`:

```sh
openssl rand -base64 48
openssl rand -base64 48
```

## Existing cron-job.org schedule

Per your existing setup, the cron-job.org configuration is already set up and enabled. This project update does not change or require recreating any cron jobs. Keep the alert schedule at **Thursday and Sunday, 23:00 (`America/Los_Angeles`)** and keep using the existing `Authorization: Bearer CRON_SECRET` header. Any separately configured reminder jobs remain unchanged. The schedule is external to this ZIP; there is no Redis/Upstash dependency, `vercel.json` cron block, or Vercel Cron setup here.

| Job | Schedule | URL | Method | Header |
|---|---|---|---|---|
| Alert | Thursday and Sunday at 23:00 `America/Los_Angeles` | `APP_BASE_URL/api/cron/send` | GET | `Authorization: Bearer CRON_SECRET` |

For an optional manual smoke test, `GET APP_BASE_URL/api/cron/send?force=1` with the existing bearer header posts a real Slack alert and refreshes that Pacific date's link expiry. Use it carefully. This update does not require cron changes.

## API behavior

- `GET|POST /api/cron/send`: requires `Authorization: Bearer <CRON_SECRET>`. Creates one cycle per current timezone date, signs its form link, posts a Block Kit alert, saves the alert channel/timestamp to Supabase, and skips duplicate dates unless `?force=1`.
- `GET|POST /api/cron/reminder`: same authorization. Checks the latest cycle and posts one threaded reminder only if no submission exists.
- `GET /f/[token]`: verifies the signed link and expiry on the server. Invalid, expired, missing, or unavailable links show a branded message with no stack trace. Form links are **not single-use**: after the first submit, they remain valid through the configured period (72 hours by default) and can be submitted again to update the saved response.
- `POST /api/upload`: validates the signed form link, JPEG/PNG/WebP/HEIC content type, and per-object size; compressed form photos are sent through the same-origin route and stored in Vercel Blob. Only photo URLs registered in Supabase for that cycle are accepted at submit time.
- `POST /api/upload/delete`: best-effort cleanup used when a worker removes a photo or changes a style so neither Needed nor Replace requires its photo.
- `POST /api/submit`: validates name, location, exactly 28 unique answers, Bin 1–14 for every style, Needed/Not Needed status, required whole-number bag counts, replacement flags, and a photo for every style marked Needed or Replace. Supabase persistence happens before Slack delivery, so a Slack failure does not discard the submission. A repeated submission replaces the current cycle's saved version and is labelled “Updated submission”.
- `GET /api/health`: booleans only for configured environment-variable names plus Supabase reachability; it never returns secret values.
- `POST /api/test/start` and `POST /api/test/submit`: only active when `ENABLE_SLACK_TEST_MODE=true`; provide a temporary form and Slack thread test without database writes. The test console is at `/test-console` and uses the `CRON_SECRET` authorization flow.


If `SLACK_RESULTS_CHANNEL_ID` differs from the alert channel, Slack does not permit replying to a thread in one channel from another channel. To preserve the requested alert-thread reply/broadcast, the app posts the canonical reply (and Slack file attachments) in the alert thread, then mirrors the summary as a top-level message in the configured results channel.

## Updating styles and locations

The current default values intentionally remain the placeholders `Style 1` through `Style 28`, with IDs `style-1` through `style-28`; no topping names were supplied or invented. `STYLES_JSON` can override them only if you choose to do so later. Any override must be a JSON array of **exactly 28** entries with unique simple IDs and non-empty names. Generic shape (include all 28 objects in the real value):

```json
[
  { "id": "style-1", "name": "Style 1" },
  { "id": "style-2", "name": "Style 2" }
]
```

Locations are a comma-separated list such as `Disney CA, Downtown Disney`. The first location is the fallback selection unless `Disney CA` is present, in which case Disney CA is selected by default.

## Smoke-test plan

1. Open `/api/health`. Confirm `supabaseReachable: true` and expected environment-variable booleans. This endpoint never returns secret values.
2. Open the form link on an iPhone or Android phone. Check the logo, placeholder labels `Style 1` through `Style 28`, mobile layout, date, and location. For all 28 styles, choose a bin (sharing is allowed), status, whole-number bags count, and an explicit Yes/No replacement answer; upload photos for every Needed or Replace=Yes style.
3. Submit. Confirm the Needed and Replace counts/lists include bins and bags. In Slack, confirm the broadcast thread reply contains the complete 28-row inventory (bin, style, status, bags, replacement flag) and the photos for Needed/Replace styles appear as native Slack files. If Slack file upload is blocked, the thread should contain photo-link fallbacks and the saved submission should remain intact.
4. Reopen the same submitted link while it is still valid. Confirm the “Already submitted by …” notice. Submit a changed answer again; Slack should label it “Updated submission” and Supabase should contain the latest version. The link remains usable for its configured period (default 72 hours).
5. If temporary test mode is enabled, visit `/test-console`, enter `CRON_SECRET` directly into the page, start a test, and verify the Slack reply is clearly labeled, includes bins/bag counts/replacement flags, and the response is not saved. Photos remain disabled in test mode. Turn test mode off again when finished.
6. Existing cron-job.org jobs are already configured and enabled; do not recreate them for this update. If needed, use the existing authenticated `/api/cron/reminder` test procedure, or test alert sending in a non-production environment to avoid an unnecessary production Slack post.
7. Test link expiry using a short `FORM_LINK_VALID_HOURS` in a non-production environment, then confirm the branded expired-link message. Do not shorten the production setting just for this test. Optional check: set `SLACK_ALERT_MENTION` empty in a Preview deployment and verify mentions are disabled. Photo requirements and bags fields are mandatory and are not configurable off.


## Temporary Slack/form test without Supabase

The temporary test mode checks the form UI and Slack alert/reply without Supabase. It does **not** test Blob photo uploads, database persistence, reminders, or production cron behavior. Test responses are not saved, photos are disabled, and each test link expires after 30 minutes.

1. Confirm `SLACK_ALERT_CHANNEL_ID` points to an appropriate channel for a clearly labeled test alert, and that the existing bot is invited there. The test tool posts to the configured channel.
2. In Vercel Environment Variables, set `ENABLE_SLACK_TEST_MODE=true` and redeploy.
3. Open `https://YOUR-PRODUCTION-DOMAIN/test-console`. Enter `CRON_SECRET` directly into the page over HTTPS (do not paste it into Slack or chat) and choose **Send test alert to Slack**.
4. Open the clearly labeled test alert in Slack, then use its button to fill all 28 placeholder styles with a bin, status, bags-remaining count, and replacement flag. Photos are disabled. Submit; the full inventory result appears as a clearly labeled reply in the same Slack thread but is not saved.
5. When finished, remove or set `ENABLE_SLACK_TEST_MODE=false` and redeploy. The test console and test links will then be disabled.

The test trigger uses the `CRON_SECRET` authorization header. Test links are HMAC-signed with `FORM_SECRET`, restricted to the configured alert channel, and expire after 30 minutes. Do not leave test mode enabled longer than needed.

## Security and operational notes

- `FORM_SECRET`, `CRON_SECRET`, `SLACK_BOT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, and Blob credentials are server-only. Never commit or share them.
- The signed form token is a bearer link and must be treated as private. It is present in the form URL by design; the HMAC secret is not sent to the browser. A valid form link remains open for the configured period and allows updates after the first submission.
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
- The colors and font families now follow the public KSC site theme; the SVG KSC wordmark is still a placeholder because an approved official logo asset was not supplied.
