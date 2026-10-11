-- V8 E02: private authenticated, zero-spend cloud rehearsal worker.
-- Never store access tokens in GitHub or in pg_cron job text.
create table if not exists v8_internal.e02_cron_credentials (
  name text primary key,
  token text not null default replace(gen_random_uuid()::text,'-','') ||
       replace(gen_random_uuid()::text,'-','') ||
       replace(gen_random_uuid()::text,'-',''),
  created_at timestamptz not null default now()
);
revoke all on v8_internal.e02_cron_credentials from public,anon,authenticated;
grant usage on schema v8_internal to service_role;
grant select on v8_internal.e02_cron_credentials to service_role;
insert into v8_internal.e02_cron_credentials(name)
values ('v8-e02-runway-dryrun') on conflict(name) do nothing;

create table if not exists public.v8_e02_worker_ticks (
 id bigint generated always as identity primary key,
 film_id text not null default 'film-dos-toques-de-bocina-v7'
  check (film_id='film-dos-toques-de-bocina-v7'),
 worker text not null default 'v8-e02-runway-dryrun'
  check (worker='v8-e02-runway-dryrun'),
 status text not null
  check (status in ('blocked-credits','awaiting-executor','blocked-integrity','blocked-policy','error')),
 total_shots integer not null check(total_shots between 0 and 7),
 verified_shots integer not null check(verified_shots between 0 and 7),
 blocked_shots integer not null check(blocked_shots between 0 and 7),
 paid_calls integer not null default 0 check(paid_calls=0),
 notes jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.v8_e02_worker_ticks enable row level security;
revoke all on public.v8_e02_worker_ticks from public,anon,authenticated;
grant select,insert on public.v8_e02_worker_ticks to service_role;

create or replace function public.v8_verify_e02_cron_token(p_token text)
returns boolean language sql stable security invoker
set search_path=pg_catalog
as $func$
 select current_user='service_role'
   and p_token is not null and length(p_token)=96
   and exists(
    select 1 from v8_internal.e02_cron_credentials c
    where c.name='v8-e02-runway-dryrun'
      and c.token=p_token
   );
$func$;
revoke all on function public.v8_verify_e02_cron_token(text)
 from public,anon,authenticated;
grant execute on function public.v8_verify_e02_cron_token(text) to service_role;
