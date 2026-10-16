# KSC Disney Topping Update

A mobile-first, KSC-branded Next.js app for the Disney team's end-of-day cart check. It has **28 fixed physical-bin cards**. Each card can contain multiple optional topping/style names, then a quick **Yes / No** answer for **“Restock Needed?”** A photo is required for each bin marked **Yes**; no photo is requested for **No**. Bag counts and display-time replacement fields are not part of the workflow.

Associate form links are signed, reusable for the configured period (72 hours by default), can update an existing submission, and have **no OTP step**. Submissions and bin/style data are stored in Supabase; photos are uploaded to Vercel Blob and posted to Slack. The separate **manager dashboard** is password-protected and shows the most recent 90 days of submissions. **No Redis/Upstash or Vercel Cron is used.**

## Included

- Next.js 14.2.35 App Router, React 18.3.1, JavaScript, and plain CSS.
- Fixed `Bin 1`–`Bin 28` configuration in `config/bins.js`; no topping names are invented.
- Optional, repeatable topping/style-name inputs inside each bin card.
- Required Yes/No answer for every bin; one photo for each Yes response.
- Signed `cycleId.hmac` form links, configurable expiry, local draft recovery, reusable links, and update-on-resubmit behavior.
- Manager-only `/dashboard` with an environment-configured password, expiring HttpOnly session cookie, latest check overview, location/search filters, and up to 90 days of submission history.
- Same-origin Vercel Blob uploads, image compression (1600 px longest edge / quality 0.8), HEIC/HEIF-to-JPEG conversion when needed, a 4 MiB compressed request cap, 5 MB storage limit, and authorized photo cleanup.
- Supabase Postgres storage for cycles, submissions, photo ownership, and idempotency locks; old records are pruned after 90 days.
- Slack alert-thread result with a 28-bin/style-name summary, native photo attachments, photo-link fallback, and optional results-channel mirror.
- Protected alert/reminder routes, `/api/health`, and an optional temporary Slack test flow.
- Associate forms remain OTP-free. No Slack Workflow Builder, Events API, interactive endpoint, slash command, Redis/Upstash, `vercel.json` cron, or Vercel Cron configuration.

## KSC brand and visual design

The refreshed interface keeps KSC's soft pink-and-aqua identity but uses a quieter neutral page, white cards, fine borders, restrained accents, and minimal shadows to reduce visual clutter. Bin cards reflow from one to three columns, and the dashboard is responsive for phone and desktop. Quicksand (body/display) and Nunito (buttons) are self-hosted in `public/fonts/` with their SIL Open Font Licenses. `public/ksc-logo.svg` is a KSC placeholder wordmark, not official artwork; replace it with approved artwork at the same path if available.

## Local development

Requirements: Node.js 22.x and npm.

```sh
npm install
cp .env.example .env.local
npm run dev
```

For API testing, create a Supabase project, run `supabase/schema.sql` in its SQL Editor, and configure `.env.local`. Set `DASHBOARD_SECRET` to a long random value if you want to test `/dashboard` locally. Production build and start:

```sh
npm run build
npm start
```

The root page (`/`) gives staff instructions; a live form is opened from the private Slack link created by `/api/cron/send`.

## GitHub and Vercel deployment

1. Push the contents of this folder to the GitHub repository root.
2. Import the repository into Vercel as a Next.js project and select Node.js **22.x**.
3. Create a Supabase project and run the complete `supabase/schema.sql` once.
4. Add the Supabase Project URL and server-only `service_role` key as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never use a `NEXT_PUBLIC_` variable for the service-role key.
5. Connect a Vercel Blob store to provide `BLOB_READ_WRITE_TOKEN`.
6. Add the environment variables below. Set a strong, separate `DASHBOARD_SECRET` for manager dashboard access; create and enter it privately in Vercel—do not send it in chat. Use Production for the live app; configure Preview/Development only if needed. `APP_BASE_URL` must be that environment's public origin. Do not commit real values or `.env.local`.
7. Use the existing Slack app, bot scopes, and channel access described below.
8. Deploy. After changing environment variables, redeploy so the new deployment receives them.
9. Check `https://YOUR-PRODUCTION-DOMAIN/api/health`. It returns only environment-presence booleans and a Supabase reachability status, never secret values.
10. Keep the existing cron-job.org configuration enabled with the alert times: **Thursday at 10:45 PM and Sunday at 11:00 PM `America/Los_Angeles`**. Do not add Vercel Cron or a `vercel.json` cron schedule.

