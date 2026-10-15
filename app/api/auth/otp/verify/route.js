import { NextResponse } from 'next/server';
import { validateAuthReturnTo } from '../../../../../lib/auth-flow';
import { getSupabase, consumeAuthChallenge } from '../../../../../lib/supabase';
import { isSlackOtpAuthEnabled, hashOtpCode, createAuthSessionToken, applyAuthSessionCookie } from '../../../../../lib/otp-auth';
import { markSlackOtpMessageUsed } from '../../../../../lib/slack-oidc';

export const dynamic = 'force-dynamic';

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  if (!isSlackOtpAuthEnabled()) return json({ ok: false, error: 'Slack sign-in is not enabled.' }, 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Enter the five-digit code from your Slack DM.' }, 400);
  }

  const challengeId = typeof body?.challengeId === 'string' ? body.challengeId : '';
  const code = typeof body?.code === 'string' ? body.code : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(challengeId) || !/^\d{5}$/.test(code)) {
    return json({ ok: false, error: 'Enter the five-digit code from your Slack DM.' }, 400);
  }

  try {
    const supabase = getSupabase();
    const consumed = await consumeAuthChallenge(supabase, challengeId, hashOtpCode(challengeId, code));
    if (!consumed?.ok) {
      const reason = consumed?.reason;
      if (reason === 'invalid') return json({ ok: false, error: 'That code is not correct. Check the DM and try again.' }, 400);
      if (reason === 'locked') return json({ ok: false, error: 'Too many code attempts. Start Slack sign-in again to request a new code.' }, 429);
      if (reason === 'expired') return json({ ok: false, error: 'That code has expired. Start Slack sign-in again to get a new one.' }, 410);
      if (reason === 'used') return json({ ok: false, error: 'That code has already been used. Start Slack sign-in again if you still need access.' }, 410);
      return json({ ok: false, error: 'That verification request is no longer available. Start Slack sign-in again.' }, 410);
    }

    let dmUpdated = false;
    if (typeof consumed.dm_channel === 'string' && typeof consumed.dm_ts === 'string') {
      try {
        await markSlackOtpMessageUsed(consumed.dm_channel, consumed.dm_ts);
        dmUpdated = true;
      } catch {
        dmUpdated = false;
      }
    }

    const purpose = consumed.purpose;
    const returnTo = consumed.return_to;
    if (!['staff', 'test_console'].includes(purpose) || !await validateAuthReturnTo(purpose, returnTo)) {
      return json({ ok: false, error: 'The link associated with this code is no longer available. Open the current Slack link and sign in again.' }, 410);
    }

    const session = await createAuthSessionToken(supabase, {
      slackUserId: consumed.slack_user_id,
      slackTeamId: consumed.slack_team_id
    });

    const response = json({ ok: true, returnTo, dmUpdated });
    return applyAuthSessionCookie(response, session.token);
  } catch {
    return json({ ok: false, error: 'We could not verify that code right now. Please try again shortly.' }, 503);
  }
}
