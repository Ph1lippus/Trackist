-- Push Subscriptions RLS Policies Migration
-- Run this in Supabase SQL Editor
-- Fixes: "new row violates row-level security policy" when saving a
-- push subscription. RLS is enabled on push_subscriptions but the table
-- had no policies, so every INSERT/UPDATE/DELETE from the client failed.

alter table public.push_subscriptions enable row level security;

-- Users can view their own subscriptions (used on app open to check state)
drop policy if exists "Users can view own push subscriptions" on public.push_subscriptions;
create policy "Users can view own push subscriptions"
  on public.push_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Users can insert their own subscriptions (native token + web endpoint)
drop policy if exists "Users can insert own push subscriptions" on public.push_subscriptions;
create policy "Users can insert own push subscriptions"
  on public.push_subscriptions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Users can update their own subscriptions (upsert on token keeps last_seen fresh)
drop policy if exists "Users can update own push subscriptions" on public.push_subscriptions;
create policy "Users can update own push subscriptions"
  on public.push_subscriptions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can delete their own subscriptions (disable notifications)
drop policy if exists "Users can delete own push subscriptions" on public.push_subscriptions;
create policy "Users can delete own push subscriptions"
  on public.push_subscriptions
  for delete
  to authenticated
  using (auth.uid() = user_id);