## Supabase

`supabase/schema.sql` creates:

- `ksc_cycles` — signed-link cycle metadata, Slack thread data, reminders, and summary fields.
- `ksc_submissions` — the latest JSON response for each cycle; a resubmission replaces it.
- `ksc_uploaded_photos` — verifies photos were uploaded for the signed form cycle.
- `ksc_locks` — expiring locks that prevent overlapping submissions or scheduled work.

All tables use Row Level Security and deny client-role access. Server routes use `SUPABASE_SERVICE_ROLE_KEY`. Alert and reminder routes prune records older than 90 days. The manager dashboard reads the same protected submission table server-side.

## Slack setup

Use the existing Slack app; a new app is not required. Confirm the bot has `chat:write` and `files:write` scopes, and invite it to the target channel. Store the Bot User OAuth Token (`xoxb-…`) in Vercel as `SLACK_BOT_TOKEN`; never share or commit it. Use the channel ID (for example `C0123456789`) for `SLACK_ALERT_CHANNEL_ID`, not the channel name. `SLACK_RESULTS_CHANNEL_ID` is optional; if different from the alert channel, the app posts the canonical threaded/broadcast result and attachments in the alert thread, then mirrors the summary to the other channel.

Slack dividers use ten `:pinkline:` custom emoji shortcodes. Without a workspace emoji named `pinkline`, Slack may display the shortcode text.

## Environment variables

| Name | Required | Example / format | Notes |
|---|---:|---|---|
| `SLACK_BOT_TOKEN` | Yes | `xoxb-…` | Bot User OAuth Token; server-only. |
| `SLACK_ALERT_CHANNEL_ID` | Yes | `C0123456789` | Slack channel ID used for alerts and form threads. |
| `SLACK_RESULTS_CHANNEL_ID` | No | `C0123456789` | Defaults to the alert channel. A different channel gets a top-level mirror. |
| `SLACK_ALERT_MENTION` | No | `<!here>` | Defaults to `<!here>`; set explicitly empty to disable mentions. |
| `FORM_SECRET` | Yes | Long random value | HMAC key for signed associate form links. Never expose it. |
| `CRON_SECRET` | Yes | A separate long random value | Bearer secret for cron and test-trigger routes. Never expose it. |
| `DASHBOARD_SECRET` | Yes for dashboard | Long random value | Separate manager-dashboard password/session-signing key. Set privately in Vercel; never send it in chat or commit it. |
| `APP_BASE_URL` | Yes | `https://ksc-topping-update.vercel.app` | Public site origin; HTTPS in production, no path or trailing slash. |
| `BLOB_READ_WRITE_TOKEN` | Yes | `vercel_blob_rw_…` | Added by Vercel Blob; server-only. |
| `SUPABASE_URL` | Yes | `https://<project-ref>.supabase.co` | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | `<service-role secret>` | Server-only; never use as `NEXT_PUBLIC_*`. |
| `APP_TIMEZONE` | No | `America/Los_Angeles` | Defaults to this IANA timezone; keep it for the Thursday 10:45 PM and Sunday 11:00 PM Pacific schedule. |
| `LOCATIONS` | No | `Disney CA, Downtown Disney` | Comma-separated location dropdown; defaults to `Disney CA`. |
| `FORM_LINK_VALID_HOURS` | No | `72` | Defaults to 72; accepted range 1–8760 hours. |
| `ENABLE_SLACK_TEST_MODE` | No | `true` while testing | Defaults off. Enables a temporary Slack/form test; turn off and redeploy when done. |

