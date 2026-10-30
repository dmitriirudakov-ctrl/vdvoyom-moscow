-- Template for Supabase SQL Editor, after deploying import-events.
-- First create two secrets through Supabase Vault UI:
--   weekend_project_url = https://YOUR_PROJECT.supabase.co
--   weekend_import_secret = the same random secret configured as IMPORT_SECRET for Edge Functions.
-- Do not commit either value. No service_role key is needed in this schedule.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'weekend-afisha-daily',
  '0 3 * * *', -- 06:00 Europe/Moscow
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='weekend_project_url') || '/functions/v1/import-events',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-import-secret',(select decrypted_secret from vault.decrypted_secrets where name='weekend_import_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
