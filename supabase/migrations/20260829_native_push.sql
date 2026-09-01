alter table public.push_subscriptions
  add column if not exists platform text not null default 'web';

alter table public.push_subscriptions
  add column if not exists token text;

alter table public.push_subscriptions
  alter column endpoint drop not null;

-- Backfill native subscriptions so the old endpoint-based unique key still
-- stays valid for app installs that were already created before the native-push
-- migration landed.
update public.push_subscriptions
set endpoint = token,
    keys = coalesce(keys, '{}'::jsonb)
where platform = 'native'
  and token is not null
  and (endpoint is null or endpoint = '');

-- Partial indexes are not inferable by PostgREST ON CONFLICT, so use a
-- plain unique index instead: NULL token values (web subscriptions) are
-- already treated as distinct by Postgres.
drop index if exists push_subscriptions_token_key;
create unique index if not exists push_subscriptions_token_key
  on public.push_subscriptions (token);