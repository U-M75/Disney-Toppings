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
