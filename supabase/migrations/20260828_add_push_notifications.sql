-- Migration: Web Push notifications for Trackist
-- Paste this into the Supabase SQL Editor and run it.
--
-- What this adds:
--   1. push_subscriptions  - tiny device-token registry (one row per device).
--      This is the ONLY new table. Notifications themselves are computed on
--      demand by the notify-new-content edge function and are never stored,
--      so the 500MB database budget stays untouched by the actual alerts.
--   2. profiles            - 3 boolean preferences (~3 bytes per user).
--   3. (Optional, commented) A nightly pg_cron job that calls the
--      notify-new-content edge function so users get "released today" pushes.
--
-- After running this, deploy the edge function:
--   supabase functions deploy notify-new-content --project-ref iqlzdmjamsvxinqbrnix
-- and set its secrets:
--   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com CRON_SECRET=...
--   (VAPID keys: npx web-push generate-vapid-keys)

-- ---------------------------------------------------------------------------
-- 1. Push subscriptions (device registry)
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null default '{}'::jsonb, -- { p256dh, auth } from PushSubscription
  user_agent text,
  created_at timestamptz default now(),
  last_seen timestamptz default now(),
  constraint push_subscriptions_keys_valid check (jsonb_typeof(keys) = 'object')
);

create index if not exists idx_push_subscriptions_user_id
  on public.push_subscriptions(user_id);

-- Users can only read / register / remove their own devices
alter table public.push_subscriptions enable row level security;

create policy "Users can view own push subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can insert own push subscriptions"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own push subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

-- The notify-new-content edge function uses the service role key, which
-- bypasses RLS. No additional policy is needed for cleanup deletes of
-- stale/expired subscriptions because the service role bypasses RLS too.

-- ---------------------------------------------------------------------------
-- 2. Notification preferences on profiles (default: everything ON)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists notify_new_episode boolean not null default true;

alter table public.profiles
  add column if not exists notify_new_season boolean not null default true;

alter table public.profiles
  add column if not exists notify_release_date boolean not null default true;

-- ---------------------------------------------------------------------------
-- 3. OPTIONAL: Nightly schedule (06:00 UTC) for the notify-new-content function.
--
-- Option A (recommended): Supabase Dashboard -> Edge Functions ->
--   notify-new-content -> "Schedules" -> add cron "0 6 * * *" and set a
--   header "x-cron-secret: <CRON_SECRET>" (must match the CRON_SECRET secret).
--
-- Option B: via pg_cron + pg_net. Uncomment and fill in your values.
-- ---------------------------------------------------------------------------
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.schedule(
--   'notify-new-content-daily',
--   '0 6 * * *',
--   $$
--   select
--     net.http_post(
--       url := 'https://iqlzdmjamsvxinqbrnix.supabase.co/functions/v1/notify-new-content',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'x-cron-secret', 'REPLACE_WITH_CRON_SECRET'
--       )
--     )
--   $$
-- );