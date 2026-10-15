create table if not exists public.ksc_cycles (
  cycle_id text primary key,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  form_expires_at_ms bigint not null,
  form_url text not null,
  alert_channel text,
  alert_ts text,
  alert_sent_at timestamptz,
  reminder_sent_at timestamptz,
  status text not null check (status in ('sending', 'active', 'alert_failed')),
  submitted_at timestamptz,
  submission_name text,
  submission_location text,
  submission_needed_count integer
);

create index if not exists ksc_cycles_created_at_desc_idx
  on public.ksc_cycles (created_at desc);

create table if not exists public.ksc_submissions (
  cycle_id text primary key references public.ksc_cycles (cycle_id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ksc_uploaded_photos (
  url text primary key,
  cycle_id text not null references public.ksc_cycles (cycle_id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ksc_uploaded_photos_cycle_idx
  on public.ksc_uploaded_photos (cycle_id);

create table if not exists public.ksc_locks (
  lock_key text primary key,
  owner_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.ksc_cycles enable row level security;
alter table public.ksc_submissions enable row level security;
alter table public.ksc_uploaded_photos enable row level security;
alter table public.ksc_locks enable row level security;

revoke all on table public.ksc_cycles from anon, authenticated;
revoke all on table public.ksc_submissions from anon, authenticated;
revoke all on table public.ksc_uploaded_photos from anon, authenticated;
revoke all on table public.ksc_locks from anon, authenticated;

grant all on table public.ksc_cycles to service_role;
grant all on table public.ksc_submissions to service_role;
grant all on table public.ksc_uploaded_photos to service_role;
grant all on table public.ksc_locks to service_role;

-- Slack OAuth + one-time verification codes and 24-hour sessions.
create table if not exists public.ksc_auth_challenges (
  challenge_id uuid primary key,
  purpose text not null check (purpose in ('staff', 'test_console')),
  slack_user_id text not null,
  slack_team_id text not null,
  code_hash text not null,
  return_to text not null,
  dm_channel text,
  dm_ts text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5)
);

create index if not exists ksc_auth_challenges_user_created_idx
  on public.ksc_auth_challenges (slack_user_id, created_at desc);

create index if not exists ksc_auth_challenges_expiry_idx
  on public.ksc_auth_challenges (expires_at);

create table if not exists public.ksc_auth_sessions (
  session_id uuid primary key,
  token_hash text not null unique,
  purpose text not null check (purpose in ('all', 'staff', 'test_console')),
  slack_user_id text not null,
  slack_team_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

alter table public.ksc_auth_sessions
  drop constraint if exists ksc_auth_sessions_purpose_check;
alter table public.ksc_auth_sessions
  add constraint ksc_auth_sessions_purpose_check
  check (purpose in ('all', 'staff', 'test_console'));

create index if not exists ksc_auth_sessions_expiry_idx
  on public.ksc_auth_sessions (expires_at);

alter table public.ksc_auth_challenges enable row level security;
alter table public.ksc_auth_sessions enable row level security;

revoke all on table public.ksc_auth_challenges from anon, authenticated;
revoke all on table public.ksc_auth_sessions from anon, authenticated;
grant all on table public.ksc_auth_challenges to service_role;
grant all on table public.ksc_auth_sessions to service_role;

create or replace function public.ksc_consume_auth_challenge(
  p_challenge_id uuid,
  p_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge public.ksc_auth_challenges%rowtype;
begin
  select * into challenge
    from public.ksc_auth_challenges
    where challenge_id = p_challenge_id
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'missing');
  end if;
  if challenge.consumed_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'used');
  end if;
  if challenge.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if challenge.failed_attempts >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;
  if challenge.code_hash <> p_code_hash then
    update public.ksc_auth_challenges
      set failed_attempts = failed_attempts + 1
      where challenge_id = p_challenge_id;
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  update public.ksc_auth_challenges
    set consumed_at = now()
    where challenge_id = p_challenge_id;

  return jsonb_build_object(
    'ok', true,
    'purpose', challenge.purpose,
    'slack_user_id', challenge.slack_user_id,
    'slack_team_id', challenge.slack_team_id,
    'dm_channel', challenge.dm_channel,
    'dm_ts', challenge.dm_ts,
    'return_to', challenge.return_to
  );
end;
$$;

revoke all on function public.ksc_consume_auth_challenge(uuid, text) from public, anon, authenticated;
grant execute on function public.ksc_consume_auth_challenge(uuid, text) to service_role;
