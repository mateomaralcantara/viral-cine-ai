-- Deploy live E02 dispatcher cron. Gated by DB authorization + provider key.
-- Setting this cron authorizes NO credits and causes ZERO paid Runway calls at
-- existing policy (authorized_spend_usd=0, balance unconfirmed).
do $cron$
begin
 if not exists(select 1 from cron.job where jobname='viralcine-v8-e02-runway-production') then
  perform cron.schedule('viralcine-v8-e02-runway-production','* * * * *',
   $cmd$
   select net.http_post(
    url:='https://wrxeerltoapvybhaxlmu.supabase.co/functions/v1/v8-e02-runway-production',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-v8-cron-token',(select token from v8_internal.e02_cron_credentials
       where name='v8-e02-runway-dryrun')
    ),
    body:='{"orchestrator":"production-authorized-only"}'::jsonb,
    timeout_milliseconds:=16000
   );
   $cmd$);
 end if;
end;
$cron$;