Generate separate `FORM_SECRET`, `CRON_SECRET`, and `DASHBOARD_SECRET` values locally, and store them directly in your hosting environment:

```sh
openssl rand -base64 48
openssl rand -base64 48
openssl rand -base64 48
```

## Manager dashboard

Open `/dashboard` and sign in with the manager password configured as `DASHBOARD_SECRET`. The dashboard session is an HttpOnly cookie that expires after 12 hours. The dashboard shows the latest check, searchable/filterable submission history for up to 90 days, bin status, optional style names, and whether a photo was submitted. It does not add OTP to the associate form. If `DASHBOARD_SECRET` is unset, the dashboard remains unavailable and displays a setup message.

## Existing cron-job.org schedule

The existing cron-job.org configuration is enabled. Keep using it; the requested alert times are **Thursday at 22:45 and Sunday at 23:00 `America/Los_Angeles`**, with the existing `Authorization: Bearer CRON_SECRET` header. Separately configured reminder jobs remain unchanged. Scheduler settings are external to this project/ZIP. There is no Redis/Upstash dependency, `vercel.json` cron block, or Vercel Cron setup here.

| Job | Requested schedule | URL | Method | Header |
|---|---|---|---|---|
| Alert | Thursday at 22:45; Sunday at 23:00 `America/Los_Angeles` | `APP_BASE_URL/api/cron/send` | GET | `Authorization: Bearer CRON_SECRET` |

A manual `GET APP_BASE_URL/api/cron/send?force=1` with the existing bearer header posts a real Slack alert and refreshes that Pacific date's link expiry; use it carefully. The `/api/cron/send?guard=pacific` safety check accepts the Thursday 10:45 PM window and Sunday 11 PM window.

## API behavior

- `GET|POST /api/cron/send` — protected by `CRON_SECRET`; creates a cycle and posts a Slack alert, skipping duplicate dates unless `?force=1`.
- `GET|POST /api/cron/reminder` — protected by the same bearer secret; posts a threaded reminder when appropriate.
- `GET /f/[token]` — verifies the HMAC-signed associate form link and expiry server-side. Links are reusable for the configured period (72 hours by default) and can update a prior submission; there is no OTP step.
- `POST /api/upload` — authorizes the signed link and stores a JPEG/PNG/WebP/HEIC photo in Vercel Blob. Submission accepts only safe photo URLs registered for that cycle.
- `POST /api/upload/delete` — best-effort cleanup when a worker removes a photo or changes a Yes answer to No.
- `POST /api/submit` — validates employee name, location, exactly one Yes/No answer for every bin, optional topping/style name lists, and a photo for every Yes (no photo for No). It saves in Supabase before Slack delivery, so Slack failure does not discard the submission. A later submission updates the existing response.
- `GET /dashboard` — manager-only dashboard; requires `DASHBOARD_SECRET` and reads the 90-day submission history server-side.
- `GET /api/health` — returns environment-presence booleans and Supabase reachability only.
- `POST /api/test/start` and `/api/test/submit` — temporary Slack/form test routes, enabled only by `ENABLE_SLACK_TEST_MODE=true`; test responses do not write to the database and photos are disabled. The UI is at `/test-console` and uses the `CRON_SECRET` flow.

## Smoke test

