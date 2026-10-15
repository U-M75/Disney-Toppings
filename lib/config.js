import defaultStyles from '../config/styles';

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

export function getStyles() {
  const raw = process.env.STYLES_JSON?.trim();
  if (!raw) return defaultStyles;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('STYLES_JSON is not valid JSON.');
  }

  if (!Array.isArray(parsed) || parsed.length !== 28) {
    throw new Error('STYLES_JSON must be a JSON array containing exactly 28 styles.');
  }

  const ids = new Set();
  return parsed.map((style, index) => {
    if (!style || typeof style !== 'object' || Array.isArray(style)) {
      throw new Error(`STYLES_JSON item ${index + 1} must be an object.`);
    }
    const id = typeof style.id === 'string' ? style.id.trim() : '';
    const name = typeof style.name === 'string' ? style.name.trim() : '';
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
      throw new Error(`STYLES_JSON item ${index + 1} needs a simple id (letters, numbers, underscores, or hyphens).`);
    }
    if (!name || name.length > 120) {
      throw new Error(`STYLES_JSON item ${index + 1} needs a name between 1 and 120 characters.`);
    }
    if (ids.has(id)) throw new Error(`STYLES_JSON contains the duplicate id "${id}".`);
    ids.add(id);

    let imageUrl;
    if (style.imageUrl !== undefined && style.imageUrl !== null && style.imageUrl !== '') {
      try {
        const parsedUrl = new URL(style.imageUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('invalid protocol');
        imageUrl = parsedUrl.toString();
      } catch {
        throw new Error(`STYLES_JSON item ${index + 1} has an invalid imageUrl.`);
      }
    }

    return imageUrl ? { id, name, imageUrl } : { id, name };
  });
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
