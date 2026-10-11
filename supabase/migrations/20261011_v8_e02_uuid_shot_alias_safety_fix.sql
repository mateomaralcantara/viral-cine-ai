-- Allow original V7 UUID shot IDs while strictly mapping slot P01..P07 by original order.
-- Existing film and reference locks, immutable source hash, 0 paid calls are preserved.
CREATE OR REPLACE FUNCTION public.v8_sync_e02_original_shot_spec(p_shot_id text, p_reference_sha256 text, p_source_sha256 text, p_original_shot jsonb, p_prompt_text text, p_original_duration_seconds numeric, p_runway_duration_seconds integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
 v_film constant text := 'film-dos-toques-de-bocina-v7';
 v_intent public.v8_e02_render_intents%rowtype;
 v_current public.v8_e02_shot_specs%rowtype;
 v_is_existing boolean:=false;
begin
 if current_user <> 'service_role' then
  raise exception 'service_role required';
 end if;
 if p_shot_id is null or p_shot_id !~ '^E02-P0[1-7]$'
   or p_reference_sha256 is null or p_reference_sha256 !~ '^[a-f0-9]{64}$'
   or p_source_sha256 is null or p_source_sha256 !~ '^[a-f0-9]{64}$'
   or p_original_shot is null or jsonb_typeof(p_original_shot)<>'object'
   or coalesce(length(btrim(p_original_shot->>'id')),0)=0
   or coalesce(length(btrim(p_original_shot->>'sceneId')),0)=0
   or p_original_shot->>'order' is distinct from right(p_shot_id,1)
   -- E02-P0N is a CLOUD SLOT; V7 shot IDs are preserved in original_shot.id.
   or (p_original_shot->>'durationSeconds')::numeric is distinct from p_original_duration_seconds
   or p_prompt_text is null or length(btrim(p_prompt_text)) not between 15 and 1000
   or p_original_duration_seconds is null or p_original_duration_seconds<=0 or p_original_duration_seconds>10
   or p_runway_duration_seconds is null
   or p_runway_duration_seconds not in (5,10)
   or p_runway_duration_seconds<p_original_duration_seconds then
  raise exception 'Invalid original E02 shot spec; no changes made';
 end if;

 select * into v_intent from public.v8_e02_render_intents
  where film_id=v_film and scene_id='E02' and shot_id=p_shot_id for update;
 if not found or v_intent.reference_sha256<>p_reference_sha256 then
  raise exception 'Photo reference mismatch or preflight missing';
 end if;
 if v_intent.runway_task_id is not null or
   v_intent.state not in ('waiting-reference','waiting-shot-spec','waiting-credits','awaiting-executor') then
  raise exception 'Render already started or locked; original shot spec cannot be changed';
 end if;

 if not exists (
  select 1 from public.scene_reference_images r
  join storage.objects o on o.bucket_id=r.storage_bucket and o.name=r.storage_path
  where r.film_id=v_film and r.scene_id='E02' and r.shot_id=p_shot_id
   and r.active and r.approved and r.status='ready' and r.sha256=p_reference_sha256
   and r.storage_bucket=v_intent.reference_bucket
   and r.storage_path=v_intent.reference_path
 ) then
  raise exception 'Approved photo is no longer present in Supabase';
 end if;

 select * into v_current from public.v8_e02_shot_specs
 where film_id=v_film and scene_id='E02' and shot_id=p_shot_id for update;
 v_is_existing:=found;
 if v_is_existing and (
  v_current.source_sha256<>p_source_sha256 or
  v_current.reference_sha256<>p_reference_sha256 or
  v_current.prompt_text<>p_prompt_text or
  v_current.original_duration_seconds<>p_original_duration_seconds or
  v_current.runway_duration_seconds<>p_runway_duration_seconds or
  v_current.original_shot<>p_original_shot
 ) then
  raise exception 'Conflicting original shot version; no overwrite permitted';
 end if;

 if not v_is_existing then
  insert into public.v8_e02_shot_specs
   (film_id,scene_id,shot_id,source_sha256,reference_sha256,
    original_duration_seconds,runway_duration_seconds,prompt_text,original_shot)
  values (v_film,'E02',p_shot_id,p_source_sha256,p_reference_sha256,
          p_original_duration_seconds,p_runway_duration_seconds,p_prompt_text,p_original_shot);
 end if;

 update public.v8_e02_render_intents
  set prompt_text=p_prompt_text,duration_seconds=p_runway_duration_seconds,
      state='waiting-credits',updated_at=now()
 where film_id=v_film and scene_id='E02' and shot_id=p_shot_id
   and reference_sha256=p_reference_sha256 and runway_task_id is null;

 return jsonb_build_object('shotId',p_shot_id,'synced',true,
   'existing',v_is_existing,'sourceSha256',p_source_sha256,
   'originalSeconds',p_original_duration_seconds,
   'runwaySeconds',p_runway_duration_seconds,'state','waiting-credits',
   'paidCallExecuted',false);
end;
$function$
;