# KSC Disney Topping Update

A mobile-first, KSC-branded Next.js app for scheduled Disney DIY Toppings kiosk checks. It creates signed form links, records one of 28 style answers, receives photos directly into Vercel Blob, stores operational records in Supabase Postgres, and posts a Slack summary with native Slack photo files in the alert thread. Optional Slack OpenID Connect plus a five-digit Slack-DM OTP protects staff forms and the temporary test console with one-use codes and 24-hour sessions. **This version does not use Redis or Upstash.**

## What is included

- Next.js 14.2.35 App Router, React 18.3.1, plain JavaScript, and plain CSS.
- Signed `cycleId.hmac` links with configurable expiry and timezone-aware dates.
- Protected GET/POST alert and reminder cron routes. No Slack Workflow Builder, Events API, interactive endpoint, slash command, or signing secret is used.
- Twenty-eight default placeholder labels, `Style 1` through `Style 28`, in `config/styles.js`; no real topping names are invented. `STYLES_JSON` may replace them only if the operator later chooses to.
- Optional Slack OpenID Connect sign-in, verified Slack workspace identity, a one-use five-digit DM code (five-minute expiry, five attempts, 60-second resend cooldown), and a shared 24-hour session for staff forms and the temporary test console. The original OTP DM is edited after a successful code use.
- Vercel Blob photo uploads through a same-origin server route, JPEG compression (1600 px longest edge / quality 0.8), browser-side HEIC/HEIF-to-JPEG conversion when needed, a 4 MiB compressed request cap to stay below Vercel Function body limits, a 5 MB storage-side object ceiling, and a server-authorized cleanup endpoint for removed photos.
- Supabase Postgres tables for cycles, submissions, photo ownership, and idempotency locks; application data is retained for 90 days and removed by the scheduled endpoints.
- Slack Web API calls with 429/`Retry-After` handling, threaded/broadcast submission summaries, external native-file upload, and photo-link fallback.
- No-index metadata and a disallow-all `robots.txt` response.

## Brand assets and design choices

The only supplied color was KSC pink `#FFA8BD`; the additional live-site colors and exact font names were left blank. This project therefore uses a replaceable pastel palette in the `:root` CSS variables at the top of `app/globals.css`: cream/off-white surfaces, dark plum text, pale pink, mint, and lilac accents. It does **not** claim these are the site's complete live palette.

The interface uses a readable system-font fallback stack (`Nunito` is named in CSS but is not downloaded from an external font service). KSC's exact brand font has not been verified. If licensed fonts are supplied, place their `.woff2` files in `public/fonts/` and update the `--font-heading` / `--font-body` variables in `app/globals.css`.

`public/ksc-logo.svg` is a simple **KSC placeholder wordmark**, not an official logo. Replace it with the approved KSC artwork at the same path (or update the image references). The reference thumbnails are optional; each default style has no image.

## Local development

Requirements: Node.js 22.x and npm.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Before testing APIs locally, create a Supabase project, run the complete current `supabase/schema.sql` in its SQL Editor, and fill `.env.local`. The updated SQL is idempotent for an existing app database and adds the OTP challenge/session tables. Slack OTP can stay disabled locally unless you also configure the Slack OAuth redirect URI for the local origin. The home page at `/` gives staff concise instructions to open the latest private Topping Update link in Slack. A real form link is created by `/api/cron/send` after Supabase and Slack are configured.

Production build:

```sh
npm run build
npm start
```

## GitHub and Vercel deployment

