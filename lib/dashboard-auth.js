import { createHmac, timingSafeEqual } from 'node:crypto';
import { getRequiredEnv } from './config';

export const DASHBOARD_COOKIE_NAME = 'ksc-dashboard-session';
export const DASHBOARD_SESSION_SECONDS = 12 * 60 * 60;
const DASHBOARD_SESSION_MS = DASHBOARD_SESSION_SECONDS * 1000;

export function isDashboardSecretConfigured() {
  return Boolean(process.env.DASHBOARD_SECRET?.trim());
}

function signatureForExpiry(expiresAt) {
  return createHmac('sha256', getRequiredEnv('DASHBOARD_SECRET'))
    .update(`ksc-dashboard-session:${expiresAt}`)
    .digest('base64url');
}

export function verifyDashboardPassword(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0 || candidate.length > 512) return false;
  const expected = Buffer.from(getRequiredEnv('DASHBOARD_SECRET'), 'utf8');
  const received = Buffer.from(candidate, 'utf8');
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

export function createDashboardSession() {
  const expiresAt = Date.now() + DASHBOARD_SESSION_MS;
  return `${expiresAt}.${signatureForExpiry(expiresAt)}`;
}

export function verifyDashboardSession(value) {
  if (!isDashboardSecretConfigured() || typeof value !== 'string' || value.length > 120) return false;
  const match = value.match(/^(\d{13})\.([A-Za-z0-9_-]{40,50})$/);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + DASHBOARD_SESSION_MS + 60_000) return false;

  try {
    const expected = Buffer.from(signatureForExpiry(expiresAt), 'utf8');
    const received = Buffer.from(match[2], 'utf8');
    return expected.length === received.length && timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}
