import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getAppBaseUrl, getRequiredEnv } from './config';

const SLACK_AUTHORIZE_URL = 'https://slack.com/openid/connect/authorize';
const SLACK_TOKEN_URL = 'https://slack.com/api/openid.connect.token';
const SLACK_USERINFO_URL = 'https://slack.com/api/openid.connect.userInfo';
const SLACK_JWKS = createRemoteJWKSet(new URL('https://slack.com/openid/connect/keys'));

export function getSlackOAuthRedirectUri() {
  return `${getAppBaseUrl()}/api/auth/slack/callback`;
}

export async function getSlackBotTeamId() {
  const data = await callSlackBotApi('auth.test', {});
  const teamId = typeof data.team_id === 'string' ? data.team_id : '';
  if (!/^T[A-Z0-9]{2,30}$/.test(teamId)) throw new Error('Slack did not return a valid team ID.');
  return teamId;
}

export function createSlackAuthorizeUrl({ state, nonce, teamId }) {
  const url = new URL(SLACK_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('response_mode', 'form_post');
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('client_id', getRequiredEnv('SLACK_CLIENT_ID'));
  url.searchParams.set('redirect_uri', getSlackOAuthRedirectUri());
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  if (teamId) url.searchParams.set('team', teamId);
  return url.toString();
}

export async function exchangeSlackAuthorizationCode(code) {
  const form = new URLSearchParams({
    code,
    client_id: getRequiredEnv('SLACK_CLIENT_ID'),
    client_secret: getRequiredEnv('SLACK_CLIENT_SECRET'),
    grant_type: 'authorization_code',
    redirect_uri: getSlackOAuthRedirectUri()
  });
  const response = await fetch(SLACK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    cache: 'no-store'
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok || typeof data.id_token !== 'string' || typeof data.access_token !== 'string') {
    throw new Error('Slack authorization-code exchange failed.');
  }
  return { idToken: data.id_token, accessToken: data.access_token };
}

async function fetchSlackUserInfo(accessToken) {
  const form = new URLSearchParams({ token: accessToken });
  const response = await fetch(SLACK_USERINFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    cache: 'no-store'
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error('Slack identity lookup failed.');
  return data;
}

export async function getVerifiedSlackIdentity({ idToken, accessToken, expectedNonce, expectedTeamId }) {
  const { payload } = await jwtVerify(idToken, SLACK_JWKS, {
    issuer: 'https://slack.com',
    audience: getRequiredEnv('SLACK_CLIENT_ID'),
    algorithms: ['RS256'],
    clockTolerance: 60,
    requiredClaims: ['iss', 'aud', 'exp', 'iat', 'nonce']
  });
  if (payload.nonce !== expectedNonce) throw new Error('Slack identity nonce did not match.');

  const userInfo = await fetchSlackUserInfo(accessToken);
  const tokenUserId = typeof payload['https://slack.com/user_id'] === 'string'
    ? payload['https://slack.com/user_id']
    : (typeof payload.sub === 'string' ? payload.sub : '');
  const userId = typeof userInfo['https://slack.com/user_id'] === 'string'
    ? userInfo['https://slack.com/user_id']
    : (typeof userInfo.sub === 'string' ? userInfo.sub : '');
  const tokenTeamId = typeof payload['https://slack.com/team_id'] === 'string'
    ? payload['https://slack.com/team_id']
    : '';
  const teamId = typeof userInfo['https://slack.com/team_id'] === 'string'
    ? userInfo['https://slack.com/team_id']
    : '';

  if (
    !/^[UW][A-Z0-9]{2,30}$/.test(userId) ||
    !/^T[A-Z0-9]{2,30}$/.test(teamId) ||
    tokenUserId !== userId ||
    tokenTeamId !== teamId ||
    teamId !== expectedTeamId
  ) {
    throw new Error('Slack identity did not match the installed workspace.');
  }

  return { slackUserId: userId, slackTeamId: teamId };
}

export async function callSlackBotApi(method, payload) {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getRequiredEnv('SLACK_BOT_TOKEN')}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(`Slack ${method} request failed.`);
  return data;
}

export async function openSlackDirectMessage(slackUserId) {
  const data = await callSlackBotApi('conversations.open', { users: slackUserId });
  const channel = typeof data.channel?.id === 'string' ? data.channel.id : '';
  if (!/^D[A-Z0-9]{2,30}$/.test(channel)) throw new Error('Slack did not return a valid direct-message channel.');
  return channel;
}

export async function postSlackOtpMessage(channel, code) {
  const data = await callSlackBotApi('chat.postMessage', {
    channel,
    text: `Your KSC sign-in code is ${code}. It expires in 5 minutes and can be used once. If you did not request this code, you can ignore this message.`
  });
  const timestamp = typeof data.ts === 'string' ? data.ts : '';
  if (!/^\d{9,13}\.\d{1,6}$/.test(timestamp)) throw new Error('Slack did not return a valid message timestamp.');
  return timestamp;
}

export async function markSlackOtpMessageUsed(channel, timestamp) {
  return callSlackBotApi('chat.update', {
    channel,
    ts: timestamp,
    text: 'Your KSC sign-in code was used successfully. This one-time code is no longer valid.'
  });
}
