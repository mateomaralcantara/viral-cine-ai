-- ============================================================
-- VIRALCINE 7 — SUPABASE BOOTSTRAP
-- Generated from versioned migrations 0001–0004.
-- Run on a NEW dedicated Supabase project.
-- ============================================================

-- ViralCine 7 Feature Film OS
-- Initial PostgreSQL/Supabase schema specification.
-- SAFE: versioned SQL only. This migration is NOT executed automatically.

begin;

create table if not exists films (
  id text primary key,
  title text not null,
  premise text not null default '',
  duration_minutes numeric(8,3) not null check (duration_minutes >= 1),
  genre text not null default 'Drama',
  audience text not null default '',
  visual_style text not null default '',
  language text not null default 'es',
  aspect_ratio text not null default '16:9',
  budget_usd numeric(14,4) not null default 0 check (budget_usd >= 0),
  current_version_id text,
  timeline_id text,
  legacy_project_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists film_versions (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  label text not null,
  version_number integer not null check (version_number > 0),
  parent_version_id text references film_versions(id),
  status text not null,
  timeline_version_id text,
  change_summary text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  unique(film_id, version_number)
);

create table if not exists acts (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  position integer not null check (position between 1 and 5),
  title text not null,
  dramatic_objective text not null default '',
  unique(film_id, position)
);

create table if not exists sequences (
  id text primary key,
  act_id text not null references acts(id) on delete cascade,
  position integer not null check (position > 0),
  title text not null,
  objective text not null default '',
  unique(act_id, position)
);

create table if not exists scenes (
  id text primary key,
  sequence_id text not null references sequences(id) on delete cascade,
  position integer not null check (position > 0),
  title text not null,
  summary text not null default '',
  duration_seconds numeric(10,3) not null check (duration_seconds > 0),
  time_index numeric(12,3) not null default 0,
  location_id text,
  narrative_goal text not null default '',
  emotional_goal text not null default '',
  continuity_notes jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  unique(sequence_id, position)
);

create table if not exists shots (
  id text primary key,
  scene_id text not null references scenes(id) on delete cascade,
  position integer not null check (position > 0),
  title text not null,
  intention text not null default '',
  duration_seconds numeric(10,3) not null check (duration_seconds > 0),
  visual_prompt text not null default '',
  camera text not null default '',
  spoken_text text not null default '',
  speaker_id text,
  character_ids jsonb not null default '[]'::jsonb,
  character_state_ids jsonb not null default '{}'::jsonb,
  strategy text not null default 'generic-cinematic',
  selected_take_id text,
  metadata jsonb not null default '{}'::jsonb,
  unique(scene_id, position)
);

create table if not exists takes (
  id text primary key,
  shot_id text not null references shots(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null,
  provider text,
  provider_model text,
  provider_task_id text,
  generation_job_id text,
  video_asset_id text,
  audio_asset_id text,
  image_asset_id text,
  estimated_cost_usd numeric(14,4) not null default 0,
  actual_cost_usd numeric(14,4),
  quality_score numeric(5,2),
  quality_report_id text,
  failure_classification text,
  failure_detail text,
  legacy_video_asset_path text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  unique(shot_id, version)
);

alter table shots
  drop constraint if exists shots_selected_take_fk;
alter table shots
  add constraint shots_selected_take_fk
  foreign key (selected_take_id) references takes(id) deferrable initially deferred;

create table if not exists characters (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  name text not null,
  role text not null,
  age integer,
  appearance text not null default '',
  personality text not null default '',
  identity_lock text not null default '',
  immutable_traits jsonb not null default '[]'::jsonb,
  voice_profile_id text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists character_states (
  id text primary key,
  character_id text not null references characters(id) on delete cascade,
  film_id text not null references films(id) on delete cascade,
  label text not null,
  appearance text not null default '',
  hair text not null default '',
  makeup text not null default '',
  physical_condition text not null default '',
  emotional_state text not null default '',
  injuries jsonb not null default '[]'::jsonb,
  wardrobe_set_id text,
  location_id text,
  carrying_prop_ids jsonb not null default '[]'::jsonb,
  reference_asset_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists locations (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  name text not null,
  description text not null default '',
  canonical_reference_asset_ids jsonb not null default '[]'::jsonb
);

create table if not exists location_states (
  id text primary key,
  location_id text not null references locations(id) on delete cascade,
  film_id text not null references films(id) on delete cascade,
  label text not null,
  condition text not null default '',
  lighting text not null default '',
  time_of_day text,
  reference_asset_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists props (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  name text not null,
  description text not null default ''
);

create table if not exists prop_states (
  id text primary key,
  prop_id text not null references props(id) on delete cascade,
  film_id text not null references films(id) on delete cascade,
  holder_character_id text references characters(id),
  location_id text references locations(id),
  condition text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists wardrobe_sets (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  character_id text not null references characters(id) on delete cascade,
  name text not null,
  description text not null,
  reference_asset_ids jsonb not null default '[]'::jsonb
);

create table if not exists voice_profiles (
  id text primary key,
  actor_library_id text,
  character_id text references characters(id) on delete set null,
  provider text not null,
  provider_voice_id text,
  provider_model text,
  language text not null,
  accent text,
  age_profile text,
  gender_profile text,
  timbre text not null default '',
  pitch numeric(8,3),
  speed numeric(8,3) not null default 1,
  stability numeric(8,5),
  similarity numeric(8,5),
  emotion_presets jsonb not null default '{}'::jsonb,
  pronunciation_dictionary jsonb not null default '{}'::jsonb,
  canonical_sample_asset_id text,
  previous_approved_sample_asset_id text,
  voice_version integer not null default 1,
  rights_status text not null default 'unknown',
  consent_reference text,
  approved boolean not null default false
);

create table if not exists assets (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  type text not null,
  storage_path text not null,
  sha256 text,
  mime_type text,
  bytes bigint,
  duration_seconds numeric(12,3),
  width integer,
  height integer,
  source text not null,
  provider text,
  provider_task_id text,
  generation_job_id text,
  character_id text references characters(id) on delete set null,
  scene_id text references scenes(id) on delete set null,
  shot_id text references shots(id) on delete set null,
  take_id text references takes(id) on delete set null,
  version integer not null default 1,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists generation_jobs (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  type text not null,
  scene_id text references scenes(id) on delete cascade,
  shot_id text references shots(id) on delete cascade,
  take_id text references takes(id) on delete cascade,
  provider text,
  status text not null,
  priority integer not null default 0,
  depends_on jsonb not null default '[]'::jsonb,
  estimated_cost_usd numeric(14,4) not null default 0,
  actual_cost_usd numeric(14,4),
  idempotency_key text not null,
  provider_task_id text,
  attempt integer not null default 0,
  max_attempts integer not null default 1,
  failure_classification text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  unique(film_id, idempotency_key)
);

create table if not exists continuity_events (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  scene_id text not null references scenes(id) on delete cascade,
  shot_id text references shots(id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  effective_from numeric(12,3) not null,
  created_at timestamptz not null default now()
);

create table if not exists scene_state_snapshots (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  scene_id text not null references scenes(id) on delete cascade,
  sequence_id text not null references sequences(id) on delete cascade,
  time_index numeric(12,3) not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists approvals (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  target_type text not null,
  target_id text not null,
  decision text not null,
  approved_by text not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists audit_events (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  actor text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  before_value jsonb,
  after_value jsonb,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists timelines (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  name text not null,
  frame_rate numeric(8,3) not null default 24,
  width integer not null default 1920,
  height integer not null default 1080,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists timeline_versions (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  timeline_id text not null references timelines(id) on delete cascade,
  label text not null,
  version_number integer not null check (version_number > 0),
  parent_version_id text references timeline_versions(id),
  status text not null,
  timeline_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(timeline_id, version_number)
);

create table if not exists asset_versions (
  id text primary key,
  asset_id text not null references assets(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  previous_version_id text references asset_versions(id),
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique(asset_id, version_number)
);

create table if not exists exports (
  id text primary key,
  film_id text not null references films(id) on delete cascade,
  film_version_id text references film_versions(id) on delete set null,
  timeline_version_id text references timeline_versions(id) on delete set null,
  asset_id text references assets(id) on delete set null,
  format text not null,
  resolution text,
  frame_rate numeric(8,3),
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_scenes_sequence on scenes(sequence_id, position);
create index if not exists idx_shots_scene on shots(scene_id, position);
create index if not exists idx_takes_shot on takes(shot_id, version);
create index if not exists idx_assets_film_type on assets(film_id, type);
create index if not exists idx_assets_take on assets(take_id);
create index if not exists idx_jobs_ready on generation_jobs(film_id, status, priority desc);
create index if not exists idx_continuity_film_time on continuity_events(film_id, effective_from);
create index if not exists idx_approvals_target on approvals(film_id, target_type, target_id);
create index if not exists idx_audit_film_time on audit_events(film_id, created_at desc);

comment on table generation_jobs is
'V7 durable job model. BullMQ/Redis will be an execution transport, not the source of truth.';
comment on table assets is
'Immutable provenance registry for generated, uploaded, derived, legacy and master assets.';
comment on table takes is
'Append-only generated attempts for a Shot. Regeneration creates a new Take instead of overwriting prior media.';

commit;


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


-- ViralCine 7 Feature Film OS
-- Process Memory: learn from production without losing history.
-- SAFE: versioned SQL only. This migration is NOT executed automatically.

begin;

create table if not exists process_definitions (
  id text primary key,
  process_key text not null unique,
  name text not null,
  domain text not null check (
    domain in (
      'story',
      'casting',
      'identity',
      'voice',
      'music',
      'continuity',
      'image',
      'video',
      'lipsync',
      'qa',
      'repair',
      'post',
      'master',
      'cost',
      'provider-routing',
      'storage',
      'other'
    )
  ),
  description text not null default '',
  canonical_version_id text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists process_versions (
  id text primary key,
  process_id text not null references process_definitions(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null check (
    status in ('draft', 'candidate', 'validated', 'promoted', 'deprecated', 'rejected')
  ),
  implementation_ref text,
  configuration jsonb not null default '{}'::jsonb,
  validation_rules jsonb not null default '{}'::jsonb,
  change_summary text not null default '',
  parent_version_id text references process_versions(id) on delete set null,
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  promoted_at timestamptz,
  unique(process_id, version_number)
);

alter table process_definitions
  drop constraint if exists process_definitions_canonical_version_fk;
alter table process_definitions
  add constraint process_definitions_canonical_version_fk
  foreign key (canonical_version_id) references process_versions(id)
  deferrable initially deferred;

create table if not exists process_runs (
  id text primary key,
  process_id text not null references process_definitions(id) on delete restrict,
  process_version_id text not null references process_versions(id) on delete restrict,
  film_id text references films(id) on delete set null,
  scene_id text references scenes(id) on delete set null,
  shot_id text references shots(id) on delete set null,
  take_id text references takes(id) on delete set null,
  job_id text references generation_jobs(id) on delete set null,
  correlation_id text,
  idempotency_key text,
  status text not null check (
    status in ('planned', 'running', 'succeeded', 'failed', 'cancelled', 'review-required')
  ),
  input_snapshot jsonb not null default '{}'::jsonb,
  output_snapshot jsonb not null default '{}'::jsonb,
  error_snapshot jsonb not null default '{}'::jsonb,
  estimated_cost_usd numeric(14,4) not null default 0 check (estimated_cost_usd >= 0),
  actual_cost_usd numeric(14,4) check (actual_cost_usd is null or actual_cost_usd >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_process_runs_idempotency
  on process_runs(process_version_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_process_runs_film
  on process_runs(film_id, created_at desc);

create index if not exists idx_process_runs_version
  on process_runs(process_version_id, created_at desc);

create table if not exists process_step_runs (
  id text primary key,
  process_run_id text not null references process_runs(id) on delete cascade,
  step_key text not null,
  position integer not null check (position > 0),
  status text not null check (
    status in ('planned', 'running', 'succeeded', 'failed', 'skipped', 'review-required')
  ),
  input_snapshot jsonb not null default '{}'::jsonb,
  output_snapshot jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  error_snapshot jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(process_run_id, position)
);

create table if not exists process_events (
  id text primary key,
  process_run_id text not null references process_runs(id) on delete cascade,
  film_id text references films(id) on delete set null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  actor text not null default 'system',
  created_at timestamptz not null default now()
);

create index if not exists idx_process_events_run_time
  on process_events(process_run_id, created_at);

create table if not exists incidents (
  id text primary key,
  film_id text references films(id) on delete set null,
  process_run_id text references process_runs(id) on delete set null,
  job_id text references generation_jobs(id) on delete set null,
  provider_task_id text,
  scene_id text references scenes(id) on delete set null,
  shot_id text references shots(id) on delete set null,
  take_id text references takes(id) on delete set null,
  category text not null,
  severity text not null check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  fingerprint text,
  title text not null,
  description text not null default '',
  provider text,
  provider_model text,
  billing_risk text not null default 'none' check (
    billing_risk in ('none', 'possible', 'confirmed', 'reconciled')
  ),
  status text not null default 'open' check (
    status in ('open', 'investigating', 'resolved', 'accepted', 'duplicate')
  ),
  evidence jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_incidents_fingerprint
  on incidents(fingerprint, opened_at desc)
  where fingerprint is not null;

create index if not exists idx_incidents_film_status
  on incidents(film_id, status, opened_at desc);

create table if not exists incident_events (
  id text primary key,
  incident_id text not null references incidents(id) on delete cascade,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  actor text not null default 'system',
  created_at timestamptz not null default now()
);

create table if not exists root_causes (
  id text primary key,
  incident_id text not null references incidents(id) on delete cascade,
  category text not null,
  cause text not null,
  contributing_factors jsonb not null default '[]'::jsonb,
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  evidence jsonb not null default '{}'::jsonb,
  verified boolean not null default false,
  verified_by text,
  created_at timestamptz not null default now()
);

create table if not exists repair_recipes (
  id text primary key,
  recipe_key text not null unique,
  name text not null,
  domain text not null,
  description text not null default '',
  canonical_version_id text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists repair_recipe_versions (
  id text primary key,
  repair_recipe_id text not null references repair_recipes(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null check (
    status in ('draft', 'candidate', 'validated', 'promoted', 'deprecated', 'rejected')
  ),
  trigger_conditions jsonb not null default '{}'::jsonb,
  repair_steps jsonb not null default '[]'::jsonb,
  preserve_rules jsonb not null default '{}'::jsonb,
  expected_cost_usd numeric(14,4) not null default 0 check (expected_cost_usd >= 0),
  minimum_successes integer not null default 3 check (minimum_successes >= 1),
  minimum_qa_score numeric(5,2),
  success_count integer not null default 0 check (success_count >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  last_validated_at timestamptz,
  parent_version_id text references repair_recipe_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  promoted_at timestamptz,
  unique(repair_recipe_id, version_number)
);

alter table repair_recipes
  drop constraint if exists repair_recipes_canonical_version_fk;
alter table repair_recipes
  add constraint repair_recipes_canonical_version_fk
  foreign key (canonical_version_id) references repair_recipe_versions(id)
  deferrable initially deferred;

create table if not exists repair_executions (
  id text primary key,
  incident_id text references incidents(id) on delete set null,
  repair_recipe_version_id text not null references repair_recipe_versions(id) on delete restrict,
  film_id text references films(id) on delete set null,
  process_run_id text references process_runs(id) on delete set null,
  target_type text not null,
  target_id text not null,
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb not null default '{}'::jsonb,
  outcome text not null check (
    outcome in ('succeeded', 'failed', 'partial', 'review-required')
  ),
  qa_score numeric(5,2),
  cost_usd numeric(14,4) not null default 0 check (cost_usd >= 0),
  created_at timestamptz not null default now()
);

create table if not exists prompt_templates (
  id text primary key,
  prompt_key text not null unique,
  domain text not null,
  name text not null,
  description text not null default '',
  canonical_version_id text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists prompt_versions (
  id text primary key,
  prompt_template_id text not null references prompt_templates(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null check (
    status in ('draft', 'candidate', 'validated', 'promoted', 'deprecated', 'rejected')
  ),
  template text not null,
  variables jsonb not null default '[]'::jsonb,
  model_family text,
  model_parameters jsonb not null default '{}'::jsonb,
  guardrails jsonb not null default '{}'::jsonb,
  change_summary text not null default '',
  parent_version_id text references prompt_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  promoted_at timestamptz,
  unique(prompt_template_id, version_number)
);

alter table prompt_templates
  drop constraint if exists prompt_templates_canonical_version_fk;
alter table prompt_templates
  add constraint prompt_templates_canonical_version_fk
  foreign key (canonical_version_id) references prompt_versions(id)
  deferrable initially deferred;

create table if not exists provider_observations (
  id text primary key,
  provider text not null,
  provider_model text,
  operation text not null,
  film_id text references films(id) on delete set null,
  process_run_id text references process_runs(id) on delete set null,
  success boolean not null,
  latency_ms bigint check (latency_ms is null or latency_ms >= 0),
  estimated_cost_usd numeric(14,4) not null default 0,
  actual_cost_usd numeric(14,4),
  quality_score numeric(5,2),
  error_category text,
  capability_snapshot jsonb not null default '{}'::jsonb,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_provider_observations_model
  on provider_observations(provider, provider_model, operation, created_at desc);

create table if not exists model_observations (
  id text primary key,
  model_family text not null,
  model_name text not null,
  task_type text not null,
  film_id text references films(id) on delete set null,
  process_run_id text references process_runs(id) on delete set null,
  prompt_version_id text references prompt_versions(id) on delete set null,
  success boolean not null,
  quality_score numeric(5,2),
  latency_ms bigint check (latency_ms is null or latency_ms >= 0),
  cost_usd numeric(14,4) not null default 0,
  input_characteristics jsonb not null default '{}'::jsonb,
  output_characteristics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_model_observations_task
  on model_observations(model_family, model_name, task_type, created_at desc);

create table if not exists quality_measurements (
  id text primary key,
  film_id text references films(id) on delete set null,
  process_run_id text references process_runs(id) on delete set null,
  target_type text not null,
  target_id text not null,
  metric_key text not null,
  numeric_value numeric(18,6),
  text_value text,
  unit text,
  threshold jsonb not null default '{}'::jsonb,
  passed boolean,
  measured_by text not null default 'system',
  created_at timestamptz not null default now()
);

create index if not exists idx_quality_measurements_target
  on quality_measurements(target_type, target_id, metric_key, created_at desc);

create table if not exists decision_log (
  id text primary key,
  film_id text references films(id) on delete set null,
  process_run_id text references process_runs(id) on delete set null,
  decision_type text not null,
  subject_type text not null,
  subject_id text,
  decision text not null,
  rationale text not null default '',
  alternatives jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  decided_by text not null default 'system',
  created_at timestamptz not null default now()
);

create table if not exists lessons_learned (
  id text primary key,
  domain text not null,
  film_id text references films(id) on delete set null,
  process_version_id text references process_versions(id) on delete set null,
  incident_id text references incidents(id) on delete set null,
  title text not null,
  lesson text not null,
  applicability jsonb not null default '{}'::jsonb,
  evidence_count integer not null default 1 check (evidence_count >= 1),
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  status text not null default 'candidate' check (
    status in ('candidate', 'validated', 'promoted', 'rejected', 'deprecated')
  ),
  created_at timestamptz not null default now(),
  promoted_at timestamptz
);

create table if not exists process_promotions (
  id text primary key,
  process_version_id text references process_versions(id) on delete cascade,
  repair_recipe_version_id text references repair_recipe_versions(id) on delete cascade,
  prompt_version_id text references prompt_versions(id) on delete cascade,
  promotion_type text not null check (
    promotion_type in ('process', 'repair-recipe', 'prompt')
  ),
  successful_runs integer not null check (successful_runs >= 0),
  failed_runs integer not null default 0 check (failed_runs >= 0),
  average_qa_score numeric(5,2),
  regression_check_passed boolean not null default false,
  approved_by text not null,
  rationale text not null default '',
  created_at timestamptz not null default now(),
  check (
    (promotion_type = 'process' and process_version_id is not null and repair_recipe_version_id is null and prompt_version_id is null)
    or
    (promotion_type = 'repair-recipe' and process_version_id is null and repair_recipe_version_id is not null and prompt_version_id is null)
    or
    (promotion_type = 'prompt' and process_version_id is null and repair_recipe_version_id is null and prompt_version_id is not null)
  )
);

create or replace function viralcine_forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ViralCine append-only history cannot be updated or deleted: %', TG_TABLE_NAME;
end;
$$;

drop trigger if exists trg_process_events_append_only on process_events;
create trigger trg_process_events_append_only
before update or delete on process_events
for each row execute function viralcine_forbid_mutation();

drop trigger if exists trg_incident_events_append_only on incident_events;
create trigger trg_incident_events_append_only
before update or delete on incident_events
for each row execute function viralcine_forbid_mutation();

drop trigger if exists trg_root_causes_append_only on root_causes;
create trigger trg_root_causes_append_only
before update or delete on root_causes
for each row execute function viralcine_forbid_mutation();

drop trigger if exists trg_repair_executions_append_only on repair_executions;
create trigger trg_repair_executions_append_only
before update or delete on repair_executions
for each row execute function viralcine_forbid_mutation();

drop trigger if exists trg_provider_observations_append_only on provider_observations;
create trigger trg_provider_observations_append_only
before update or delete on provider_observations
for each row execute function viralcine_forbid_mutation();

drop trigger if exists trg_model_observations_append_only on model_observations;
create trigger trg_model_observations_append_only
before update or delete on model_observations
for each row execute function viralcine_forbid_mutation();

drop trigger if exists trg_quality_measurements_append_only on quality_measurements;
create trigger trg_quality_measurements_append_only
before update or delete on quality_measurements
for each row execute function viralcine_forbid_mutation();

drop trigger if exists trg_decision_log_append_only on decision_log;
create trigger trg_decision_log_append_only
before update or delete on decision_log
for each row execute function viralcine_forbid_mutation();

drop trigger if exists trg_process_promotions_append_only on process_promotions;
create trigger trg_process_promotions_append_only
before update or delete on process_promotions
for each row execute function viralcine_forbid_mutation();

comment on table process_definitions is
'Stable process identities such as casting, voice lock, video preflight or master export.';
comment on table process_versions is
'Versioned process implementations. Promotion is explicit and preserves prior versions.';
comment on table process_events is
'Append-only timeline of what happened during every process run.';
comment on table incidents is
'Production incidents with error fingerprints, billing risk, evidence and resolution state.';
comment on table repair_recipe_versions is
'Versioned repair knowledge. Candidate recipes require repeated successful validation before promotion.';
comment on table lessons_learned is
'Reusable production knowledge distilled from incidents and successful repairs.';
comment on table process_promotions is
'Immutable evidence that a process, repair recipe or prompt was explicitly promoted after validation.';

commit;


-- ViralCine 7 Feature Film OS
-- Initial security hardening for server-first Supabase deployment.
-- Browser access remains closed until explicit Auth/RLS policies are added.

begin;

do $$
declare
  t text;
  tables text[] := array[
    'films','film_versions','acts','sequences','scenes','shots','takes',
    'characters','character_states','locations','location_states','props','prop_states',
    'wardrobe_sets','voice_profiles','assets','generation_jobs','continuity_events',
    'scene_state_snapshots','approvals','audit_events','timelines','timeline_versions',
    'asset_versions','exports','spend_ledger','rights_grants','film_memberships',
    'actor_library','film_library','relationship_states','narrative_states',
    'quality_reports','provider_health','provider_tasks','production_metrics',
    'master_audits','repair_plans','process_definitions','process_versions',
    'process_runs','process_step_runs','process_events','incidents','incident_events',
    'root_causes','repair_recipes','repair_recipe_versions','repair_executions',
    'prompt_templates','prompt_versions','provider_observations','model_observations',
    'quality_measurements','decision_log','lessons_learned','process_promotions'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- Immutable operational history.
drop trigger if exists trg_spend_ledger_append_only on spend_ledger;
create trigger trg_spend_ledger_append_only
before update or delete on spend_ledger
for each row execute function viralcine_forbid_mutation();

drop trigger if exists trg_continuity_events_append_only on continuity_events;
create trigger trg_continuity_events_append_only
before update or delete on continuity_events
for each row execute function viralcine_forbid_mutation();

drop trigger if exists trg_approvals_append_only on approvals;
create trigger trg_approvals_append_only
before update or delete on approvals
for each row execute function viralcine_forbid_mutation();

drop trigger if exists trg_audit_events_append_only on audit_events;
create trigger trg_audit_events_append_only
before update or delete on audit_events
for each row execute function viralcine_forbid_mutation();

drop trigger if exists trg_quality_reports_append_only on quality_reports;
create trigger trg_quality_reports_append_only
before update or delete on quality_reports
for each row execute function viralcine_forbid_mutation();

drop trigger if exists trg_master_audits_append_only on master_audits;
create trigger trg_master_audits_append_only
before update or delete on master_audits
for each row execute function viralcine_forbid_mutation();

comment on schema public is
'ViralCine V7 server-first schema. RLS is enabled and anon/authenticated have no table privileges until explicit user-facing policies are introduced.';

commit;


-- Verification report after bootstrap
select
  (select count(*) from information_schema.tables where table_schema='public') as public_table_count,
  (select count(*) from pg_tables where schemaname='public' and rowsecurity) as rls_enabled_count,
  to_regclass('public.films') is not null as films_ok,
  to_regclass('public.process_definitions') is not null as process_memory_ok,
  to_regclass('public.incidents') is not null as incidents_ok,
  to_regclass('public.repair_recipes') is not null as repairs_ok,
  to_regclass('public.lessons_learned') is not null as lessons_ok;

