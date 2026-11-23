-- ViralCine 7 Feature Film OS
-- Operational controls: spend, rights, permissions, libraries, QA, provider health and metrics.
-- SAFE: specification only. Not executed automatically.

begin;

create table if not exists spend_ledger (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  job_id text references generation_jobs(id) on delete set null,
  take_id text references takes(id) on delete set null,
  provider text not null,
  operation text not null,
  state text not null check (
    state in (
      'reserved',
      'submitted',
      'succeeded',
      'failed-no-charge',
      'failed-unknown',
      'reconciled'
    )
  ),
  estimated_usd numeric(14,4) not null default 0 check (estimated_usd >= 0),
  actual_usd numeric(14,4) check (actual_usd is null or actual_usd >= 0),
  risk_usd numeric(14,4) not null default 0 check (risk_usd >= 0),
  idempotency_key text not null,
  provider_task_id text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists idx_spend_ledger_film_key
  on spend_ledger(film_id, idempotency_key, created_at desc);

create index if not exists idx_spend_ledger_provider_task
  on spend_ledger(provider, provider_task_id)
  where provider_task_id is not null;

create table if not exists rights_grants (
  id text primary key,
  film_id text references films(id) on delete cascade,
  subject_type text not null check (
    subject_type in ('actor', 'voice', 'asset', 'music', 'location')
  ),
  subject_id text not null,
  status text not null check (
    status in ('unknown', 'owned', 'licensed', 'consented', 'restricted', 'expired')
  ),
  territories jsonb not null default '["worldwide"]'::jsonb,
  allowed_uses jsonb not null default '[]'::jsonb,
  consent_reference text,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_rights_subject
  on rights_grants(subject_type, subject_id, created_at desc);

create table if not exists film_memberships (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  principal_id text not null,
  role text not null check (
    role in ('owner', 'producer', 'director', 'editor', 'reviewer', 'viewer')
  ),
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(film_id, principal_id)
);

create table if not exists actor_library (
  id text primary key,
  display_name text not null,
  face_reference_asset_ids jsonb not null default '[]'::jsonb,
  body_reference_asset_ids jsonb not null default '[]'::jsonb,
  voice_profile_ids jsonb not null default '[]'::jsonb,
  rights_status text not null default 'unknown',
  consent_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists film_library (
  id text primary key,
  film_id text not null unique references films(id) on delete cascade,
  title text not null,
  final_version_id text references film_versions(id) on delete set null,
  master_asset_ids jsonb not null default '[]'::jsonb,
  reusable_asset_ids jsonb not null default '[]'::jsonb,
  status text not null check (
    status in ('development', 'production', 'post', 'approved', 'released', 'archived')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists relationship_states (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  from_character_id text not null references characters(id) on delete cascade,
  to_character_id text not null references characters(id) on delete cascade,
  label text not null,
  state text not null,
  effective_from numeric(12,3) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_relationship_states_pair
  on relationship_states(film_id, from_character_id, to_character_id, effective_from desc);

create table if not exists narrative_states (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  scene_id text not null references scenes(id) on delete cascade,
  facts jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  resolved_questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_narrative_states_film_scene
  on narrative_states(film_id, scene_id, created_at desc);

create table if not exists quality_reports (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  level text not null check (
    level in ('take', 'shot', 'scene', 'sequence', 'act', 'film')
  ),
  target_id text not null,
  category_scores jsonb not null default '{}'::jsonb,
  overall_score numeric(5,2) not null check (overall_score between 0 and 10),
  critical_failures jsonb not null default '[]'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  passed boolean not null,
  report_asset_id text references assets(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_quality_reports_target
  on quality_reports(film_id, level, target_id, created_at desc);

create table if not exists provider_health (
  provider_id text primary key,
  success_rate numeric(8,5) not null default 1 check (success_rate between 0 and 1),
  average_quality numeric(5,2) not null default 0 check (average_quality between 0 and 10),
  average_latency_ms bigint not null default 0 check (average_latency_ms >= 0),
  consecutive_safe_failures integer not null default 0 check (consecutive_safe_failures >= 0),
  circuit_open boolean not null default false,
  capability_snapshot jsonb not null default '{}'::jsonb,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists provider_tasks (
  id text primary key,
  provider text not null,
  provider_task_id text not null,
  film_id text not null references films(id) on delete cascade,
  job_id text references generation_jobs(id) on delete set null,
  take_id text references takes(id) on delete set null,
  status text not null,
  billing_state text not null default 'unknown',
  estimated_cost_usd numeric(14,4) not null default 0,
  realized_cost_usd numeric(14,4),
  request_snapshot jsonb not null default '{}'::jsonb,
  response_snapshot jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider, provider_task_id)
);

create index if not exists idx_provider_tasks_job
  on provider_tasks(film_id, job_id);

create table if not exists production_metrics (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  film_version_id text references film_versions(id) on delete set null,
  scenes integer not null default 0,
  shots integer not null default 0,
  takes integer not null default 0,
  approved_takes integer not null default 0,
  finished_minutes numeric(12,4) not null default 0,
  actual_spend_usd numeric(14,4) not null default 0,
  cost_per_finished_minute_usd numeric(14,4) not null default 0,
  approval_rate numeric(8,5) not null default 0,
  provider_breakdown jsonb not null default '{}'::jsonb,
  quality_breakdown jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

create index if not exists idx_production_metrics_film
  on production_metrics(film_id, captured_at desc);

create table if not exists master_audits (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  film_version_id text references film_versions(id) on delete set null,
  timeline_version_id text references timeline_versions(id) on delete set null,
  passed boolean not null,
  blockers jsonb not null default '[]'::jsonb,
  qa_score numeric(5,2) not null default 0,
  duration_seconds numeric(12,3) not null default 0,
  has_film_approval boolean not null default false,
  has_master_approval boolean not null default false,
  report_asset_id text references assets(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists repair_plans (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  quality_report_id text references quality_reports(id) on delete cascade,
  target_type text not null,
  target_id text not null,
  regenerate_only jsonb not null default '[]'::jsonb,
  preserve_unaffected_assets boolean not null default true,
  auto_retry_allowed boolean not null default false,
  status text not null default 'planned',
  created_at timestamptz not null default now()
);

comment on table spend_ledger is
'Append-only financial audit. failed-unknown counts as risk and blocks automatic retries.';
comment on table rights_grants is
'Tracks consent/licensing/ownership for actors, voices, media, music and locations.';
comment on table provider_tasks is
'Durable provider reconciliation record independent from queue transport.';
comment on table repair_plans is
'Root-cause repair plan. Regenerate only failed sources and preserve approved assets.';

commit;