1. Create a GitHub repository and push the contents of this folder (the folder itself is the repository root; do not nest the project one level deeper).
2. In Vercel, choose **Add New → Project**, import the GitHub repository, select **Next.js** as the Framework Preset, and use Node.js **22.x** in Project Settings → General → Node.js Version.
3. Create a **Supabase project**. In Supabase **SQL Editor**, run the complete current contents of `supabase/schema.sql`. For an existing deployment, re-run the updated file once; it is designed to retain existing data and add the OTP challenge/session tables and atomic one-use-code verifier. The app tables use Row Level Security and have no client policies.
4. In Supabase **Project Settings → API** (or API Keys), copy the Project URL and the server-only `service_role` key. Set them in Vercel as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Do not use the anon/publishable key for these server operations, and never expose the service-role key as a `NEXT_PUBLIC_*` variable.
5. In Vercel **Storage** or **Marketplace**, connect/create a **Vercel Blob** store (adds `BLOB_READ_WRITE_TOKEN`). Photos are stored in Blob; operational records are stored in Supabase.
6. In **Settings → Environment Variables**, add the variables listed below. Use **Production** for the live app. Add them to **Preview** only if preview deployments should be testable, and to **Development** if you use `vercel dev`. For `APP_BASE_URL`, set the public origin of that environment; scheduled jobs should always point at the Production URL. Do not put real values in GitHub or commit `.env.local`.
7. Configure the existing Slack app as described below. Keep `ENABLE_SLACK_OTP_AUTH=false` until the updated SQL has been run and the Slack OAuth redirect URL, scopes, `SLACK_CLIENT_ID`, and `SLACK_CLIENT_SECRET` are in place. Then set it to `true` and redeploy to require OTP on staff forms and the test console.
8. Click **Deploy**. After adding or changing environment variables later, trigger a **new redeployment**; existing deployments do not receive changed variables.
9. After deploy, open `https://YOUR-PRODUCTION-DOMAIN/api/health`. It reports booleans for environment-variable presence and a Supabase reachability boolean only; it never returns secret values.
10. Keep the already-configured and enabled cron-job.org schedule unchanged. The alert schedule remains Thursday and Sunday at 11 PM `America/Los_Angeles`; the OTP update requires no cron edits. Vercel Cron and a `vercel.json` cron block are not used.

## Supabase database setup

The SQL file `supabase/schema.sql` creates these tables:

- `ksc_cycles`: signed-form cycle metadata, Slack alert thread data, reminder status, and submission summary fields.
- `ksc_submissions`: latest JSON submission for a cycle; a repeat submission replaces this row.
- `ksc_uploaded_photos`: verifies that each photo URL was uploaded by the signed form for that cycle.
- `ksc_locks`: unique, expiring lock rows prevent duplicate alert/reminder/submission work when requests overlap.
- `ksc_auth_challenges`: short-lived OTP challenge hashes, purpose, Slack identity, return path, and DM message reference; the five-digit code itself is never stored.
- `ksc_auth_sessions`: hashed random session tokens, Slack identity, and expiry; sessions last 24 hours and are shared across staff forms and the temporary test console.
- `ksc_consume_auth_challenge(...)`: a service-role-only Postgres function that atomically checks expiry/attempt count and consumes each valid code once.

All six tables have Row Level Security enabled and client roles are not granted access. The app uses `SUPABASE_SERVICE_ROLE_KEY` only in server-side routes. The alert and reminder endpoints prune operational records older than 90 days; OTP challenge rows and expired sessions are periodically cleaned during authentication. Never put the service-role key in browser code, a public repository, or a `NEXT_PUBLIC_` variable.

## Slack app setup

Use your existing Slack app; this project does not require creating a new app. For the OTP flow, set the OAuth Redirect URL to the exact value `APP_BASE_URL/api/auth/slack/callback` (for example, `https://your-production-domain.example/api/auth/slack/callback`). Add the **User Token Scopes** `openid`, `profile`, and `email`. The existing bot scopes must include `chat:write`, `files:write`, and `im:write` (keep any existing scopes such as `chat:write.public`). `im:write` lets the bot open a direct-message conversation; `chat:write` posts and edits the OTP message. Save the Slack app changes and reinstall/re-authorize the app in the Disney workspace so the new bot and user scopes are granted. OpenID identity and the DM code are separate steps; no Slack signing secret, Events API, or interactivity endpoint is used.

Copy the app's **Client ID** and **Client Secret** from Slack **Basic Information** into Vercel as `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`. Keep the **Bot User OAuth Token** (`xoxb-…`) in the server-only `SLACK_BOT_TOKEN` variable; never share or commit secrets. The OAuth flow requests the bot's workspace ID and verifies the returned Slack user belongs to that same workspace before sending a code.

