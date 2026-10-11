-- ViralCine V8 E02 — atomic FIRST-RENDER reservation, NO external paid API calls.
-- All seven shots currently remain waiting-credits, USD 0 authorized.
-- Each shot can have only ONE reservation; unknown submissions must never auto-repeat.
alter table public.v8_e02_render_intents
 drop constraint if exists v8_e02_render_intents_state_check;
alter table public.v8_e02_render_intents
 add constraint v8_e02_render_intents_state_check
 check (state in ('waiting-reference','waiting-shot-spec','waiting-credits',
 'awaiting-executor','reserved','task-known','video-ready',
 'qa-pending','qa-approved','blocked'));

create table if not exists public.v8_e02_runway_reservations(
 id uuid primary key default gen_random_uuid(),
 film_id text not null,
 scene_id text not null default 'E02' check(scene_id='E02'),
 shot_id text not null check(shot_id ~ '^E02-P0[1-7]$'),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 reference_sha256 text not null check(reference_sha256 ~ '^[a-f0-9]{64}$'),
 runway_model text not null default 'gen4_turbo' check(runway_model='gen4_turbo'),
 duration_seconds integer not null check(duration_seconds in (5,10)),
 maximum_usd numeric(12,2) not null check(maximum_usd in (0.25,0.50)),
 state text not null default 'reserved'
   check(state in ('reserved','submission-uncertain','task-known','video-ready',
                   'failed-needs-review','released-with-verified-no-charge')),
 provider_task_id text unique,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (film_id,scene_id,shot_id),
 foreign key(film_id,scene_id,shot_id)
 references public.v8_e02_render_intents(film_id,scene_id,shot_id)
);
alter table public.v8_e02_runway_reservations enable row level security;
revoke all on public.v8_e02_runway_reservations from public,anon,authenticated;
grant select,insert,update on public.v8_e02_runway_reservations to service_role;

create or replace function public.v8_reserve_e02_first_runway_render(p_shot_id text)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog
as $fn$
declare
 v_film constant text:='film-dos-toques-de-bocina-v7';
 v_policy public.v8_film_autonomy_policy%rowtype;
 v_intent public.v8_e02_render_intents%rowtype;
 v_spec public.v8_e02_shot_specs%rowtype;
 v_cost numeric(12,2);
 v_reserved public.v8_e02_runway_reservations%rowtype;
begin
 if current_user<>'service_role' then raise exception 'service role required'; end if;
 if p_shot_id is null or p_shot_id !~ '^E02-P0[1-7]$' then
  raise exception 'invalid E02 shot';end if;
 -- Policy row lock serializes money reservations across all shots.
 select * into v_policy from public.v8_film_autonomy_policy
 where film_id=v_film for update;
 if not found or v_policy.status<>'ready'
   or v_policy.director_mode<>'credits-only'
   or v_policy.video_provider<>'runway'
   or v_policy.avatares_enabled is distinct from false
   or v_policy.provider_balance_confirmed is distinct from true then
  return jsonb_build_object('status','blocked-policy-or-provider','paidCalls',0);
 end if;
 select * into v_intent from public.v8_e02_render_intents
  where film_id=v_film and scene_id='E02' and shot_id=p_shot_id
  for update;
 if not found then return jsonb_build_object('status','missing-shot','paidCalls',0);end if;
 if exists(select 1 from public.v8_e02_runway_reservations
  where film_id=v_film and scene_id='E02' and shot_id=p_shot_id) then
  return jsonb_build_object('status','existing-reservation-no-retry','paidCalls',0);
 end if;
 if v_intent.state not in ('waiting-credits','awaiting-executor')
  or v_intent.runway_task_id is not null or v_intent.video_sha256 is not null
  or v_intent.video_provider<>'runway' or v_intent.runway_model<>'gen4_turbo'
  or v_intent.output_ratio<>'1280:720'
  or v_intent.duration_seconds not in(5,10)
  or v_intent.prompt_text is null or length(btrim(v_intent.prompt_text))<15 then
  return jsonb_build_object('status','blocked-incomplete-or-prior-task','paidCalls',0);
 end if;
 select * into v_spec from public.v8_e02_shot_specs
 where film_id=v_film and scene_id='E02' and shot_id=p_shot_id;
 if not found or v_spec.prompt_text<>v_intent.prompt_text
  or v_spec.runway_duration_seconds<>v_intent.duration_seconds
  or v_spec.reference_sha256<>v_intent.reference_sha256 then
  return jsonb_build_object('status','blocked-source-integrity','paidCalls',0);
 end if;
 if not exists (
  select 1 from public.scene_reference_images r
   join storage.objects o on o.bucket_id=r.storage_bucket and o.name=r.storage_path
  where r.film_id=v_film and r.scene_id='E02' and r.shot_id=p_shot_id
    and r.active and r.approved and r.status='ready'
    and r.sha256=v_intent.reference_sha256
    and r.storage_bucket=v_intent.reference_bucket
    and r.storage_path=v_intent.reference_path
 ) then return jsonb_build_object('status','blocked-reference-not-approved','paidCalls',0);
 end if;
 v_cost := (v_intent.duration_seconds * 0.05)::numeric(12,2);
 if v_policy.authorized_spend_usd-v_policy.spent_or_reserved_usd<v_cost then
  return jsonb_build_object('status','waiting-credit-approval',
     'minimumUsd',v_cost,'remainingUsd',
     v_policy.authorized_spend_usd-v_policy.spent_or_reserved_usd,'paidCalls',0);
 end if;
 -- Atomically reserve already-authorized budget; DOES NOT submit to Runway.
 update public.v8_film_autonomy_policy
  set spent_or_reserved_usd=spent_or_reserved_usd+v_cost,
      updated_at=now()
  where film_id=v_film;
 insert into public.v8_e02_runway_reservations
  (film_id,scene_id,shot_id,source_sha256,reference_sha256,
   duration_seconds,maximum_usd)
 values(v_film,'E02',p_shot_id,v_spec.source_sha256,
   v_intent.reference_sha256,v_intent.duration_seconds,v_cost)
 returning * into v_reserved;
 update public.v8_e02_render_intents
   set state='reserved',updated_at=now()
  where film_id=v_film and scene_id='E02' and shot_id=p_shot_id;
 return jsonb_build_object('status','reserved-no-provider-call',
   'reservationId',v_reserved.id,'maximumUsd',v_cost,
   'paidCalls',0,'runwayPostExecuted',false,
   'requiresDedicatedTrustedExecutor',true);
end;
$fn$;
revoke all on function public.v8_reserve_e02_first_runway_render(text)
 from public,anon,authenticated;
grant execute on function public.v8_reserve_e02_first_runway_render(text) to service_role;
