-- Migration: Add auth_audit_log table for security event logging
-- Run this after enabling pg_cron extension in Supabase Dashboard for retention

create table if not exists public.auth_audit_log (
  id bigserial primary key,
  user_id uuid references auth.users on delete set null,
  event_type text not null,
  ip_hash text,
  user_agent text,
  metadata jsonb default '{}',
  risk_score int default 0, -- 0-100
  created_at timestamptz default now()
);

create index if not exists idx_auth_audit_log_user_id_created_at on public.auth_audit_log(user_id, created_at desc);
create index if not exists idx_auth_audit_log_event_type on public.auth_audit_log(event_type);
create index if not exists idx_auth_audit_log_risk_score on public.auth_audit_log(risk_score desc);
create index if not exists idx_auth_audit_log_created_at on public.auth_audit_log(created_at desc);

-- RLS: Users can view their own audit logs; admins can view all
alter table public.auth_audit_log enable row level security;

create policy "Users can view own audit logs" 
on public.auth_audit_log for select 
using (auth.uid() = user_id);

-- Admins can view all audit logs (requires is_admin claim)
create policy "Admins can view all audit logs" 
on public.auth_audit_log for select 
using (
  exists (
    select 1 from auth.users 
    where id = auth.uid() 
    and raw_app_meta_data->>'is_admin' = 'true'
  )
);

-- Service role can insert audit logs (for Edge Functions)
create policy "Service role can insert audit logs" 
on public.auth_audit_log for insert 
with check (true);

-- Retention: 90 days
-- Add pg_cron job to clean up old logs (run in Supabase SQL Editor):
-- select cron.schedule('cleanup-auth-audit-logs', '0 3 * * *', $$
--   delete from public.auth_audit_log 
--   where created_at < now() - interval '90 days';
-- $$);

-- Event types for reference:
-- login_success, login_failure, mfa_enroll, mfa_verify, mfa_failure,
-- password_change, password_reset_request, session_revoke, session_revoke_all,
-- backup_code_used, register, logout, email_change, suspicious_activity