The bot must be invited to the alert channel with `/invite @botname`, replacing `@botname` with its actual Slack name. Use the channel ID such as `C0123456789`, not `#channel-name`, for `SLACK_ALERT_CHANNEL_ID`. Optionally set `SLACK_RESULTS_CHANNEL_ID` to another channel ID; if it is empty, results stay in the alert thread. The temporary test tool posts to the configured alert channel; only change that target if you intentionally want an isolated testing channel.

The Slack alert and result use ten `:pinkline:` emoji shortcodes as a divider. Slack will render them as pink artwork only if this workspace has a custom emoji named `pinkline`; otherwise Slack may display the shortcode text.

## Environment variables

| Name | Required | Example / format | Notes |
|---|---:|---|---|
| `SLACK_BOT_TOKEN` | Yes | `xoxb-…` | Bot User OAuth Token. Keep server-only. |
| `SLACK_CLIENT_ID` | When OTP is enabled | `<Slack app Client ID>` | OAuth client identifier used for Slack OpenID Connect. |
| `SLACK_CLIENT_SECRET` | When OTP is enabled | `<Slack app Client Secret>` | OAuth secret; server-only. Never commit or share it. |
| `ENABLE_SLACK_OTP_AUTH` | Optional, default `false` | `true` or `false` | Turn on only after the auth SQL, Slack redirect/scopes, and OAuth variables are configured. Requires Slack OTP for staff forms and the temporary test console. |
| `SLACK_ALERT_CHANNEL_ID` | Yes | `C0123456789` | Channel ID for `disney-team`, not the channel name. |
| `SLACK_RESULTS_CHANNEL_ID` | No | `C0123456789` | Defaults to the alert channel. A different channel receives a top-level summary mirror because Slack cannot thread across channels. |
| `SLACK_ALERT_MENTION` | No | `<!here>` | Defaults to `<!here>`. Set to an explicitly empty value to disable mentions. |
| `FORM_SECRET` | Yes | Long random value, e.g. generated by `openssl rand -base64 48` | HMAC key for form links. Never expose it. |
| `CRON_SECRET` | Yes | A second, separate long random value | Cron `Authorization` bearer value. Never expose it. |
| `APP_BASE_URL` | Yes | `https://ksc-topping-update.vercel.app` | Public site origin, HTTPS in production, no path/trailing slash. Slack OAuth callback is `${APP_BASE_URL}/api/auth/slack/callback`. |
| `BLOB_READ_WRITE_TOKEN` | Yes | `vercel_blob_rw_…` | Added by connecting a Vercel Blob store. Server-only. |
| `SUPABASE_URL` | Yes | `https://<project-ref>.supabase.co` | Project URL from Supabase API settings. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | `<service-role secret>` | Server-only key. Never use as `NEXT_PUBLIC_*`. |
| `APP_TIMEZONE` | No | `America/Los_Angeles` | Defaults to `America/Los_Angeles`; use a valid IANA time zone. Keep this default for the Pacific schedules below. |
| `LOCATIONS` | No | `Disney CA, Downtown Disney` | Comma-separated dropdown choices; defaults to `Disney CA`. |
| `STYLES_JSON` | No | `[ {"id":"style-1","name":"Style 1"}, ... ]` | Valid JSON array with exactly 28 unique `{id,name,imageUrl?}` items. `imageUrl` must be HTTP(S). If absent, `config/styles.js` supplies the selected Style 1 … Style 28 placeholders. |
| `REQUIRE_PHOTO` | No | `true` or `false` | Defaults to `true`. `false`, `0`, `no`, or `off` disables the required-photo check. |
| `SHOW_BAGS_FIELD` | No | `true` or `false` | Defaults to `true`. Hides the optional bags field when false. |
| `FORM_LINK_VALID_HOURS` | No | `72` | Defaults to 72; accepted range is 1–8760 hours. |
| `ENABLE_SLACK_TEST_MODE` | No | `true` only while testing | Defaults to off. Enables a temporary Slack/form test tool with no operational submission writes; OTP challenge/session rows are still stored in Supabase if OTP auth is enabled. Remove/disable it and redeploy when testing is complete. |

### Generating the two secrets

