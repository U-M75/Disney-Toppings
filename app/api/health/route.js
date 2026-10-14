import { getSupabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

const ENV_NAMES = [
  'SLACK_BOT_TOKEN',
  'SLACK_ALERT_CHANNEL_ID',
  'SLACK_RESULTS_CHANNEL_ID',
  'SLACK_ALERT_MENTION',
  'FORM_SECRET',
  'CRON_SECRET',
  'APP_BASE_URL',
  'BLOB_READ_WRITE_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'APP_TIMEZONE',
  'LOCATIONS',
  'STYLES_JSON',
  'REQUIRE_PHOTO',
  'SHOW_BAGS_FIELD',
  'FORM_LINK_VALID_HOURS'
];

export async function GET() {
  const env = Object.fromEntries(ENV_NAMES.map((name) => [name, Boolean(process.env[name]?.trim())]));
  let supabaseReachable = false;
  try {
    const { error } = await getSupabase()
      .from('ksc_cycles')
      .select('cycle_id', { head: true, count: 'exact' })
      .limit(1);
    supabaseReachable = !error;
  } catch {
    supabaseReachable = false;
  }
  return Response.json(
    { ok: supabaseReachable, env, supabaseReachable },
    { status: supabaseReachable ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