1. Check `/api/health`; confirm Supabase is reachable and expected environment variables are present. No secret values are returned.
2. Open the current Slack form link on a phone. Confirm the calmer form layout, date, location, Bin 1–28 cards, and optional multiple style-name inputs. Mark Yes or No for all bins, upload a photo for every Yes, and none for a No.
3. Submit. Confirm the success summary lists bins marked Yes and Slack receives a 28-row bin/style/status summary with native photo files. If Slack file upload is unavailable, photo links should be posted in the thread and the Supabase submission should remain saved.
4. Reopen the same link before expiry. Change a style name or answer and resubmit. Confirm Slack labels it as updated and Supabase holds the latest response. The default link validity is 72 hours.
5. Set a private `DASHBOARD_SECRET` in Vercel, redeploy, sign in at `/dashboard`, and verify the latest check and recent 90-day submissions. Confirm sign-out removes dashboard access. Do not share the dashboard password in chat.
6. If test mode is intentionally enabled, use `/test-console` with `CRON_SECRET`, follow the clearly labeled Slack test thread, mark bins Yes/No, and submit. Confirm no database write or photo upload. Disable test mode and redeploy when finished.
7. Test expiry only in a non-production environment by shortening `FORM_LINK_VALID_HOURS`; restore the live default afterwards. Keep the already-enabled cron-job.org schedule in place.

## Temporary Slack/form test without Supabase

The temporary test checks the UI and Slack thread only. It does not exercise Blob uploads, persistence, reminders, or production cron behavior. Test answers are not saved, photos are disabled, and each test link expires after 30 minutes.

1. Confirm the configured alert channel is appropriate for a clearly labeled test and the bot is invited there.
2. Set `ENABLE_SLACK_TEST_MODE=true` in Vercel and redeploy.
3. Open `https://YOUR-PRODUCTION-DOMAIN/test-console`. Enter `CRON_SECRET` directly into the HTTPS page (never paste it into chat) and send a test alert.
4. In Slack, open the test form from its thread, optionally list style names, answer Yes/No for Bin 1–28, and submit. Confirm the Slack reply is clearly marked test-only; no database record is created and photos are disabled.
5. Set `ENABLE_SLACK_TEST_MODE=false` or remove it, then redeploy. Do not leave test mode enabled longer than needed.

Test form tokens are signed with `FORM_SECRET`, restricted to the configured Slack channel, and expire in 30 minutes.

## Security and operational notes

- `FORM_SECRET`, `CRON_SECRET`, `DASHBOARD_SECRET`, `SLACK_BOT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, and Blob credentials are server-only. Never commit or share them.
- A signed associate form link is a private bearer link. It remains usable until expiry and intentionally permits updates after the first submission. OTP is not part of the associate form.
- Dashboard access uses a separate manager password and signed HttpOnly cookie; the dashboard/API do not return data without a valid session.
- API errors do not return stack traces or secret values. If Slack fails after a successful database save, the associate receives an explicit delivery warning.
- Supabase service-role operations are server-side only; the Supabase client is not bundled in browser code. The site sends `noindex, nofollow` metadata.
- Photos are deleted after Slack confirms native-file completion; removed photos are best-effort deleted. An upload abandoned without removing it can remain as an unreferenced public Blob object, so periodically review storage or add an organization-specific cleanup policy.
- Keep `APP_TIMEZONE` set to `America/Los_Angeles` for the existing cron schedule and time guards; runtime logic uses IANA timezone support.

## Known limitations

- The project remains on the specifically requested Next.js 14.2.x line. In this environment, `npm audit` reports a critical upstream vulnerability for Next.js 14.2.35; the available audit fix moves to a newer major version and would violate the stack constraint. Plan a tested upgrade to a maintained patched version when that constraint can change.
- Supabase, Slack, and Vercel Blob cannot be live-verified without access to the connected projects. The end-to-end credentialed flow still needs the smoke tests above.
- Abandoned photos may remain in public Blob storage; deleted and Slack-attached photos are cleaned up.
- If the results channel differs from the alert channel, Slack cannot thread across channels. The canonical result and attachments remain in the alert thread; only the summary is mirrored to the results channel.
- The KSC palette and fonts follow the public site theme. The SVG wordmark is still a placeholder because approved official artwork was not supplied.
