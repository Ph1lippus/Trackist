alter table public.push_subscriptions
  add column if not exists platform text not null default 'web';

alter table public.push_subscriptions
  add column if not exists token text;

alter table public.push_subscriptions
  alter column endpoint drop not null;

-- Partial indexes are not inferable by PostgREST ON CONFLICT, so use a
-- plain unique index instead: NULL token values (web subscriptions) are
-- already treated as distinct by Postgres.
drop index if exists push_subscriptions_token_key;
create unique index if not exists push_subscriptions_token_key
  on public.push_subscriptions (token);