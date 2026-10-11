-- ViralCine E02 production ledger: first render only, fail-closed for unknown provider outcomes.
-- This migration itself triggers NO Runway calls and authorizes ZERO dollars.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('viralcine-scene-videos','viralcine-scene-videos',false,104857600,array['video/mp4'])
on conflict(id) do nothing;
create table if not exists public.v8_e02_render_outputs(
 film_id text not null,
 scene_id text not null default 'E02' check(scene_id='E02'),
 shot_id text not null check(shot_id ~ '^E02-P0[1-7]$'),
 reservation_id uuid not null unique references public.v8_e02_runway_reservations(id),
 provider_task_id text not null unique,
 storage_bucket text not null default 'viralcine-scene-videos' check(storage_bucket='viralcine-scene-videos'),
 storage_path text not null,
 video_sha256 text not null check(video_sha256 ~ '^[a-f0-9]{64}$'),
 file_bytes bigint not null check(file_bytes between 10000 and 104857600),
 qa_status text not null default 'pending' check(qa_status in('pending','passed','failed')),
 created_at timestamptz not null default now(),
 primary key(film_id,scene_id,shot_id),
 foreign key(film_id,scene_id,shot_id) references public.v8_e02_render_intents(film_id,scene_id,shot_id)
);
alter table public.v8_e02_render_outputs enable row level security;
revoke all on public.v8_e02_render_outputs from public,anon,authenticated;
grant select,insert on public.v8_e02_render_outputs to service_role;

create table if not exists public.v8_e02_runway_events(
 id bigint generated always as identity primary key,
 reservation_id uuid not null references public.v8_e02_runway_reservations(id),
 shot_id text not null,
 transition text not null,
 task_id text,
 created_at timestamptz not null default now()
);
alter table public.v8_e02_runway_events enable row level security;
revoke all on public.v8_e02_runway_events from public,anon,authenticated;
grant select,insert on public.v8_e02_runway_events to service_role;

create or replace function public.v8_note_e02_runway_transition(
 p_reservation_id uuid,
 p_transition text,
 p_task_id text default null,
 p_video_sha256 text default null,
 p_storage_path text default null,
 p_file_bytes bigint default null
)
returns jsonb language plpgsql security invoker set search_path=pg_catalog
as $fn$
declare
 v public.v8_e02_runway_reservations%rowtype;
 v_intent public.v8_e02_render_intents%rowtype;
 v_task text;
begin
 if current_user <> 'service_role' then raise exception 'service_role required';end if;
 select * into v from public.v8_e02_runway_reservations
 where id=p_reservation_id for update;
 if not found then raise exception 'reservation not found';end if;
 if v.film_id<>'film-dos-toques-de-bocina-v7' or v.scene_id<>'E02' then
 raise exception 'outside E02';end if;
 select * into v_intent from public.v8_e02_render_intents
 where film_id=v.film_id and scene_id=v.scene_id and shot_id=v.shot_id for update;
 if v_intent.reference_sha256<>v.reference_sha256
  or v_intent.duration_seconds<>v.duration_seconds
  or v_intent.runway_model<>v.runway_model then
   raise exception 'reservation invalidated';end if;
 if p_transition='about-to-submit' then
   if v.state<>'reserved' then raise exception 'submission already attempted';end if;
   update public.v8_e02_runway_reservations
    set state='submission-uncertain',updated_at=now() where id=v.id;
 elsif p_transition='task-known' then
   if v.state not in ('submission-uncertain','task-known') or
     p_task_id is null or length(btrim(p_task_id))<8 or length(p_task_id)>160 or
     (v.provider_task_id is not null and v.provider_task_id<>p_task_id) then
    raise exception 'invalid task id/state';end if;
   update public.v8_e02_runway_reservations
    set provider_task_id=p_task_id,state='task-known',updated_at=now() where id=v.id;
   update public.v8_e02_render_intents set runway_task_id=p_task_id,
    state='task-known',updated_at=now()
    where film_id=v.film_id and scene_id=v.scene_id and shot_id=v.shot_id;
 elsif p_transition='video-ready' then
   v_task:=v.provider_task_id;
   if v.state not in('task-known','video-ready') or v_task is null
    or p_task_id is distinct from v_task
    or p_video_sha256 is null or p_video_sha256 !~ '^[a-f0-9]{64}$'
    or p_file_bytes is null or p_file_bytes not between 10000 and 104857600
    or p_storage_path is null
    or p_storage_path<>v.film_id||'/e02/'||lower(v.shot_id)||'/'||p_video_sha256||'.mp4'
    or not exists (select 1 from storage.objects o where
      o.bucket_id='viralcine-scene-videos' and o.name=p_storage_path) then
     raise exception 'invalid rendered video evidence';end if;
   insert into public.v8_e02_render_outputs(film_id,scene_id,shot_id,
    reservation_id,provider_task_id,storage_path,video_sha256,file_bytes)
   values(v.film_id,'E02',v.shot_id,v.id,v_task,p_storage_path,p_video_sha256,p_file_bytes)
   on conflict(film_id,scene_id,shot_id) do nothing;
   if not exists(select 1 from public.v8_e02_render_outputs o
       where o.film_id=v.film_id and o.shot_id=v.shot_id
        and o.video_sha256=p_video_sha256 and o.provider_task_id=v_task) then
     raise exception 'conflicting finished file';end if;
   update public.v8_e02_runway_reservations
     set state='video-ready',updated_at=now() where id=v.id;
   update public.v8_e02_render_intents
     set video_sha256=p_video_sha256,state='qa-pending',updated_at=now()
     where film_id=v.film_id and scene_id='E02' and shot_id=v.shot_id;
 elsif p_transition='failed-review' then
   if v.state not in ('task-known','submission-uncertain') then
    raise exception 'cannot fail this state';end if;
   update public.v8_e02_runway_reservations
    set state='failed-needs-review',updated_at=now() where id=v.id;
   update public.v8_e02_render_intents
    set state='blocked',updated_at=now()
    where film_id=v.film_id and scene_id='E02' and shot_id=v.shot_id;
 else
  raise exception 'unknown transition';
 end if;
 insert into public.v8_e02_runway_events(reservation_id,shot_id,transition,task_id)
 values(v.id,v.shot_id,p_transition,p_task_id);
 return jsonb_build_object('shotId',v.shot_id,'transition',p_transition,
  'noAutomaticDuplicate',true);
end;
$fn$;
revoke all on function public.v8_note_e02_runway_transition(uuid,text,text,text,text,bigint)
 from public,anon,authenticated;
grant execute on function public.v8_note_e02_runway_transition(uuid,text,text,text,text,bigint)
 to service_role;
