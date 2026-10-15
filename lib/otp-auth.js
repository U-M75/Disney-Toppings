import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getRequiredEnv } from './config';
import { getSupabase } from './supabase';

export const AUTH_SESSION_COOKIE = 'ksc_auth_session';
export const OAUTH_STATE_COOKIE = 'ksc_slack_oauth_state';
export const AUTH_SESSION_TTL_SECONDS = 24 * 60 * 60;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_REQUEST_COOLDOWN_MS = 60 * 1000;

export function isSlackOtpAuthEnabled() {
  return process.env.ENABLE_SLACK_OTP_AUTH?.trim().toLowerCase() === 'true';
}

export function makeOtpCode() {
  return String(randomInt(10000, 100000));
}

export function hashOtpCode(challengeId, code) {
  return createHmac('sha256', getRequiredEnv('FORM_SECRET'))
    .update(`ksc-otp:${challengeId}:${code}`)
    .digest('hex');
}

function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createOAuthStatePayload({ purpose, returnTo }) {
  return {
    state: randomBytes(32).toString('base64url'),
    nonce: randomBytes(32).toString('base64url'),
    purpose,
    returnTo,
    expiresAt: Date.now() + 10 * 60 * 1000
  };
}

export function signOAuthStateCookie(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', getRequiredEnv('FORM_SECRET'))
    .update(`ksc-oauth-state:${encoded}`)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyOAuthStateCookie(value) {
  if (typeof value !== 'string' || value.length > 3000) return null;
  const match = value.match(/^([A-Za-z0-9_-]{1,2600})\.([A-Za-z0-9_-]{40,50})$/);
  if (!match) return null;

  const [, encoded, receivedSignature] = match;
  const expectedSignature = createHmac('sha256', getRequiredEnv('FORM_SECRET'))
    .update(`ksc-oauth-state:${encoded}`)
    .digest('base64url');
  const expected = Buffer.from(expectedSignature, 'utf8');
  const received = Buffer.from(receivedSignature, 'utf8');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (
      !payload ||
      typeof payload.state !== 'string' ||
      typeof payload.nonce !== 'string' ||
      !['staff', 'test_console'].includes(payload.purpose) ||
      typeof payload.returnTo !== 'string' ||
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.expiresAt <= Date.now()
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getCurrentAuthSession(purpose) {
  const token = cookies().get(AUTH_SESSION_COOKIE)?.value;
  if (!token || !['staff', 'test_console'].includes(purpose)) return null;

  const { data, error } = await getSupabase()
    .from('ksc_auth_sessions')
    .select('session_id, purpose, slack_user_id, slack_team_id, created_at, expires_at')
    .eq('token_hash', hashSessionToken(token))
    .in('purpose', [purpose, 'all'])
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error(`Supabase auth session lookup failed (${error.code || 'database_error'}).`);
  return data ? {
    sessionId: data.session_id,
    purpose: data.purpose,
    slackUserId: data.slack_user_id,
    slackTeamId: data.slack_team_id,
    createdAt: data.created_at,
    expiresAt: data.expires_at
  } : null;
}

export async function hasRequiredAuthSession(purpose) {
  if (!isSlackOtpAuthEnabled()) return true;
  return Boolean(await getCurrentAuthSession(purpose));
}

export async function createAuthSessionToken(supabase, { slackUserId, slackTeamId }) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + AUTH_SESSION_TTL_SECONDS * 1000).toISOString();
  const now = new Date().toISOString();
  const cleanup = await supabase.from('ksc_auth_sessions').delete().lt('expires_at', now);
  if (cleanup.error) throw new Error(`Supabase auth session cleanup failed (${cleanup.error.code || 'database_error'}).`);

  const { error } = await supabase.from('ksc_auth_sessions').insert({
    session_id: randomUUID(),
    token_hash: hashSessionToken(token),
    purpose: 'all',
    slack_user_id: slackUserId,
    slack_team_id: slackTeamId,
    created_at: now,
    expires_at: expiresAt
  });
  if (error) throw new Error(`Supabase auth session creation failed (${error.code || 'database_error'}).`);
  return { token, expiresAt };
}

export function applyAuthSessionCookie(response, token) {
  response.cookies.set(AUTH_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_SESSION_TTL_SECONDS
  });
  return response;
}

export function clearOAuthStateCookie(response) {
  response.cookies.set(OAUTH_STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/api/auth/slack',
    maxAge: 0
  });
  return response;
}

