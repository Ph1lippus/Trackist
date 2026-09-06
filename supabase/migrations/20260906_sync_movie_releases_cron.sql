-- Schedule movie release date sync every 6 hours.
-- Run .\scripts\setup-cron-secret.ps1 to ensure the Vault cron_secret matches
-- the Edge Function CRON_SECRET before applying this migration.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid)
from cron.job
where jobname = 'sync-movie-releases';

select cron.schedule(
  'sync-movie-releases',
  '0 */6 * * *',
  $job$
    select net.http_post(
      url := 'https://iqlzdmjamsvxinqbrnix.supabase.co/functions/v1/sync-movie-releases',
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
