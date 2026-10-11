-- ViralCine V8 E02: persistent render preflight with zero paid execution paths.
-- ALL operations below are metadata-only; no Runway API call, charge, or export.
create table if not exists public.v8_e02_render_intents (
 film_id text not null,
 scene_id text not null default 'E02' check (scene_id='E02'),
 shot_id text not null check (shot_id ~ '^E02-P0[1-7]$'),
 reference_bucket text not null,
 reference_path text not null,
 reference_sha256 text not null check (reference_sha256 ~ '^[a-f0-9]{64}$'),
 video_provider text not null default 'runway' check (video_provider='runway'),
 runway_model text not null default 'gen4_turbo' check (runway_model='gen4_turbo'),
 output_ratio text not null default '1280:720' check (output_ratio='1280:720'),
 prompt_text text null check (prompt_text is null or length(btrim(prompt_text)) between 15 and 1000),
 duration_seconds integer null check (duration_seconds is null or duration_seconds in (5,10)),
 estimated_credit_cost integer generated always as (duration_seconds * 5) stored,
 state text not null default 'waiting-shot-spec'
   check (state in ('waiting-reference','waiting-shot-spec','waiting-credits',
                    'awaiting-executor','task-known','video-ready','qa-pending','qa-approved','blocked')),
 runway_task_id text null,
 video_sha256 text null check (video_sha256 is null or video_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(film_id,scene_id,shot_id)
);
alter table public.v8_e02_render_intents enable row level security;
revoke all on public.v8_e02_render_intents from public,anon,authenticated;
grant select,insert,update on public.v8_e02_render_intents to service_role;

-- Future QA worker must supply independent hash-bound results. Defaults NEVER approve.
create table if not exists public.v8_e02_video_qa (
 film_id text not null,
 scene_id text not null default 'E02' check(scene_id='E02'),
 shot_id text not null check(shot_id ~ '^E02-P0[1-7]$'),
 video_sha256 text not null check(video_sha256 ~ '^[a-f0-9]{64}$'),
 gate_decode text not null default 'unknown' check(gate_decode in ('pass','fail','unknown')),
 gate_duration text not null default 'unknown' check(gate_duration in ('pass','fail','unknown')),
 gate_identity text not null default 'unknown' check(gate_identity in ('pass','fail','unknown')),
 gate_continuity text not null default 'unknown' check(gate_continuity in ('pass','fail','unknown')),
 gate_motion text not null default 'unknown' check(gate_motion in ('pass','fail','unknown')),
 verified_by text null,
 approved boolean generated always as (
    gate_decode='pass' and gate_duration='pass' and gate_identity='pass'
    and gate_continuity='pass' and gate_motion='pass'
    and verified_by is not null and length(btrim(verified_by)) > 0
  ) stored,
 created_at timestamptz not null default now(),
 primary key(film_id,scene_id,shot_id,video_sha256)
);
alter table public.v8_e02_video_qa enable row level security;
revoke all on public.v8_e02_video_qa from public,anon,authenticated;
grant select,insert,update on public.v8_e02_video_qa to service_role;

create or replace function v8_internal.tick_e02_render_preflight()
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog
as $fn$
declare
 v_film constant text:='film-dos-toques-de-bocina-v7';
 v_source record;
 v_policy public.v8_film_autonomy_policy%rowtype;
 v_count integer;
 v_ready integer;
 v_spec integer;
 v_credit integer;
 v_executor integer;
begin
 -- No incomplete or ambiguous set of references may enter preflight.
 select count(*) into v_count
 from public.scene_reference_images r
 join storage.objects o on o.bucket_id=r.storage_bucket and o.name=r.storage_path
 where r.film_id=v_film and r.scene_id='E02'
   and r.approved and r.active and r.status='ready'
   and r.storage_path like '%/' || r.sha256 || '.jpg';

 if v_count<>7 then
   update public.v8_e02_render_intents set state='waiting-reference',updated_at=now()
   where film_id=v_film and scene_id='E02'
     and state in ('waiting-shot-spec','waiting-credits','awaiting-executor','waiting-reference');
   return jsonb_build_object('status','waiting-reference','found',v_count,'paidCalls',0);
 end if;

 select * into v_policy from public.v8_film_autonomy_policy where film_id=v_film;
 if not found or v_policy.director_mode<>'credits-only'
  or v_policy.video_provider<>'runway' or v_policy.avatares_enabled then
   return jsonb_build_object('status','blocked-policy','paidCalls',0);
 end if;

 for v_source in
  select r.shot_id,r.storage_bucket,r.storage_path,r.sha256
  from public.scene_reference_images r
  join storage.objects o on o.bucket_id=r.storage_bucket and o.name=r.storage_path
  where r.film_id=v_film and r.scene_id='E02'
    and r.approved and r.active and r.status='ready'
  order by r.shot_id
 loop
  insert into public.v8_e02_render_intents
   (film_id,scene_id,shot_id,reference_bucket,reference_path,reference_sha256)
  values(v_film,'E02',v_source.shot_id,v_source.storage_bucket,v_source.storage_path,v_source.sha256)
  on conflict (film_id,scene_id,shot_id) do update
  set reference_bucket=excluded.reference_bucket,
      reference_path=excluded.reference_path,
      reference_sha256=excluded.reference_sha256,
      prompt_text=case when public.v8_e02_render_intents.reference_sha256<>excluded.reference_sha256
       then null else public.v8_e02_render_intents.prompt_text end,
      duration_seconds=case when public.v8_e02_render_intents.reference_sha256<>excluded.reference_sha256
       then null else public.v8_e02_render_intents.duration_seconds end,
      state=case when public.v8_e02_render_intents.reference_sha256<>excluded.reference_sha256
       then 'waiting-shot-spec' else public.v8_e02_render_intents.state end,
      updated_at=now();
 end loop;

 -- Never modify submitted/finished tasks. Never create a paid provider task.
 update public.v8_e02_render_intents i
 set state=case
     when i.prompt_text is null or i.duration_seconds is null then 'waiting-shot-spec'
     when v_policy.provider_balance_confirmed is distinct from true
        or v_policy.authorized_spend_usd<=v_policy.spent_or_reserved_usd
        or (v_policy.authorized_spend_usd-v_policy.spent_or_reserved_usd)<(i.duration_seconds*0.05)
       then 'waiting-credits'
     else 'awaiting-executor'
   end,
   updated_at=now()
 where i.film_id=v_film and i.scene_id='E02'
  and i.state in ('waiting-reference','waiting-shot-spec','waiting-credits','awaiting-executor');

 select count(*),
        count(*) filter(where state='waiting-shot-spec'),
        count(*) filter(where state='waiting-credits'),
        count(*) filter(where state='awaiting-executor')
 into v_ready,v_spec,v_credit,v_executor
 from public.v8_e02_render_intents where film_id=v_film and scene_id='E02';

 return jsonb_build_object('status','preflight-only','references',v_ready,
  'waitingShotSpec',v_spec,'waitingCredits',v_credit,
  'awaitingExecutor',v_executor,'providerPostEnabled',false,'paidCalls',0);
end;
$fn$;
revoke all on function v8_internal.tick_e02_render_preflight() from public,anon,authenticated;

do $cron$
begin
 if not exists(select 1 from cron.job where jobname='viralcine-v8-e02-render-preflight') then
  perform cron.schedule('viralcine-v8-e02-render-preflight','*/5 * * * *',
   'select v8_internal.tick_e02_render_preflight();');
 end if;
end;
$cron$;
