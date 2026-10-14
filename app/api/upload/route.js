import { handleUpload } from '@vercel/blob/client';
import { ALLOWED_IMAGE_TYPES, getRequiredEnv } from '../../../lib/config';
import { getRedis, registerBlobUrl } from '../../../lib/redis';
import { resolveFormToken } from '../../../lib/token';
import { isSafeVercelBlobUrl } from '../../../lib/validation';

export const dynamic = 'force-dynamic';

function uploadError(message, status = 400) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return uploadError('Photo uploads are not configured. Ask an administrator to connect a Vercel Blob store.', 503);
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
        const redis = getRedis();
        const resolved = await resolveFormToken(token, redis);
        if (!resolved.ok) throw new Error(resolved.reason === 'expired' ? 'This form link has expired.' : 'This form link is not valid.');
        const fileName = String(pathname || '').split('/').pop() || '';
        if (!/^[A-Za-z0-9_.-]{1,180}$/.test(fileName)) throw new Error('The photo file name was not accepted.');
        return {
          allowedContentTypes: ALLOWED_IMAGE_TYPES,
          maximumSizeInBytes: 5 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ cycleId: resolved.cycleId })
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = JSON.parse(tokenPayload || '{}');
        if (!payload.cycleId || !isSafeVercelBlobUrl(blob?.url)) throw new Error('The uploaded photo could not be verified.');
        const redis = getRedis();
        await registerBlobUrl(redis, payload.cycleId, blob.url);
      }
    });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const safeMessage = /expired|not valid|not accepted|could not be verified/i.test(message)
      ? message
      : 'The photo could not be authorized for upload. Please try again.';
    return uploadError(safeMessage, /Redis credentials|FORM_SECRET/.test(message) ? 503 : 400);
  }
}
