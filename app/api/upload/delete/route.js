import { del } from '@vercel/blob';
import { getAllowedBlob, getSupabase, removeAllowedBlob } from '../../../../lib/supabase';
import { resolveFormToken } from '../../../../lib/token';
import { isSafeVercelBlobUrl } from '../../../../lib/validation';
import { hasRequiredAuthSession } from '../../../../lib/otp-auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    if (!await hasRequiredAuthSession('staff')) {
      return Response.json({ ok: false, code: 'AUTH_REQUIRED', error: 'Your Slack sign-in has expired.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }
  } catch {
    return Response.json({ ok: false, error: 'Secure sign-in could not be checked right now.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

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
    const supabase = getSupabase();
    const resolved = await resolveFormToken(body?.token, supabase);
    if (!resolved.ok) return Response.json({ ok: false, error: 'This form link is no longer valid.' }, { status: 401 });
    const url = body?.url;
    if (!isSafeVercelBlobUrl(url) || !await getAllowedBlob(supabase, resolved.cycleId, url)) {
      return Response.json({ ok: false, error: 'That photo cannot be removed by this form.' }, { status: 403 });
    }
    await del(url);
    await removeAllowedBlob(supabase, url);
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false, error: 'The photo could not be removed right now.' }, { status: 503 });
  }
}
