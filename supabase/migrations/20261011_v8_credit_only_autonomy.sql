-- ViralCine V8 | director preference: fully autonomous agents, credit-only approvals.
-- No videos rendered and no purchase or credit authorization is created here.
create table if not exists public.v8_film_autonomy_policy (
 film_id text primary key,
 director_mode text not null default 'credits-only'
  check(director_mode='credits-only'),
 video_provider text not null default 'runway' check(video_provider='runway'),
 avatares_enabled boolean not null default false check(avatares_enabled=false),
 auto_approve_qa_pass boolean not null default true,
 require_audio_in_final_master boolean not null default true,
 max_free_repairs_per_shot integer not null default 3
  check(max_free_repairs_per_shot between 0 and 10),
 max_paid_renders_per_shot integer not null default 2
  check(max_paid_renders_per_shot between 1 and 5),
 authorized_spend_usd numeric(12,2) not null default 0
  check(authorized_spend_usd >= 0),
 spent_or_reserved_usd numeric(12,2) not null default 0
  check(spent_or_reserved_usd >= 0),
 provider_balance_confirmed boolean not null default false,
 status text not null default 'waiting-provider'
  check(status in ('ready','waiting-provider','waiting-assets','paused')),
 updated_at timestamptz not null default now(),
 check(spent_or_reserved_usd<=authorized_spend_usd)
);
alter table public.v8_film_autonomy_policy enable row level security;
revoke all on public.v8_film_autonomy_policy from anon,authenticated;
-- Changes to money require a future audited, authenticated authorization flow.
-- No anonymous/director-client write access to credit limits.
grant select,insert,update on public.v8_film_autonomy_policy to service_role;

insert into public.v8_film_autonomy_policy(
 film_id,director_mode,video_provider,avatares_enabled,
 auto_approve_qa_pass,require_audio_in_final_master,
 max_free_repairs_per_shot,max_paid_renders_per_shot,
 authorized_spend_usd,spent_or_reserved_usd,
 provider_balance_confirmed,status
) values (
 'film-dos-toques-de-bocina-v7','credits-only','runway',false,
 true,true,3,2,0,0,false,'waiting-provider'
)
on conflict(film_id) do update set
 director_mode='credits-only',
 video_provider='runway',
 avatares_enabled=false,
 auto_approve_qa_pass=true,
 require_audio_in_final_master=true,
 max_free_repairs_per_shot=3,
 max_paid_renders_per_shot=2,
 updated_at=now();
-- Deliberately preserve existing amounts, confirmed balance and status.
-- No queue job is enqueued; cloud assets and worker host are still missing.
