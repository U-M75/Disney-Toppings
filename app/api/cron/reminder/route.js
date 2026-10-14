import { getAppTimezone } from '../../../../lib/config';
import { checkCronAuthorization } from '../../../../lib/cron-auth';
import { getRedis, getCycle, getSubmission, latestCycleKey, lockKey, saveCycle } from '../../../../lib/redis';
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

    const redis = getRedis();
    const cycleId = await redis.get(latestCycleKey());
    if (!cycleId || typeof cycleId !== 'string') {
      return json({ ok: true, skipped: true, reason: 'No topping update cycle exists yet.' });
    }

    let cycle = await getCycle(redis, cycleId);
    if (!cycle) return json({ ok: true, skipped: true, reason: 'The latest cycle record is unavailable.', cycleId });
    if (cycle.reminderSentAt) {
      return json({ ok: true, skipped: true, reason: 'A reminder was already posted for this cycle.', cycleId });
    }
    if (cycle.submittedAt || await getSubmission(redis, cycleId)) {
      return json({ ok: true, skipped: true, reason: 'This cycle already has a submission.', cycleId });
    }
    if (!cycle.alertChannel || !cycle.alertTs || !cycle.formUrl) {
      return json({ ok: false, skipped: true, reason: 'The alert thread is not available for this cycle.', cycleId }, 409);
    }

    const lock = lockKey('reminder', cycleId);
    const lockResult = await redis.set(lock, String(Date.now()), { nx: true, ex: 90 });
    if (!lockResult) return json({ ok: true, skipped: true, reason: 'A reminder for this cycle is already processing.', cycleId });

    try {
      cycle = await getCycle(redis, cycleId);
      if (!cycle || cycle.reminderSentAt || cycle.submittedAt || await getSubmission(redis, cycleId)) {
        return json({ ok: true, skipped: true, reason: 'The cycle no longer needs a reminder.', cycleId });
      }
      await postReminderMessage({ channel: cycle.alertChannel, threadTs: cycle.alertTs, formUrl: cycle.formUrl });
      const updatedCycle = { ...cycle, reminderSentAt: new Date().toISOString() };
      await saveCycle(redis, updatedCycle);
      return json({ ok: true, posted: true, cycleId, alertChannel: cycle.alertChannel });
    } catch {
      return json({ ok: false, error: 'The reminder could not be posted. The saved cycle is unchanged, so the scheduler can retry.' }, 502);
    } finally {
      await redis.del(lock).catch(() => {});
    }
  } catch {
    return json({ ok: false, error: 'The reminder could not be prepared because Redis or the application configuration is unavailable.' }, 503);
  }
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}
