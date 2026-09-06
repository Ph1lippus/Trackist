-- Schedule watch provider sync once per day.
-- Run .\scripts\setup-cron-secret.ps1 to ensure the Vault cron_secret matches
-- the Edge Function CRON_SECRET before applying this migration.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid)
from cron.job
where jobname = 'sync-watch-providers';

select cron.schedule(
  'sync-watch-providers',
  '0 3 * * *',
  $job$
    select net.http_post(
      url := 'https://iqlzdmjamsvxinqbrnix.supabase.co/functions/v1/sync-watch-providers',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'cron_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb
    );
  $job$
);
