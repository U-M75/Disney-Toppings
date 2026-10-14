import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getRequiredEnv } from './config';

const TEST_TOKEN_PREFIX = 't';
const TEST_LINK_TTL_MS = 30 * 60 * 1000;

export function isSlackTestModeEnabled() {
  return process.env.ENABLE_SLACK_TEST_MODE?.trim().toLowerCase() === 'true';
}

export function getSlackTestLinkTtlMs() {
  return TEST_LINK_TTL_MS;
}

export function createSlackTestFormToken({ channel, threadTs, expiresAtMs }) {
  const payload = {
    purpose: 'ksc-slack-test-v1',
    channel,
    threadTs,
    expiresAtMs,
    nonce: randomBytes(12).toString('base64url')
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signedContent = `${TEST_TOKEN_PREFIX}.${encodedPayload}`;
  const signature = createHmac('sha256', getRequiredEnv('FORM_SECRET'))
    .update(signedContent)
    .digest('base64url');
  return `${signedContent}.${signature}`;
}

export function verifySlackTestFormToken(token) {
  if (!isSlackTestModeEnabled()) return { ok: false, reason: 'disabled' };
  if (typeof token !== 'string' || token.length > 2400) return { ok: false, reason: 'invalid' };

  const match = token.match(/^t\.([A-Za-z0-9_-]{1,1800})\.([A-Za-z0-9_-]{40,50})$/);
  if (!match) return { ok: false, reason: 'invalid' };

  try {
    const [, encodedPayload, receivedSignature] = match;
    const signedContent = `${TEST_TOKEN_PREFIX}.${encodedPayload}`;
    const expectedSignature = createHmac('sha256', getRequiredEnv('FORM_SECRET'))
      .update(signedContent)
      .digest('base64url');
    const expected = Buffer.from(expectedSignature, 'utf8');
    const received = Buffer.from(receivedSignature, 'utf8');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      return { ok: false, reason: 'invalid' };
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    const channel = typeof payload?.channel === 'string' ? payload.channel : '';
    const threadTs = typeof payload?.threadTs === 'string' ? payload.threadTs : '';
    const expiresAtMs = Number(payload?.expiresAtMs);
    const nonce = typeof payload?.nonce === 'string' ? payload.nonce : '';
    const configuredChannel = process.env.SLACK_ALERT_CHANNEL_ID?.trim();

    if (
      payload?.purpose !== 'ksc-slack-test-v1' ||
      !/^[A-Z0-9]{3,30}$/.test(channel) ||
      !/^\d{9,13}\.\d{1,6}$/.test(threadTs) ||
      !/^[A-Za-z0-9_-]{12,40}$/.test(nonce) ||
      !Number.isSafeInteger(expiresAtMs) ||
      channel !== configuredChannel
    ) {
      return { ok: false, reason: 'invalid' };
    }

    const now = Date.now();
    if (expiresAtMs <= now) return { ok: false, reason: 'expired' };
    if (expiresAtMs > now + TEST_LINK_TTL_MS + 60_000) return { ok: false, reason: 'invalid' };

    return {
      ok: true,
      testId: nonce,
      channel,
      threadTs,
      expiresAtMs,
      cycle: {
        cycleId: `test-${nonce}`,
        label: 'Temporary Slack test',
        formExpiresAtMs: expiresAtMs,
        alertChannel: channel,
        alertTs: threadTs,
        status: 'test'
      }
    };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}
