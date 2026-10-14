import { createHmac, timingSafeEqual } from 'node:crypto';
import { getRequiredEnv } from './config';
import { getCycle } from './redis';

export function createFormToken(cycleId) {
  const signature = createHmac('sha256', getRequiredEnv('FORM_SECRET'))
    .update(cycleId)
    .digest('base64url');
  return `${cycleId}.${signature}`;
}

export function verifyFormTokenSignature(token) {
  if (typeof token !== 'string' || token.length > 240) return { ok: false, reason: 'invalid' };
  const match = token.match(/^(\d{4}-\d{2}-\d{2})\.([A-Za-z0-9_-]{40,50})$/);
  if (!match) return { ok: false, reason: 'invalid' };

  const [, cycleId, receivedSignature] = match;
  const expectedSignature = createHmac('sha256', getRequiredEnv('FORM_SECRET'))
    .update(cycleId)
    .digest('base64url');
  const expected = Buffer.from(expectedSignature, 'utf8');
  const received = Buffer.from(receivedSignature, 'utf8');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, cycleId };
}

export async function resolveFormToken(token, redis) {
  const verified = verifyFormTokenSignature(token);
  if (!verified.ok) return verified;

  const cycle = await getCycle(redis, verified.cycleId);
  if (!cycle || cycle.cycleId !== verified.cycleId) return { ok: false, reason: 'missing' };
  const expiresAtMs = Number(cycle.formExpiresAtMs);
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, cycleId: verified.cycleId, cycle };
}
