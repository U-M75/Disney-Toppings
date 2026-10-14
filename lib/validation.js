import { ALLOWED_IMAGE_TYPES, MAX_PHOTO_BYTES } from './config';

export function isSafeVercelBlobUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.hostname.endsWith('.public.blob.vercel-storage.com') &&
      url.pathname.length > 1;
  } catch {
    return false;
  }
}

export function isAllowedImageType(value) {
  return ALLOWED_IMAGE_TYPES.includes(String(value || '').toLowerCase());
}

export function isWithinPhotoLimit(size) {
  return Number.isFinite(size) && size > 0 && size <= MAX_PHOTO_BYTES;
}

export function cleanPersonName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function cleanSlackText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\*_~`]/g, '\\$&');
}
