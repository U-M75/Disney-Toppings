import { cookies } from 'next/headers';
import { getBins } from '../../../../lib/config';
import { DASHBOARD_COOKIE_NAME, verifyDashboardSession } from '../../../../lib/dashboard-auth';
import { getSupabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function safeText(value, limit = 120) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
    : '';
}

function normalizeSubmission(row, binsByNumber) {
  const payload = row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : {};
  const answers = Array.isArray(payload.answers) ? payload.answers : [];
  const normalizedAnswers = answers.map((answer) => {
    const binNumber = Number(answer?.bin);
    if (!Number.isInteger(binNumber) || !binsByNumber.has(binNumber)) return null;
    const styleNames = Array.isArray(answer.styleNames)
      ? answer.styleNames.slice(0, 20).map((name) => safeText(name, 80)).filter(Boolean)
      : [];
    return {
      bin: binNumber,
      label: binsByNumber.get(binNumber),
      styleNames,
      status: answer.status === 'needed' ? 'needed' : 'not_needed',
      hasPhoto: typeof answer.photoUrl === 'string' && Boolean(answer.photoUrl.trim())
    };
  }).filter(Boolean).sort((a, b) => a.bin - b.bin);
  const neededCount = normalizedAnswers.filter((answer) => answer.status === 'needed').length;

  return {
    cycleId: safeText(row?.cycle_id, 80),
    name: safeText(payload.name, 80) || 'Unknown associate',
    location: safeText(payload.location, 100) || 'Unspecified',
    submittedAt: safeText(payload.submittedAt, 40) || safeText(row?.updated_at, 40),
    updated: Boolean(payload.isUpdated),
    neededCount,
    notNeededCount: normalizedAnswers.filter((answer) => answer.status === 'not_needed').length,
    answers: normalizedAnswers
  };
}

export async function GET() {
  const session = cookies().get(DASHBOARD_COOKIE_NAME)?.value;
  if (!verifyDashboardSession(session)) return json({ ok: false, error: 'Manager sign-in has expired. Please sign in again.' }, 401);

  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await getSupabase()
      .from('ksc_submissions')
      .select('cycle_id,payload,updated_at')
      .gte('updated_at', cutoff)
      .order('updated_at', { ascending: false })
      .limit(500);
    if (error) throw new Error('dashboard_query_failed');

    const binsByNumber = new Map(getBins().map((bin) => [bin.number, bin.label]));
    const submissions = (data || []).map((row) => normalizeSubmission(row, binsByNumber));
    return json({ ok: true, rangeDays: 90, submissions });
  } catch {
    return json({ ok: false, error: 'The dashboard could not load recent submissions. Please try again shortly.' }, 503);
  }
}
