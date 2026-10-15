import { getAppBaseUrl, getRequiredEnv } from '../../../../lib/config';
import { checkCronAuthorization } from '../../../../lib/cron-auth';
import { createSlackTestFormToken, getSlackTestLinkTtlMs, isSlackTestModeEnabled } from '../../../../lib/test-mode';
import { formatExpiryDateTime } from '../../../../lib/time';
import { hasRequiredAuthSession, isSlackOtpAuthEnabled } from '../../../../lib/otp-auth';
import { postSlackTestAlert, postSlackTestFormLink } from '../../../../lib/slack';

export const dynamic = 'force-dynamic';

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  if (!isSlackTestModeEnabled()) return json({ ok: false, error: 'Temporary Slack test mode is disabled.' }, 404);

  if (isSlackOtpAuthEnabled()) {
    try {
      if (!await hasRequiredAuthSession('test_console')) {
        return json({ ok: false, code: 'AUTH_REQUIRED', error: 'Your Slack sign-in has expired. Sign in again before starting a test.' }, 401);
      }
    } catch {
      return json({ ok: false, error: 'Secure sign-in could not be checked right now. Please try again.' }, 503);
    }
  } else {
    const auth = checkCronAuthorization(request);
    if (!auth.configured) return json({ ok: false, error: 'The test trigger is not configured.' }, 500);
    if (!auth.authorized) return json({ ok: false, error: 'The test authorization was not accepted.' }, 401);
  }

  try {
    const channel = getRequiredEnv('SLACK_ALERT_CHANNEL_ID');
    const baseUrl = getAppBaseUrl();
    getRequiredEnv('FORM_SECRET');

    const expiresAtMs = Date.now() + getSlackTestLinkTtlMs();
    const alert = await postSlackTestAlert({ channel });
    const token = createSlackTestFormToken({
      channel: alert.channel,
      threadTs: alert.ts,
      expiresAtMs
    });
    const testUrl = `${baseUrl}/test-form/${encodeURIComponent(token)}`;
    await postSlackTestFormLink({
      channel: alert.channel,
      threadTs: alert.ts,
      formUrl: testUrl,
      expiresAt: expiresAtMs
    });

    return json({
      ok: true,
      testUrl,
      expiresAt: formatExpiryDateTime(new Date(expiresAtMs)),
      alertChannel: alert.channel
    });
  } catch {
    return json({
      ok: false,
      error: 'The test alert could not be posted. Check that the Slack bot is in the configured testing channel and has chat:write, then try again.'
    }, 502);
  }
}
