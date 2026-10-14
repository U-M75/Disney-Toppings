import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const RETENTION_DAYS = 90;

export function getSupabase() {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    },
    global: {
      headers: { 'X-Client-Info': 'ksc-disney-topping-update' }
    }
  });
}

function throwDatabaseError(error, action) {
  if (error) throw new Error(`Supabase ${action} failed (${error.code || 'database_error'}).`);
}

function cycleFromRow(row) {
  if (!row) return null;
  return {
    cycleId: row.cycle_id,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    formExpiresAtMs: Number(row.form_expires_at_ms),
    formUrl: row.form_url,
    alertChannel: row.alert_channel,
    alertTs: row.alert_ts,
    alertSentAt: row.alert_sent_at,
    reminderSentAt: row.reminder_sent_at,
    status: row.status,
    submittedAt: row.submitted_at,
    submissionName: row.submission_name,
    submissionLocation: row.submission_location,
    submissionNeededCount: row.submission_needed_count
  };
}

function cycleToRow(cycle) {
  return {
    cycle_id: cycle.cycleId,
    label: cycle.label,
    created_at: cycle.createdAt,
    updated_at: cycle.updatedAt || new Date().toISOString(),
    form_expires_at_ms: String(cycle.formExpiresAtMs),
    form_url: cycle.formUrl,
    alert_channel: cycle.alertChannel || null,
    alert_ts: cycle.alertTs || null,
    alert_sent_at: cycle.alertSentAt || null,
    reminder_sent_at: cycle.reminderSentAt || null,
    status: cycle.status,
    submitted_at: cycle.submittedAt || null,
    submission_name: cycle.submissionName || null,
    submission_location: cycle.submissionLocation || null,
    submission_needed_count: Number.isInteger(cycle.submissionNeededCount) ? cycle.submissionNeededCount : null
  };
}

export async function getCycle(supabase, cycleId) {
  const { data, error } = await supabase
    .from('ksc_cycles')
    .select('*')
    .eq('cycle_id', cycleId)
    .maybeSingle();
  throwDatabaseError(error, 'cycle lookup');
  return cycleFromRow(data);
}

export async function getLatestCycle(supabase) {
  const { data, error } = await supabase
    .from('ksc_cycles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  throwDatabaseError(error, 'latest cycle lookup');
  return cycleFromRow(data);
}

export async function saveCycle(supabase, cycle) {
  const { error } = await supabase
    .from('ksc_cycles')
    .upsert(cycleToRow(cycle), { onConflict: 'cycle_id' });
  throwDatabaseError(error, 'cycle save');
}

export async function getSubmission(supabase, cycleId) {
  const { data, error } = await supabase
    .from('ksc_submissions')
    .select('payload')
    .eq('cycle_id', cycleId)
    .maybeSingle();
  throwDatabaseError(error, 'submission lookup');
  return data?.payload || null;
}

export async function saveSubmission(supabase, cycleId, submission) {
  const { error } = await supabase
    .from('ksc_submissions')
    .upsert({
      cycle_id: cycleId,
      payload: submission,
      created_at: submission.submittedAt,
      updated_at: submission.submittedAt
    }, { onConflict: 'cycle_id' });
  throwDatabaseError(error, 'submission save');
}

export async function registerBlobUrl(supabase, cycleId, url) {
  const { error } = await supabase
    .from('ksc_uploaded_photos')
    .upsert({ cycle_id: cycleId, url }, { onConflict: 'url' });
  throwDatabaseError(error, 'photo registration');
}

export async function getAllowedBlob(supabase, cycleId, url) {
  const { data, error } = await supabase
    .from('ksc_uploaded_photos')
    .select('url')
    .eq('cycle_id', cycleId)
    .eq('url', url)
    .maybeSingle();
  throwDatabaseError(error, 'photo verification');
  return Boolean(data);
}

export async function removeAllowedBlob(supabase, url) {
  const { error } = await supabase
    .from('ksc_uploaded_photos')
    .delete()
    .eq('url', url);
  throwDatabaseError(error, 'photo cleanup');
}

export async function acquireLock(supabase, lockName, validForSeconds = 90) {
  const ownerId = randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + validForSeconds * 1000).toISOString();
  const row = { lock_key: lockName, owner_id: ownerId, expires_at: expiresAt };

  let result = await supabase.from('ksc_locks').insert(row);
  if (!result.error) return ownerId;
  if (result.error.code !== '23505') throwDatabaseError(result.error, 'lock acquisition');

  const cleanup = await supabase
    .from('ksc_locks')
    .delete()
    .eq('lock_key', lockName)
    .lt('expires_at', nowIso);
  throwDatabaseError(cleanup.error, 'expired lock cleanup');

  result = await supabase.from('ksc_locks').insert(row);
  if (!result.error) return ownerId;
  if (result.error.code === '23505') return null;
  throwDatabaseError(result.error, 'lock acquisition');
}

export async function releaseLock(supabase, lockName, ownerId) {
  if (!ownerId) return;
  const { error } = await supabase
    .from('ksc_locks')
    .delete()
    .eq('lock_key', lockName)
    .eq('owner_id', ownerId);
  throwDatabaseError(error, 'lock release');
}

export async function cleanupOldRecords(supabase) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const expiredLockTime = new Date().toISOString();
  const locks = await supabase.from('ksc_locks').delete().lt('expires_at', expiredLockTime);
  throwDatabaseError(locks.error, 'expired lock cleanup');
  const photos = await supabase.from('ksc_uploaded_photos').delete().lt('created_at', cutoff);
  throwDatabaseError(photos.error, 'photo retention cleanup');
  const submissions = await supabase.from('ksc_submissions').delete().lt('created_at', cutoff);
  throwDatabaseError(submissions.error, 'submission retention cleanup');
  const cycles = await supabase.from('ksc_cycles').delete().lt('created_at', cutoff);
  throwDatabaseError(cycles.error, 'cycle retention cleanup');
}
