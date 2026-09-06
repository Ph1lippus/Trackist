-- Schedule the notification sweep once per hour.
-- Run .\scripts\setup-cron-secret.ps1 to ensure the Vault cron_secret matches
-- the Edge Function CRON_SECRET before applying this migration.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid)
from cron.job
where jobname = 'notify-new-content-hourly';

select cron.schedule(
  'notify-new-content-hourly',
  '5 * * * *',
  $job$
    select net.http_post(
      url := 'https://iqlzdmjamsvxinqbrnix.supabase.co/functions/v1/notify-new-content',
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