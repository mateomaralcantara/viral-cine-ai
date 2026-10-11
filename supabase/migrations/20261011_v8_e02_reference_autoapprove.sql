-- E02 reference images: save to private Supabase Storage, auto-approve only
-- after the actual object exists. Does not create Runway renders or costs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('viralcine-scene-references','viralcine-scene-references',false,
 4000000,array['image/jpeg']::text[])
on conflict(id) do update
 set public=false,file_size_limit=4000000,
     allowed_mime_types=array['image/jpeg']::text[];

create table if not exists public.scene_reference_images (
 id uuid primary key default gen_random_uuid(),
 film_id text not null,
 scene_id text not null,
 shot_id text not null,
 storage_bucket text not null default 'viralcine-scene-references',
 storage_path text not null,
 file_name text not null,
 mime_type text not null check(mime_type='image/jpeg'),
 file_size bigint not null check(file_size between 3000 and 4000000),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 width integer not null check(width>=640),
 height integer not null check(height>=360),
 status text not null default 'ready' check(status in ('ready','archived')),
 approved boolean not null default true,
 approved_at timestamptz not null default now(),
 approval_mode text not null default 'auto-on-upload'
  check(approval_mode='auto-on-upload'),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(film_id='film-dos-toques-de-bocina-v7'),
 check(scene_id='E02'),
 check(shot_id ~ '^E02-P0[1-7]$'),
 check(storage_bucket='viralcine-scene-references'),
 check(status<>'ready' or (approved and active)),
 check(not active or status='ready')
);
create unique index if not exists scene_reference_one_active_per_shot
 on public.scene_reference_images(film_id,scene_id,shot_id)
 where active;
create unique index if not exists scene_reference_version_unique
 on public.scene_reference_images(film_id,scene_id,shot_id,sha256);
create unique index if not exists scene_reference_storage_unique
 on public.scene_reference_images(storage_bucket,storage_path);
create index if not exists scene_reference_film_idx
 on public.scene_reference_images(film_id,scene_id,shot_id);

alter table public.scene_reference_images enable row level security;
revoke all on public.scene_reference_images from anon,authenticated;
grant select,insert,update on public.scene_reference_images to service_role;

create or replace function public.v8_save_approved_e02_reference(
 p_film_id text,p_scene_id text,p_shot_id text,
 p_bucket text,p_path text,p_filename text,p_mime text,
 p_bytes bigint,p_sha256 text,p_width integer,p_height integer
)
returns jsonb language plpgsql security definer
set search_path=public,storage,pg_temp
as $$
declare
 current_ref public.scene_reference_images%rowtype;
 saved public.scene_reference_images%rowtype;
 coverage integer;
begin
 if auth.role() is distinct from 'service_role' then
  raise exception 'service role required';
 end if;
 if p_film_id<>'film-dos-toques-de-bocina-v7' or p_scene_id<>'E02' or
  p_shot_id !~ '^E02-P0[1-7]$' or
  p_bucket<>'viralcine-scene-references' or
  p_mime<>'image/jpeg' or
  p_bytes not between 3000 and 4000000 or
  p_width<>1280 or p_height<>720 or
  p_sha256 !~ '^[a-f0-9]{64}$' or
  p_path<>p_film_id||'/e02/'||lower(p_shot_id)||'/'||p_sha256||'.jpg' or
  length(p_filename)>240 then
  raise exception 'Invalid E02 approved reference';
 end if;
 -- Verify the uploaded private object exists before approving it.
 if not exists(select 1 from storage.objects
  where bucket_id=p_bucket and name=p_path) then
  raise exception 'Reference object has not been stored';
 end if;
 perform pg_advisory_xact_lock(hashtext(p_film_id||'/'||p_scene_id||'/'||p_shot_id));

 select * into current_ref from public.scene_reference_images
 where film_id=p_film_id and scene_id=p_scene_id and shot_id=p_shot_id
 and active for update;
 if found and current_ref.sha256=p_sha256 then
  saved:=current_ref;
 else
  -- Preserve past versions, including those that were previously archived.
  update public.scene_reference_images
   set active=false,status='archived',approved=false,updated_at=now()
   where film_id=p_film_id and scene_id=p_scene_id and shot_id=p_shot_id
    and active;
  insert into public.scene_reference_images(
   film_id,scene_id,shot_id,storage_bucket,storage_path,
   file_name,mime_type,file_size,sha256,width,height,status,
   approved,approved_at,approval_mode,active
  ) values(
   p_film_id,p_scene_id,p_shot_id,p_bucket,p_path,
   p_filename,p_mime,p_bytes,p_sha256,p_width,p_height,
   'ready',true,now(),'auto-on-upload',true
  )
  on conflict(film_id,scene_id,shot_id,sha256) do update
   set storage_path=excluded.storage_path,file_name=excluded.file_name,
    file_size=excluded.file_size,width=excluded.width,height=excluded.height,
    status='ready',approved=true,approved_at=now(),
    approval_mode='auto-on-upload',active=true,updated_at=now()
  returning * into saved;
 end if;
 select count(distinct shot_id) into coverage
 from public.scene_reference_images
 where film_id=p_film_id and scene_id=p_scene_id and active
  and approved and status='ready';
 return jsonb_build_object('shotId',saved.shot_id,'approved',saved.approved,
  'readyForScene',saved.status='ready' and saved.active,
  'status',saved.status,'sha256',saved.sha256,
  'storagePath',saved.storage_path,
  'referenceCoverage',coverage,'sceneReady',coverage=7);
end;
$$;
revoke all on function public.v8_save_approved_e02_reference(
 text,text,text,text,text,text,text,bigint,text,integer,integer)
 from public,anon,authenticated;
grant execute on function public.v8_save_approved_e02_reference(
 text,text,text,text,text,text,text,bigint,text,integer,integer)
 to service_role;
