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
