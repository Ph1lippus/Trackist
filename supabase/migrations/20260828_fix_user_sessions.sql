-- Migration: Fix user_sessions table explosion + 30-day retention cleanup
-- Paste this into the Supabase SQL Editor and run it.
--
-- PROBLEM FIXED HERE:
--   user_sessions had NO unique constraint, and the device-fingerprint function
--   used a check-then-insert. When the client fired several concurrent register
--   calls (rapid effect re-runs / 5-min token refresh), each passed the "no row
--   yet" check and inserted a duplicate -> hundreds of rows for ONE device/session.
--
-- THIS MIGRATION:
--   1. Dedupes existing rows, keeping only the newest per (user_id, session_id).
--   2. Adds a UNIQUE constraint so the DB itself forbids duplicates forever.
--   3. Adds a pg_cron retention job: delete sessions inactive for 30 days and
--      audit logs older than 30 days (keeps DB well under the 500MB budget).
--
-- NOTE: requires the pg_cron extension (enable in Supabase Dashboard -> Database
-- -> Extensions -> pg_cron). The retention job is created idempotently.

-- ---------------------------------------------------------------------------
-- 1. Dedupe existing rows: keep the single newest row per (user_id, session_id).
--    Prefer the row with the most recent last_active; among ties, the newest
--    created_at. This collapses the accidental duplicates into one per device.
-- ---------------------------------------------------------------------------
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, session_id
      order by
        coalesce(last_active, created_at) desc,
        created_at desc
    ) as rn
  from public.user_sessions
)
delete from public.user_sessions
where id in (
  select id from ranked where rn > 1
);

-- ---------------------------------------------------------------------------
-- 2. Unique constraint: one row per (user_id, session_id).
--    This permanently prevents the duplicate-insert race at the DB level.
--    The device-fingerprint edge function is updated to use an atomic upsert,
--    so concurrent calls now collapse onto the same row instead of inserting.
-- ---------------------------------------------------------------------------
create unique index if not exists uq_user_sessions_user_id_session_id
  on public.user_sessions(user_id, session_id);

-- NOTE: We use a UNIQUE INDEX (not a UNIQUE constraint) because it is trivial
-- to create idempotently and is equally enforced by Postgres for ON CONFLICT.
-- user_id was nullable in the original schema; keep it nullable here to avoid
-- breaking existing inserts, but the unique index treats NULLs as distinct.

-- ---------------------------------------------------------------------------
-- 3. 30-day retention cleanup (idempotent cron jobs).
--    user_sessions: drop rows whose device hasn't been active in 30 days.
--    auth_audit_log: drop security events older than 30 days.
-- ---------------------------------------------------------------------------
select cron.unschedule('cleanup-user-sessions')
where exists (select 1 from cron.job where jobname = 'cleanup-user-sessions');

select cron.schedule(
  'cleanup-user-sessions',
  '0 4 * * *',
  $$
  delete from public.user_sessions
  where coalesce(last_active, created_at) < now() - interval '30 days';
  $$
);

select cron.unschedule('cleanup-auth-audit-log')
where exists (select 1 from cron.job where jobname = 'cleanup-auth-audit-log');

select cron.schedule(
  'cleanup-auth-audit-log',
  '0 4 * * *',
  $$
  delete from public.auth_audit_log
  where created_at < now() - interval '30 days';
  $$
);