Run these locally and use separate outputs for `FORM_SECRET` and `CRON_SECRET`:

```sh
openssl rand -base64 48
openssl rand -base64 48
```

## Existing cron-job.org schedule

Per your existing setup, the cron-job.org configuration is already set up and enabled. This OTP update does not change or require recreating any cron jobs. Keep the alert schedule at **Thursday and Sunday, 23:00 (`America/Los_Angeles`)** and keep using the existing `Authorization: Bearer CRON_SECRET` header. Any separately configured reminder jobs remain unchanged. The schedule is external to this ZIP; there is no Redis/Upstash dependency, `vercel.json` cron block, or Vercel Cron setup here.

| Job | Schedule | URL | Method | Header |
|---|---|---|---|---|
| Alert | Thursday and Sunday at 23:00 `America/Los_Angeles` | `APP_BASE_URL/api/cron/send` | GET | `Authorization: Bearer CRON_SECRET` |

For an optional manual smoke test, `GET APP_BASE_URL/api/cron/send?force=1` with the existing bearer header posts a real Slack alert and refreshes that Pacific date's link expiry. Use it carefully. No cron changes are needed to enable Slack OTP.

## API behavior

- `GET|POST /api/cron/send`: requires `Authorization: Bearer <CRON_SECRET>`. Creates one cycle per current timezone date, signs its form link, posts a Block Kit alert, saves the alert channel/timestamp to Supabase, and skips duplicate dates unless `?force=1`.
- `GET|POST /api/cron/reminder`: same authorization. Checks the latest cycle and posts one threaded reminder only if no submission exists.
- `GET /api/auth/slack/start`: validates the requested purpose and same-site return path, then starts Slack OpenID Connect using signed state and a nonce. `/api/auth/slack/callback` accepts Slack's OIDC callback, verifies the signed identity and workspace, and DMs a five-digit OTP.
- `GET /auth/verify` and `POST /api/auth/otp/verify`: verify a code for five minutes, allow at most five attempts, consume it atomically once, and edit the original Slack DM to mark it used. Successful verification creates a shared 24-hour session.
- When `ENABLE_SLACK_OTP_AUTH=true`, `GET /f/[token]`, form submit/photo APIs, `/test-console`, test forms, and test APIs require the session. With the flag off, existing signed-link/CRON_SECRET behavior remains for a staged rollout. `CRON_SECRET` continues to protect scheduled cron routes.
- `GET /f/[token]`: verifies the signed link and expiry on the server. Invalid, expired, missing, or unavailable links show a branded message with no stack trace. Form links are **not single-use**: after the first submit, a link remains valid through its configured period (72 hours by default) and the form can be submitted again to update the saved response; OTP/session expiry does not consume or extend the form link.
- `POST /api/upload`: validates the signed form link, staff session when enabled, JPEG/PNG/WebP/HEIC content type, and per-object size; compressed form photos are sent through the same-origin route and stored in Vercel Blob. Only photo URLs registered in Supabase for that cycle are accepted at submit time.
- `POST /api/upload/delete`: staff-session-protected best-effort cleanup when a worker removes a photo or changes a style to Not Needed.
- `POST /api/submit`: validates name, location, exactly 28 unique answers, status values, needed-style photos, and bags values. Supabase persistence happens before Slack delivery, so a Slack failure does not discard the submission. A repeated submission replaces the current cycle's saved version and is labelled “Updated submission”.
- `GET /api/health`: booleans only for configured environment-variable names plus Supabase reachability; it never returns secret values.
- `POST /api/test/start` and `POST /api/test/submit`: only active when `ENABLE_SLACK_TEST_MODE=true`; provide a temporary form and Slack thread test without database writes. With OTP enabled, Slack sign-in replaces the test console's CRON_SECRET prompt. The test console is at `/test-console`.

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
2. With `ENABLE_SLACK_OTP_AUTH=true`, open a valid staff link and choose **Sign in with Slack**. Confirm the DM contains a five-digit code, a correct code works once, the original DM is edited after use, and the resulting session works across staff/test-console access for 24 hours.
3. Open the form link on an iPhone or Android phone. Check the logo, the placeholder labels `Style 1` through `Style 28`, mobile layout, date, and location. Mark a style Needed, take/select a photo, wait for the upload bar/preview, and mark every other style.
4. Submit. Confirm the success counts and Needed list. In Slack, confirm the summary is a broadcast thread reply and the photo appears as a native Slack file in that thread. If Slack file upload is blocked, the thread should contain the photo-link fallback and the saved submission should remain intact.
5. Reopen the same submitted link while it is still valid. Confirm the “Already submitted by …” notice. Submit a changed answer again; Slack should label it “Updated submission” and Supabase should contain the latest version. The form link remains usable for its configured period (default 72 hours); OTP does not make it single-use.
6. If temporary test mode is enabled, visit `/test-console`, authenticate with Slack OTP, start a test, and verify the temporary test form also requires a session. The test response should appear in Slack but should not be saved. Turn test mode off again when finished.
7. Existing cron-job.org jobs are already configured and enabled; do not recreate them for this update. If needed, use the existing authenticated `GET /api/cron/reminder` test procedure, or test alert sending in a non-production environment to avoid an unnecessary production Slack post.
8. Test link expiry using a short `FORM_LINK_VALID_HOURS` in a non-production environment, then confirm the branded expired-link message. Do not shorten the production setting just for this test. Optional configuration checks: set `SLACK_ALERT_MENTION` empty, `REQUIRE_PHOTO=false`, or `SHOW_BAGS_FIELD=false` in a Preview deployment and verify the corresponding behavior.


