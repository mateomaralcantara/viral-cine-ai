-- ViralCine V8 | durable, free-only background queue.
-- Additive migration. Does not insert films, copy private assets, or submit video jobs.
-- A hosted worker and verified cloud assets are prerequisites for execution.
create table if not exists public.v8_autonomy_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null unique,
  film_id text not null,
  scene_id text not null,
  shot_id text,
  action text not null check(action in ('source-check','provider-reconcile','director-plan','quality-check')),
  state text not null default 'queued' check(state in
    ('queued','running','retry-wait','waiting-assets','waiting-provider','waiting-approval','blocked-unknown','completed','failed')),
  attempt integer not null default 0 check(attempt>=0),
  max_attempts integer not null default 3 check(max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  lock_token uuid,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(job_key) between 3 and 240)
);
create index if not exists v8_autonomy_ready_idx
 on public.v8_autonomy_jobs(available_at,created_at)
 where state in ('queued','retry-wait','running');
create index if not exists v8_autonomy_scene_idx
 on public.v8_autonomy_jobs(film_id,scene_id,state);

create table if not exists public.v8_autonomy_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.v8_autonomy_jobs(id) on delete restrict,
  transition text not null,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists v8_autonomy_events_idx
 on public.v8_autonomy_job_events(job_id,occurred_at);

alter table public.v8_autonomy_jobs enable row level security;
alter table public.v8_autonomy_job_events enable row level security;
revoke all on public.v8_autonomy_jobs from anon,authenticated;
revoke all on public.v8_autonomy_job_events from anon,authenticated;
revoke all on public.v8_autonomy_job_events_id_seq from anon,authenticated;

-- A worker holding the service role JWT may claim one job with row locking.
-- Claims are lease-based: if the host crashes, the same job becomes claimable.
-- No billable API requests occur in SQL.
create or replace function public.v8_claim_autonomy_job(p_lease_seconds integer default 120)
returns setof public.v8_autonomy_jobs
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  chosen public.v8_autonomy_jobs%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required';
  end if;
  if p_lease_seconds not between 30 and 900 then
    raise exception 'invalid lease';
  end if;

  select * into chosen
  from public.v8_autonomy_jobs
  where
    (
      state in ('queued','retry-wait') and available_at <= now()
      or state='running' and lease_until < now()
    )
    and attempt < max_attempts
  order by available_at asc, created_at asc
  for update skip locked
  limit 1;
  if not found then return; end if;

  update public.v8_autonomy_jobs
  set state='running', attempt=attempt+1, lock_token=gen_random_uuid(),
      lease_until=now()+make_interval(secs=>p_lease_seconds),
      updated_at=now()
  where id=chosen.id
  returning * into chosen;

  insert into public.v8_autonomy_job_events(job_id,transition,detail)
  values(chosen.id,'claimed',jsonb_build_object('attempt',chosen.attempt));

  return next chosen;
end;
$$;

-- Fencing token rejects stale workers after a lease is re-claimed. Success,
-- transient retries and recoverable holds have different terminal states.
create or replace function public.v8_finish_autonomy_job(
 p_id uuid, p_lock_token uuid, p_state text,
 p_result jsonb default '{}'::jsonb,
 p_error text default null, p_retry_seconds integer default 60
)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
 rec public.v8_autonomy_jobs%rowtype;
 final_state text;
begin
 if auth.role() is distinct from 'service_role' then
  raise exception 'service role required';
 end if;
 if p_state not in ('completed','retry-wait','waiting-assets',
  'waiting-provider','waiting-approval','blocked-unknown','failed') then
  raise exception 'invalid transition';
 end if;
 if p_retry_seconds not between 30 and 3600 then
  raise exception 'invalid retry delay';
 end if;

 select * into rec from public.v8_autonomy_jobs
 where id=p_id and lock_token=p_lock_token and state='running'
 for update;
 if not found then return false; end if;
 final_state:=p_state;
 if final_state='retry-wait' and rec.attempt>=rec.max_attempts then
   final_state:='failed';
 end if;

 update public.v8_autonomy_jobs
 set state=final_state,
     available_at=case when final_state='retry-wait'
       then now()+make_interval(secs=>p_retry_seconds) else available_at end,
     lock_token=null,lease_until=null,
     result=coalesce(p_result,'{}'::jsonb),
     last_error=left(p_error,1000),updated_at=now()
 where id=p_id;
 insert into public.v8_autonomy_job_events(job_id,transition,detail)
 values(p_id,final_state,jsonb_build_object('attempt',rec.attempt,
   'error',left(p_error,300)));
 return true;
end;
$$;
revoke all on function public.v8_claim_autonomy_job(integer) from public,anon,authenticated;
revoke all on function public.v8_finish_autonomy_job(uuid,uuid,text,jsonb,text,integer)
 from public,anon,authenticated;
grant execute on function public.v8_claim_autonomy_job(integer) to service_role;
grant execute on function public.v8_finish_autonomy_job(uuid,uuid,text,jsonb,text,integer)
 to service_role;
