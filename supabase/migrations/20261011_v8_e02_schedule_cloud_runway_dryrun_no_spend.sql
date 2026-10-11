-- Scheduled cloud rehearsal only. Never invokes Runway API.
-- Token stays in an inaccessible private table, not in cron.job command text.
do $block$
declare
  v_sql text;
begin
  if not exists(select 1 from cron.job where jobname='viralcine-v8-e02-runway-dryrun') then
    v_sql := $command$
      select net.http_post(
        url := 'https://wrxeerltoapvybhaxlmu.supabase.co/functions/v1/v8-e02-runway-dryrun',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-v8-cron-token',
          (select token from v8_internal.e02_cron_credentials
           where name='v8-e02-runway-dryrun')
        ),
        body := '{"trigger":"scheduled-dryrun-only"}'::jsonb,
        timeout_milliseconds := 15000
      );
    $command$;
    perform cron.schedule('viralcine-v8-e02-runway-dryrun','*/5 * * * *',v_sql);
  end if;
end;
$block$;
