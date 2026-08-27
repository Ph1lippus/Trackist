-- Migration: Add blocked_ips table for brute-force IP blocking (Phase 4)
-- Run this after enabling pgcrypto extension in Supabase Dashboard

create table if not exists public.blocked_ips (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null unique,
  reason text not null, -- 'brute_force', 'suspicious_activity', 'manual'
  attempt_count int default 0,
  blocked_at timestamptz default now(),
  expires_at timestamptz,
  created_by uuid references auth.users on delete set null
);

create index if not exists idx_blocked_ips_ip_hash on public.blocked_ips(ip_hash);
create index if not exists idx_blocked_ips_expires_at on public.blocked_ips(expires_at);

-- RLS: Only admins can manage blocked IPs
alter table public.blocked_ips enable row level security;

create policy "Admins can manage blocked IPs" 
on public.blocked_ips for all 
using (
  exists (
    select 1 from auth.users 
    where id = auth.uid() 
    and raw_app_meta_data->>'is_admin' = 'true'
  )
);

-- Function to check if IP is blocked
create or replace function public.is_ip_blocked(ip text) returns boolean
language plpgsql
security definer
as $$
declare
  hashed_ip text;
  blocked boolean;
begin
  hashed_ip := encode(digest(ip, 'sha256'), 'hex');
  
  select exists(
    select 1 from public.blocked_ips 
    where ip_hash = hashed_ip 
    and (expires_at is null or expires_at > now())
  ) into blocked;
  
  return blocked;
end;
$$;

-- Function to block an IP
create or replace function public.block_ip(ip text, reason text, duration_hours int default 24)
returns void
language plpgsql
security definer
as $$
declare
  hashed_ip text;
begin
  hashed_ip := encode(digest(ip, 'sha256'), 'hex');
  
  insert into public.blocked_ips (ip_hash, reason, expires_at)
  values (hashed_ip, reason, now() + (duration_hours || ' hours')::interval)
  on conflict (ip_hash) do update set
    reason = excluded.reason,
    attempt_count = blocked_ips.attempt_count + 1,
    expires_at = excluded.expires_at;
end;
$$;

-- Function to unblock an IP
create or replace function public.unblock_ip(ip text)
returns void
language plpgsql
security definer
as $$
declare
  hashed_ip text;
begin
  hashed_ip := encode(digest(ip, 'sha256'), 'hex');
  delete from public.blocked_ips where ip_hash = hashed_ip;
end;
$$;