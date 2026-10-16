import defaultBins from '../config/bins';

export const DEFAULT_TIME_ZONE = 'America/Los_Angeles';
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic'
];

export function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function getAppTimezone() {
  return process.env.APP_TIMEZONE?.trim() || DEFAULT_TIME_ZONE;
}

export function getLocations() {
  const raw = process.env.LOCATIONS;
  const locations = (raw === undefined || raw.trim() === '' ? 'Disney CA' : raw)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (locations.length === 0 || locations.length > 50) {
    throw new Error('LOCATIONS must contain between 1 and 50 comma-separated locations.');
  }
  if (locations.some((location) => location.length > 100)) {
    throw new Error('Each LOCATIONS entry must be 100 characters or fewer.');
  }
  return [...new Set(locations)];
}

export function getBins() {
  return defaultBins;
}

export function getFormLinkValidHours() {
  const raw = process.env.FORM_LINK_VALID_HOURS?.trim();
  if (!raw) return 72;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours < 1 || hours > 8760) {
    throw new Error('FORM_LINK_VALID_HOURS must be a number from 1 to 8760.');
  }
  return hours;
}

export function getAppBaseUrl() {
  const raw = getRequiredEnv('APP_BASE_URL').replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('APP_BASE_URL must be a valid public URL.');
  }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('APP_BASE_URL must be a site origin such as https://example.vercel.app, without a path or trailing slash.');
  }
  if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
    throw new Error('APP_BASE_URL must use HTTPS outside local development.');
  }
  return raw;
}

export function getSlackAlertMention() {
  if (process.env.SLACK_ALERT_MENTION === undefined) return '<!here>';
  return process.env.SLACK_ALERT_MENTION.trim();
}
