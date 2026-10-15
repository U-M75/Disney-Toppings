import { put } from '@vercel/blob';
import { handleUpload } from '@vercel/blob/client';
import { ALLOWED_IMAGE_TYPES, MAX_PHOTO_BYTES, getRequiredEnv } from '../../../lib/config';
import { getSupabase, registerBlobUrl } from '../../../lib/supabase';
import { resolveFormToken } from '../../../lib/token';
import { isSafeVercelBlobUrl } from '../../../lib/validation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_PROXY_UPLOAD_BYTES = 4 * 1024 * 1024;

function uploadError(message, status = 400) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function extensionForType(contentType) {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/heic') return 'heic';
  return 'jpg';
}

async function handleSameOriginUpload(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return uploadError('The photo upload request was not valid.', 400);
  }

  const clientPayload = form.get('clientPayload');
  const styleId = form.get('styleId');
  const file = form.get('file');
  if (typeof clientPayload !== 'string' || !clientPayload) return uploadError('This form link is not valid.', 400);
  if (typeof styleId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(styleId)) return uploadError('The style was not accepted.', 400);
  if (!file || typeof file.arrayBuffer !== 'function' || typeof file.size !== 'number') return uploadError('Choose a photo to upload.', 400);
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return uploadError('Choose a JPEG, PNG, WebP, or HEIC photo.', 415);
  if (file.size <= 0) return uploadError('The selected photo is empty.', 400);
  if (file.size > MAX_PHOTO_BYTES) return uploadError('The photo is larger than the 5 MB limit.', 413);
  if (file.size > MAX_PROXY_UPLOAD_BYTES) return uploadError('This photo is too large for the quick upload path. Choose a smaller photo.', 413);

  try {
    getRequiredEnv('FORM_SECRET');
    const supabase = getSupabase();
    const resolved = await resolveFormToken(clientPayload, supabase);
    if (!resolved.ok) {
      return uploadError(resolved.reason === 'expired' ? 'This form link has expired.' : 'This form link is not valid.', 400);
    }

    const pathname = `topping-${styleId}-${Date.now()}.${extensionForType(file.type)}`;
    const blob = await put(pathname, file, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.type
    });
    if (!isSafeVercelBlobUrl(blob?.url)) throw new Error('The uploaded photo could not be verified.');
    await registerBlobUrl(supabase, resolved.cycleId, blob.url);
    return Response.json({ url: blob.url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const safeMessage = /expired|not valid|not accepted|could not be verified/i.test(message)
      ? message
      : 'The photo could not be saved to storage. Please try again.';
    return uploadError(safeMessage, /Supabase|SUPABASE_|FORM_SECRET|database_error/i.test(message) ? 503 : 502);
  }
}

export async function POST(request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return uploadError('Photo uploads are not configured. Ask an administrator to connect a Vercel Blob store.', 503);
  }

  if (request.headers.get('content-type')?.toLowerCase().includes('multipart/form-data')) {
    return handleSameOriginUpload(request);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return uploadError('The photo upload request was not valid JSON.');
  }

  try {
    getRequiredEnv('FORM_SECRET');
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const token = typeof clientPayload === 'string' ? clientPayload : '';
        const supabase = getSupabase();
        const resolved = await resolveFormToken(token, supabase);
        if (!resolved.ok) throw new Error(resolved.reason === 'expired' ? 'This form link has expired.' : 'This form link is not valid.');
        const fileName = String(pathname || '').split('/').pop() || '';
        if (!/^[A-Za-z0-9_.-]{1,180}$/.test(fileName)) throw new Error('The photo file name was not accepted.');
        return {
          allowedContentTypes: ALLOWED_IMAGE_TYPES,
          maximumSizeInBytes: MAX_PHOTO_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ cycleId: resolved.cycleId })
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = JSON.parse(tokenPayload || '{}');
        if (!payload.cycleId || !isSafeVercelBlobUrl(blob?.url)) throw new Error('The uploaded photo could not be verified.');
        const supabase = getSupabase();
        await registerBlobUrl(supabase, payload.cycleId, blob.url);
      }
    });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const safeMessage = /expired|not valid|not accepted|could not be verified/i.test(message)
      ? message
      : 'The photo could not be authorized for upload. Please try again.';
    return uploadError(safeMessage, /Supabase|SUPABASE_|FORM_SECRET|database_error/i.test(message) ? 503 : 400);
  }
}
