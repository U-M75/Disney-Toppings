import { getAppTimezone } from '../../../../lib/config';
import { checkCronAuthorization } from '../../../../lib/cron-auth';
import { acquireLock, cleanupOldRecords, getCycle, getLatestCycle, getSubmission, getSupabase, releaseLock, saveCycle } from '../../../../lib/supabase';
import { isReminderPacificWindow } from '../../../../lib/time';
import { postReminderMessage } from '../../../../lib/slack';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function handle(request) {
  const auth = checkCronAuthorization(request);
  if (!auth.configured) return json({ ok: false, error: 'CRON_SECRET is not configured.' }, 500);
  if (!auth.authorized) return json({ ok: false, error: 'Unauthorized.' }, 401);

  try {
    const requestUrl = new URL(request.url);
    const timezone = getAppTimezone();
    if (requestUrl.searchParams.get('guard') === 'pacific' && !isReminderPacificWindow(new Date(), timezone)) {
      return json({ ok: true, skipped: true, reason: 'Outside the Friday/Monday 8 AM timezone window.' });
    }

    const supabase = getSupabase();
    await cleanupOldRecords(supabase).catch(() => {});
    let cycle = await getLatestCycle(supabase);
    if (!cycle) return json({ ok: true, skipped: true, reason: 'No topping update cycle exists yet.' });
    const cycleId = cycle.cycleId;
    if (cycle.reminderSentAt) {
      return json({ ok: true, skipped: true, reason: 'A reminder was already posted for this cycle.', cycleId });
    }
    if (cycle.submittedAt || await getSubmission(supabase, cycleId)) {
      return json({ ok: true, skipped: true, reason: 'This cycle already has a submission.', cycleId });
    }
    if (!cycle.alertChannel || !cycle.alertTs || !cycle.formUrl) {
      return json({ ok: false, skipped: true, reason: 'The alert thread is not available for this cycle.', cycleId }, 409);
    }

    const lock = `reminder:${cycleId}`;
    const lockOwner = await acquireLock(supabase, lock, 90);
    if (!lockOwner) return json({ ok: true, skipped: true, reason: 'A reminder for this cycle is already processing.', cycleId });

    try {
      cycle = await getCycle(supabase, cycleId);
      if (!cycle || cycle.reminderSentAt || cycle.submittedAt || await getSubmission(supabase, cycleId)) {
        return json({ ok: true, skipped: true, reason: 'The cycle no longer needs a reminder.', cycleId });
      }
      await postReminderMessage({ channel: cycle.alertChannel, threadTs: cycle.alertTs, formUrl: cycle.formUrl });
      const updatedCycle = { ...cycle, reminderSentAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await saveCycle(supabase, updatedCycle);
      return json({ ok: true, posted: true, cycleId, alertChannel: cycle.alertChannel });
    } catch {
      return json({ ok: false, error: 'The reminder could not be posted. The saved cycle is unchanged, so the scheduler can retry.' }, 502);
    } finally {
      await releaseLock(supabase, lock, lockOwner).catch(() => {});
    }
  } catch {
    return json({ ok: false, error: 'The reminder could not be prepared because Supabase or the application configuration is unavailable.' }, 503);
  }
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}
