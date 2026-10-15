import { NextResponse } from 'next/server';
import { validateAuthReturnTo } from '../../../../../lib/auth-flow';
import { getCurrentAuthSession, isSlackOtpAuthEnabled, OAUTH_STATE_COOKIE, createOAuthStatePayload, signOAuthStateCookie } from '../../../../../lib/otp-auth';
import { createSlackAuthorizeUrl, getSlackBotTeamId } from '../../../../../lib/slack-oidc';
import { getRequiredEnv } from '../../../../../lib/config';

export const dynamic = 'force-dynamic';

function errorRedirect(request, reason) {
  const url = new URL('/auth/error', request.url);
  url.searchParams.set('reason', reason);
  const response = NextResponse.redirect(url, 303);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export async function GET(request) {
  if (!isSlackOtpAuthEnabled()) return errorRedirect(request, 'disabled');

  const url = new URL(request.url);
  const purpose = url.searchParams.get('purpose');
  const returnTo = url.searchParams.get('returnTo');
  if (!['staff', 'test_console'].includes(purpose) || !await validateAuthReturnTo(purpose, returnTo)) {
    return errorRedirect(request, 'invalid_link');
  }

  try {
    const existingSession = await getCurrentAuthSession(purpose);
    if (existingSession) {
      const response = NextResponse.redirect(new URL(returnTo, request.url), 303);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    getRequiredEnv('SLACK_CLIENT_ID');
    getRequiredEnv('SLACK_CLIENT_SECRET');
    getRequiredEnv('SLACK_BOT_TOKEN');
    getRequiredEnv('FORM_SECRET');

    const teamId = await getSlackBotTeamId();
    const statePayload = createOAuthStatePayload({ purpose, returnTo });
    const authorizeUrl = createSlackAuthorizeUrl({
      state: statePayload.state,
      nonce: statePayload.nonce,
      teamId
    });

    const response = NextResponse.redirect(authorizeUrl, 302);
    response.cookies.set(OAUTH_STATE_COOKIE, signOAuthStateCookie(statePayload), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/api/auth/slack',
      maxAge: 10 * 60
    });
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch {
    return errorRedirect(request, 'unavailable');
  }
}
