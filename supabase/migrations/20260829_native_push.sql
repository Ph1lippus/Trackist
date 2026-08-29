alter table public.push_subscriptions
  add column if not exists platform text not null default 'web';

alter table public.push_subscriptions
  add column if not exists token text;

alter table public.push_subscriptions
  alter column endpoint drop not null;

create unique index if not exists push_subscriptions_token_key
  on public.push_subscriptions (token)
  where token is not null;