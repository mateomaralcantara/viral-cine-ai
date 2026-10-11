-- ViralCine V8 E02 owner-only web panel, one-use bootstrap, vault-protected Runway API key.
-- Neither migration nor setup change the $3.50 authorization or place paid tasks.
create table if not exists v8_internal.e02_panel_owner(
 id integer primary key default 1 check(id=1),
 bootstrap_hash text,
 bootstrap_expires timestamptz,
 password_hash text,
 session_hash text,
 session_expires timestamptz,
 failed_attempts int not null default 0,
 locked_until timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
revoke all on v8_internal.e02_panel_owner from public,anon,authenticated;
insert into v8_internal.e02_panel_owner(id) values(1) on conflict(id) do nothing;

create or replace function public.v8_e02_panel_auth(
 p_action text,
 p_bootstrap text default null,
 p_password text default null,
 p_session text default null
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog
as $fn$
declare
 v v8_internal.e02_panel_owner%rowtype;
 v_token text;
 v_ok boolean:=false;
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role'
 then raise exception 'service role required';end if;
 select * into v from v8_internal.e02_panel_owner where id=1 for update;
 if not found then raise exception 'owner table absent';end if;
 if p_action='info' then
  return jsonb_build_object('setupRequired',v.password_hash is null,'passwordEnabled',v.password_hash is not null);
 end if;
 if p_action='verify' then
  return jsonb_build_object('ok',
   p_session is not null and length(p_session)>=48 and
   v.session_hash=encode(extensions.digest(p_session,'sha256'),'hex') and
   v.session_expires>now());
 end if;
 if p_action='logout' then
  if p_session is not null and v.session_hash=encode(extensions.digest(p_session,'sha256'),'hex') then
   update v8_internal.e02_panel_owner set session_hash=null,session_expires=null,updated_at=now() where id=1;
  end if;
  return jsonb_build_object('ok',true);
 end if;
 if p_action not in ('setup','login') then return jsonb_build_object('ok',false);end if;
 if v.locked_until is not null and v.locked_until>now() then
   return jsonb_build_object('ok',false,'error','temporarily-locked');end if;
 if p_password is null or length(p_password)<12 or length(p_password)>128 then
   return jsonb_build_object('ok',false,'error','password-must-be-12-or-more');end if;
 if p_action='setup' then
  v_ok:=v.password_hash is null and v.bootstrap_hash is not null
   and v.bootstrap_expires>now()
   and p_bootstrap is not null
   and length(p_bootstrap)=48
   and v.bootstrap_hash=encode(extensions.digest(p_bootstrap,'sha256'),'hex');
  if v_ok then
   update v8_internal.e02_panel_owner
   set password_hash=extensions.crypt(p_password,extensions.gen_salt('bf',12)),
    bootstrap_hash=null,bootstrap_expires=null,failed_attempts=0,locked_until=null,updated_at=now()
   where id=1;
  end if;
 else
  v_ok:=v.password_hash is not null and
    v.password_hash=extensions.crypt(p_password,v.password_hash);
 end if;
 if not v_ok then
  update v8_internal.e02_panel_owner
  set failed_attempts=case when failed_attempts>=9 then 0 else failed_attempts+1 end,
      locked_until=case when failed_attempts>=9 then now()+interval '20 minutes' else locked_until end,
      updated_at=now()
  where id=1;
  return jsonb_build_object('ok',false,'error','invalid-credentials');
 end if;
 v_token:=encode(gen_random_bytes(32),'hex');
 update v8_internal.e02_panel_owner
  set session_hash=encode(extensions.digest(v_token,'sha256'),'hex'),
      session_expires=now()+interval '48 hours',
      failed_attempts=0,locked_until=null,updated_at=now() where id=1;
 return jsonb_build_object('ok',true,'session',v_token,'expiresHours',48);
end;
$fn$;
revoke all on function public.v8_e02_panel_auth(text,text,text,text) from public,anon,authenticated;
grant execute on function public.v8_e02_panel_auth(text,text,text,text) to service_role;

create or replace function public.v8_e02_panel_store_runway_secret(p_secret text)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $fn$
declare
 v_id uuid;
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role'
 then raise exception 'service role required';end if;
 if p_secret is null or length(p_secret) not between 20 and 500 or p_secret !~ '^[A-Za-z0-9_-]+$' then
  raise exception 'invalid runway secret';end if;
 select id into v_id from vault.secrets where name='v8_e02_runway_api_secret';
 if found then
  perform vault.update_secret(v_id,p_secret,'v8_e02_runway_api_secret',
   'Private ViralCine E02 API key; only server reads',null);
 else
  perform vault.create_secret(p_secret,'v8_e02_runway_api_secret',
   'Private ViralCine E02 API key; only server reads',null);
 end if;
 -- Credentials changed: stop production until a new authenticated balance check.
 update public.v8_film_autonomy_policy
  set provider_balance_confirmed=false,status='paused',updated_at=now()
  where film_id='film-dos-toques-de-bocina-v7';
 return jsonb_build_object('configured',true,'productionPaused',true);
end;
$fn$;
revoke all on function public.v8_e02_panel_store_runway_secret(text) from public,anon,authenticated;
grant execute on function public.v8_e02_panel_store_runway_secret(text) to service_role;

create or replace function public.v8_e02_get_runway_secret()
returns text language plpgsql stable security definer set search_path=pg_catalog
as $fn$
declare v text;
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
  raise exception 'service role required';end if;
 select decrypted_secret into v from vault.decrypted_secrets
 where name='v8_e02_runway_api_secret' limit 1;
 return v;
end;
$fn$;
revoke all on function public.v8_e02_get_runway_secret() from public,anon,authenticated;
grant execute on function public.v8_e02_get_runway_secret() to service_role;

create or replace function public.v8_e02_panel_control(
 p_action text,
 p_available_credits integer default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $fn$
declare v public.v8_film_autonomy_policy%rowtype;
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role'
 then raise exception 'service role required';end if;
 select * into v from public.v8_film_autonomy_policy
 where film_id='film-dos-toques-de-bocina-v7' for update;
 if not found then raise exception 'film policy missing';end if;
 if p_action='pause' then
  update public.v8_film_autonomy_policy
   set status='paused',provider_balance_confirmed=false,updated_at=now()
   where film_id=v.film_id;
  return jsonb_build_object('status','paused','existingProviderTasksMayContinue',true);
 end if;
 if p_action<>'launch' then raise exception 'invalid action';end if;
 if v.director_mode<>'credits-only' or v.video_provider<>'runway' or v.avatares_enabled
   or v.authorized_spend_usd<>3.50 or v.spent_or_reserved_usd>3.50 or
   v.max_paid_renders_per_shot<1 or
   p_available_credits is null or p_available_credits<350 then
  return jsonb_build_object('status','blocked','reason','budget-policy-or-provider-credits',
   'requiredCredits',350);
 end if;
 if not exists(select 1 from vault.secrets where name='v8_e02_runway_api_secret') then
  return jsonb_build_object('status','blocked','reason','runway-secret-not-configured');
 end if;
 if (select count(*) from public.v8_e02_shot_specs where film_id=v.film_id and scene_id='E02')<>7
  or (select count(*) from public.scene_reference_images where film_id=v.film_id and scene_id='E02'
       and active and approved and status='ready')<>7 then
  return jsonb_build_object('status','blocked','reason','missing-approved-assets');
 end if;
 update public.v8_film_autonomy_policy
  set status='ready',provider_balance_confirmed=true,
    max_paid_renders_per_shot=1,updated_at=now()
  where film_id=v.film_id;
 return jsonb_build_object('status','armed','maximumUsd',3.50,
  'minimumCreditsValidated',350,'regenAllowed',false,'cronDispatcherEnabled',true);
end;
$fn$;
revoke all on function public.v8_e02_panel_control(text,integer) from public,anon,authenticated;
grant execute on function public.v8_e02_panel_control(text,integer) to service_role;
