import { del } from '@vercel/blob';
import { getRedis, getAllowedBlob, removeAllowedBlob } from '../../../../lib/redis';
import { resolveFormToken } from '../../../../lib/token';
import { isSafeVercelBlobUrl } from '../../../../lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return Response.json({ ok: false, error: 'Photo cleanup is not configured.' }, { status: 503 });
  }

  try {
    const redis = getRedis();
    const resolved = await resolveFormToken(body?.token, redis);
    if (!resolved.ok) return Response.json({ ok: false, error: 'This form link is no longer valid.' }, { status: 401 });
    const url = body?.url;
    if (!isSafeVercelBlobUrl(url) || !await getAllowedBlob(redis, resolved.cycleId, url)) {
      return Response.json({ ok: false, error: 'That photo cannot be removed by this form.' }, { status: 403 });
    }
    await del(url);
    await removeAllowedBlob(redis, url);
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false, error: 'The photo could not be removed right now.' }, { status: 503 });
  }
}
