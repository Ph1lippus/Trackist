-- Keep notification checks bounded while allowing failed checks to retry.
create table if not exists public.notification_check_runs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_completed_at timestamptz not null
);

alter table public.notification_check_runs enable row level security;

revoke all on public.notification_check_runs from anon, authenticated;

create index if not exists idx_notification_check_runs_completed
  on public.notification_check_runs (last_completed_at);
