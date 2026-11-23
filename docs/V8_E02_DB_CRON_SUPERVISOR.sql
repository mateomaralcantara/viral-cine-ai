-- ViralCine V8 — E02 free-only metadata supervisor.
-- Installed in Supabase via migration v8_e02_free_only_db_cron_supervisor.
-- Scope: approved E02 photo metadata; no generation, no HTTP, no paid Runway calls.
-- Reproducible/idempotent schema, function and scheduler.
create extension if not exists pg_cron;
create schema if not exists v8_internal;
revoke all on schema v8_internal from public, anon, authenticated;

CREATE OR REPLACE FUNCTION v8_internal.tick_e02_assets(p_max_jobs integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_job public.v8_autonomy_jobs%rowtype;
  v_ref jsonb;
  v_refs jsonb;
  v_missing jsonb;
  v_checked integer;
  v_processed integer := 0;
  v_ok integer := 0;
  v_waiting integer := 0;
  v_state text;
  v_detail jsonb;
  v_film constant text := 'film-dos-toques-de-bocina-v7';
begin
  if p_max_jobs not between 1 and 7 then
    raise exception 'Only 1-7 metadata-only jobs per tick are allowed';
  end if;

  if not exists (
    select 1 from public.v8_film_autonomy_policy p
    where p.film_id = v_film
      and p.director_mode = 'credits-only'
      and p.video_provider = 'runway'
      and p.avatares_enabled = false
  ) then
    return jsonb_build_object('status','blocked-policy','processed',0);
  end if;

  for v_index in 1..p_max_jobs loop
    select * into v_job
    from public.v8_autonomy_jobs j
    where j.film_id = v_film and j.scene_id = 'E02'
      and j.action = 'source-check'
      and j.state in ('queued','retry-wait')
      and j.available_at <= now()
      and j.attempt < j.max_attempts
    order by j.available_at, j.created_at
    for update skip locked
    limit 1;
    exit when not found;

    v_refs := v_job.payload -> 'files';
    v_missing := '[]'::jsonb;
    v_checked := 0;

    if jsonb_typeof(v_refs) is distinct from 'array' then
      v_missing := jsonb_build_array('invalid-files-array');
    elsif jsonb_array_length(v_refs) < 1 or jsonb_array_length(v_refs) > 50 then
      v_missing := jsonb_build_array('invalid-reference-count');
    else
      for v_ref in select value from jsonb_array_elements(v_refs) loop
        if jsonb_typeof(v_ref) is distinct from 'object'
           or jsonb_typeof(v_ref -> 'bucket') is distinct from 'string'
           or jsonb_typeof(v_ref -> 'path') is distinct from 'string'
        then
          v_missing := v_missing || jsonb_build_array('invalid-reference');
        elsif exists (
          select 1
          from public.scene_reference_images r
          join storage.objects o
            on o.bucket_id = r.storage_bucket and o.name = r.storage_path
          where r.film_id = v_job.film_id
            and r.scene_id = v_job.scene_id
            and r.shot_id = v_job.shot_id
            and r.storage_bucket = v_ref ->> 'bucket'
            and r.storage_path = v_ref ->> 'path'
            and r.approved = true and r.active = true and r.status = 'ready'
            and r.storage_path like ('%/' || r.sha256 || '.jpg')
        ) then
          v_checked := v_checked + 1;
        else
          v_missing := v_missing || jsonb_build_array(
            jsonb_build_object('bucket',v_ref ->> 'bucket','path',v_ref ->> 'path')
          );
        end if;
      end loop;
    end if;

    if jsonb_array_length(v_missing) = 0 then
      v_state := 'completed';
      v_ok := v_ok + 1;
    else
      v_state := 'waiting-assets';
      v_waiting := v_waiting + 1;
    end if;

    v_detail := jsonb_build_object(
      'checkedAssets', v_checked,
      'missing', v_missing,
      'validation', 'approved-reference-and-storage-object-metadata',
      'byteHashRevalidated', false,
      'cinematicQaApproved', false,
      'videoGenerated', false,
      'paidCallExecuted', false
    );

    update public.v8_autonomy_jobs
       set state = v_state,
           attempt = attempt + 1,
           result = v_detail,
           last_error = case when v_state = 'completed' then null else 'Reference metadata missing or not approved' end,
           lock_token = null,
           lease_until = null,
           updated_at = now()
     where id = v_job.id;

    insert into public.v8_autonomy_job_events (job_id,transition,detail)
      values (v_job.id,v_state,jsonb_build_object(
        'source','v8_internal.tick_e02_assets',
        'attempt',v_job.attempt+1,
        'verifiedAssets',v_checked,
        'paidCallExecuted',false
      ));
    v_processed := v_processed + 1;
  end loop;

  return jsonb_build_object('status','ok','processed',v_processed,'completed',v_ok,
    'waitingAssets',v_waiting,'paidCallExecuted',false);
end;
$function$
;

revoke all on function v8_internal.tick_e02_assets(integer) from public, anon, authenticated;

do $job$
begin
  if not exists(select 1 from cron.job where jobname='viralcine-v8-e02-assets-free-only') then
    perform cron.schedule(
      'viralcine-v8-e02-assets-free-only',
      '*/5 * * * *',
      'select v8_internal.tick_e02_assets(7);'
    );
  end if;
end;
$job$;

-- Status:
-- select jobid,jobname,schedule,active from cron.job where jobname='viralcine-v8-e02-assets-free-only';
-- select shot_id,state,result from public.v8_autonomy_jobs where film_id='film-dos-toques-de-bocina-v7' and scene_id='E02';
-- To disable the schedule: select cron.unschedule('viralcine-v8-e02-assets-free-only');
