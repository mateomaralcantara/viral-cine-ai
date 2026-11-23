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
