import { randomUUID, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { validateAuthReturnTo } from '../../../../../lib/auth-flow';
import {
  cleanupAuthChallenges,
  createAuthChallenge,
  deleteAuthChallenge,
  isAuthCodeRequestCoolingDown,
  setAuthChallengeDelivery,
  getSupabase
} from '../../../../../lib/supabase';
import { getAppBaseUrl, getRequiredEnv } from '../../../../../lib/config';
import {
  isSlackOtpAuthEnabled,
  makeOtpCode,
  hashOtpCode,
  OAUTH_STATE_COOKIE,
  OTP_REQUEST_COOLDOWN_MS,
  OTP_TTL_MS,
  verifyOAuthStateCookie,
  clearOAuthStateCookie
} from '../../../../../lib/otp-auth';
import {
  exchangeSlackAuthorizationCode,
  getSlackBotTeamId,
  getVerifiedSlackIdentity,
  openSlackDirectMessage,
  postSlackOtpMessage
} from '../../../../../lib/slack-oidc';

export const dynamic = 'force-dynamic';

function getCallbackValues(request, formData) {
  if (formData) {
    return {
      code: formData.get('code'),
      state: formData.get('state'),
      error: formData.get('error')
    };
  }
  const params = new URL(request.url).searchParams;
  return { code: params.get('code'), state: params.get('state'), error: params.get('error') };
}

function statesMatch(expected, received) {
  if (typeof expected !== 'string' || typeof received !== 'string') return false;
  const expectedBytes = Buffer.from(expected, 'utf8');
  const receivedBytes = Buffer.from(received, 'utf8');
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

function errorRedirect(request, reason) {
  const url = new URL('/auth/error', request.url);
  url.searchParams.set('reason', reason);
  const response = NextResponse.redirect(url, 303);
  clearOAuthStateCookie(response);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

async function handleCallback(request, formData = null) {
  if (!isSlackOtpAuthEnabled()) return errorRedirect(request, 'disabled');

  const { code, state: receivedState, error: slackError } = getCallbackValues(request, formData);
  const stateCookie = cookies().get(OAUTH_STATE_COOKIE)?.value;
  let statePayload;
  try {
    statePayload = verifyOAuthStateCookie(stateCookie);
  } catch {
    return errorRedirect(request, 'unavailable');
  }

  if (!statePayload || !statesMatch(statePayload.state, receivedState)) {
    return errorRedirect(request, 'state');
  }
  if (slackError || typeof code !== 'string' || !code || code.length > 2000) {
    return errorRedirect(request, 'denied');
  }

  const returnToValid = await validateAuthReturnTo(statePayload.purpose, statePayload.returnTo);
  if (!returnToValid) return errorRedirect(request, 'invalid_link');

  let supabase;
  let challengeId;
  let dmChannel;
  let dmTs;
  try {
    getRequiredEnv('SLACK_CLIENT_ID');
    getRequiredEnv('SLACK_CLIENT_SECRET');
    getRequiredEnv('SLACK_BOT_TOKEN');
    getRequiredEnv('FORM_SECRET');
    supabase = getSupabase();

    const expectedTeamId = await getSlackBotTeamId();
    const tokens = await exchangeSlackAuthorizationCode(code);
    const identity = await getVerifiedSlackIdentity({
      idToken: tokens.idToken,
      accessToken: tokens.accessToken,
      expectedNonce: statePayload.nonce,
      expectedTeamId
    });

    await cleanupAuthChallenges(supabase);
    const cooldownStart = new Date(Date.now() - OTP_REQUEST_COOLDOWN_MS).toISOString();
    if (await isAuthCodeRequestCoolingDown(supabase, identity.slackUserId, cooldownStart)) {
      return errorRedirect(request, 'rate_limited');
    }

    const otp = makeOtpCode();
    challengeId = randomUUID();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
    await createAuthChallenge(supabase, {
      challengeId,
      purpose: statePayload.purpose,
      slackUserId: identity.slackUserId,
      slackTeamId: identity.slackTeamId,
      codeHash: hashOtpCode(challengeId, otp),
      returnTo: statePayload.returnTo,
      createdAt,
      expiresAt
    });

    dmChannel = await openSlackDirectMessage(identity.slackUserId);
    dmTs = await postSlackOtpMessage(dmChannel, otp);
    await setAuthChallengeDelivery(supabase, challengeId, dmChannel, dmTs);

    const verifyUrl = new URL('/auth/verify', getAppBaseUrl());
    verifyUrl.searchParams.set('challenge', challengeId);
    const response = NextResponse.redirect(verifyUrl, 303);
    clearOAuthStateCookie(response);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch {
    if (supabase && challengeId) await deleteAuthChallenge(supabase, challengeId).catch(() => {});
    return errorRedirect(request, 'unavailable');
  }
}

export async function GET(request) {
  return handleCallback(request);
}

export async function POST(request) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return errorRedirect(request, 'state');
  }
  return handleCallback(request, formData);
}
