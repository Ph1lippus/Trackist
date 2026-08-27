-- Migration: Add user_mfa_backup_codes table for storing hashed backup codes
-- Run this after enabling pgcrypto extension in Supabase Dashboard

-- Enable pgcrypto for hashing (run once)
-- create extension if not exists pgcrypto;

create table if not exists public.user_mfa_backup_codes (
  user_id uuid primary key references auth.users on delete cascade,
  codes jsonb not null default '[]', -- array of {code: string (bcrypt hash), used: boolean, created_at: string}
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS: Users can only manage their own backup codes
alter table public.user_mfa_backup_codes enable row level security;

create policy "Users can view own backup codes" 
on public.user_mfa_backup_codes for select 
using (auth.uid() = user_id);

create policy "Users can insert own backup codes" 
on public.user_mfa_backup_codes for insert 
with check (auth.uid() = user_id);

create policy "Users can update own backup codes" 
on public.user_mfa_backup_codes for update 
using (auth.uid() = user_id);

-- Function to update updated_at timestamp
create or replace function public.update_mfa_backup_codes_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger update_user_mfa_backup_codes_updated_at
before update on public.user_mfa_backup_codes
for each row
execute function public.update_mfa_backup_codes_timestamp();