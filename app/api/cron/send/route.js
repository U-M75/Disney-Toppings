import { getAppBaseUrl, getAppTimezone, getFormLinkValidHours, getRequiredEnv } from '../../../../lib/config';
import { checkCronAuthorization } from '../../../../lib/cron-auth';
import { acquireLock, cleanupOldRecords, getCycle, getSupabase, releaseLock, saveCycle } from '../../../../lib/supabase';
import { createFormToken } from '../../../../lib/token';
import { formatExpiryDateTime, getCycleLabel, getPacificDateKey, isSendPacificWindow } from '../../../../lib/time';
import { postAlertMessage } from '../../../../lib/slack';

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
    const now = new Date();
    const timezone = getAppTimezone();
    if (requestUrl.searchParams.get('guard') === 'pacific' && !isSendPacificWindow(now, timezone)) {
      return json({ ok: true, skipped: true, reason: 'Outside the Thursday 10:45 PM / Sunday 11 PM timezone windows.' });
    }

    const supabase = getSupabase();
    await cleanupOldRecords(supabase).catch(() => {});
    const cycleId = getPacificDateKey(now, timezone);
    const force = requestUrl.searchParams.get('force') === '1';
    const currentToken = createFormToken(cycleId);
    const formUrl = `${getAppBaseUrl()}/f/${encodeURIComponent(currentToken)}`;
    const channel = getRequiredEnv('SLACK_ALERT_CHANNEL_ID');
    const hours = getFormLinkValidHours();
    const expiresAtMs = now.getTime() + hours * 60 * 60 * 1000;
    const lock = `send:${cycleId}`;
    const lockOwner = await acquireLock(supabase, lock, 90);
    if (!lockOwner) return json({ ok: true, skipped: true, reason: 'A send for this cycle is already processing.', cycleId });

    try {
      const previous = await getCycle(supabase, cycleId);
      if (previous && !force) {
        return json({
          ok: true,
          skipped: true,
          reason: 'A cycle for this Pacific date already exists.',
          cycleId,
          status: previous.status,
          alertTs: previous.alertTs || null
        });
      }

      const cycle = {
        ...(previous || {}),
        cycleId,
        label: getCycleLabel(now, timezone),
        createdAt: previous?.createdAt || now.toISOString(),
        updatedAt: now.toISOString(),
        formExpiresAtMs: expiresAtMs,
        formUrl,
        alertChannel: previous?.alertChannel || channel,
        alertTs: previous?.alertTs || null,
        reminderSentAt: previous?.reminderSentAt || null,
        status: 'sending'
      };
      await saveCycle(supabase, cycle);

      try {
        const posted = await postAlertMessage({ channel, formUrl, expiresAt: expiresAtMs });
        const activeCycle = {
          ...cycle,
          status: 'active',
          alertChannel: posted.channel || channel,
          alertTs: posted.ts,
          alertSentAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await saveCycle(supabase, activeCycle);
        return json({
          ok: true,
          posted: true,
          forced: force,
          cycleId,
          label: activeCycle.label,
          alertChannel: activeCycle.alertChannel,
          alertTs: activeCycle.alertTs,
          expiresAt: formatExpiryDateTime(new Date(expiresAtMs), timezone)
        });
      } catch {
        const failedCycle = { ...cycle, status: 'alert_failed', updatedAt: new Date().toISOString() };
        await saveCycle(supabase, failedCycle).catch(() => {});
        return json({
          ok: false,
          posted: false,
          cycleId,
          error: 'The cycle was saved, but Slack could not post the alert. Check the Slack bot token, channel access, and app scopes, then retry with force=1.'
        }, 502);
      }
    } finally {
      await releaseLock(supabase, lock, lockOwner).catch(() => {});
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The alert could not be prepared.';
    const isConfiguration = /required|must be|credentials/i.test(message);
    return json({ ok: false, error: isConfiguration ? message : 'The alert could not be prepared because Supabase or the application configuration is unavailable.' }, isConfiguration ? 500 : 503);
  }
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}