## Temporary Slack/form test

Temporary test mode checks the form UI and Slack alert/reply. Test responses are never saved, photos are disabled, and each test link expires after 30 minutes. It does not test Blob uploads, production submission storage, reminders, or scheduled cron behavior. If `ENABLE_SLACK_OTP_AUTH=true`, the code/session flow uses the Supabase auth tables; the test response itself still creates no database record.

1. Confirm `SLACK_ALERT_CHANNEL_ID` points to an appropriate channel for a clearly labeled test alert, and that the existing bot is invited there. The test tool posts to the configured channel.
2. In Vercel Environment Variables, set `ENABLE_SLACK_TEST_MODE=true` and redeploy.
3. Open `https://YOUR-PRODUCTION-DOMAIN/test-console`. With `ENABLE_SLACK_OTP_AUTH=true`, sign in with Slack and enter the DM code; no `CRON_SECRET` is entered into the console. If OTP is still disabled for staged rollout, the legacy console asks for `CRON_SECRET` directly over HTTPS; never paste it in Slack or chat.
4. Open the clearly labeled test alert in Slack, then use its button to fill all 28 placeholder styles. Submit; the result appears as a clearly labeled reply in the same Slack thread but is not saved.
5. When finished, remove or set `ENABLE_SLACK_TEST_MODE=false` and redeploy. The test console and test links will then be disabled.

When OTP is enabled, the test start and submit APIs require the 24-hour Slack session. In the legacy staged mode, the test trigger uses the `CRON_SECRET` authorization header. Test links are HMAC-signed with `FORM_SECRET`, restricted to the configured alert channel, and expire after 30 minutes. Do not leave test mode enabled longer than needed.

## Security and operational notes

- `FORM_SECRET`, `CRON_SECRET`, `SLACK_BOT_TOKEN`, `SLACK_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, and Blob credentials are server-only. Never commit or share them. `SLACK_CLIENT_ID` is not a secret, but keep all OAuth settings in Vercel Environment Variables.
- Slack identity is checked using the verified OIDC ID token, its nonce, the user-info endpoint, and the bot token's workspace ID. The app stores only an HMAC of the OTP, hashes the random session token, limits guesses, and atomically consumes the code. The raw OTP is sent only in the Slack DM and is never stored in the database.
- The signed form token is a bearer link and must be treated as private. It is present in the form URL by design; the HMAC secret is not sent to the browser. Form-link expiry and re-submission/update behavior are independent of OTP/session expiry.
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
- The additional colors, exact KSC font, and official logo were not supplied. The pastel colors, system-font fallback stack, and SVG wordmark are fallbacks/placeholders.
