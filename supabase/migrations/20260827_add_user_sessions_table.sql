-- Migration: Add user_sessions table for device/session tracking
-- Run this after enabling pgcrypto extension in Supabase Dashboard

-- Enable pgcrypto for hashing (run once)
-- create extension if not exists pgcrypto;

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  session_id text not null,
  device_info jsonb, -- {browser, os, device_type}
  ip_hash text, -- hashed IP for privacy
  location text, -- city, country from GeoIP
  created_at timestamptz default now(),
  last_active timestamptz default now(),
  revoked_at timestamptz
);

create index if not exists idx_user_sessions_user_id on public.user_sessions(user_id);
create index if not exists idx_user_sessions_session_id on public.user_sessions(session_id);

-- RLS: Users can only manage their own sessions
alter table public.user_sessions enable row level security;

create policy "Users can view own sessions" 
on public.user_sessions for select 
using (auth.uid() = user_id);

create policy "Users can insert own sessions" 
on public.user_sessions for insert 
with check (auth.uid() = user_id);

create policy "Users can update own sessions" 
on public.user_sessions for update 
using (auth.uid() = user_id);

create policy "Users can delete own sessions" 
on public.user_sessions for delete 
using (auth.uid() = user_id);

-- Function to hash IP addresses
create or replace function public.hash_ip(ip text) returns text
language plpgsql
security definer
as $$
begin
  return encode(digest(ip, 'sha256'), 'hex');
end;
$$;