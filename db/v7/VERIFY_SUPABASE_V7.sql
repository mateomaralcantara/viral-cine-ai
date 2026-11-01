-- ============================================================
-- VIRALCINE 7 — SUPABASE VERIFICATION + SMOKE TEST
-- SAFE:
--   * Does not call external APIs.
--   * Does not upload media.
--   * Temporary rows are rolled back at the end.
-- ============================================================

-- ------------------------------------------------------------
-- A. STATIC INTEGRITY CHECKS
-- ------------------------------------------------------------

with expected_tables(name) as (
  values
    ('films'),('film_versions'),('acts'),('sequences'),('scenes'),('shots'),('takes'),
    ('characters'),('character_states'),('locations'),('location_states'),('props'),('prop_states'),
    ('wardrobe_sets'),('voice_profiles'),('assets'),('generation_jobs'),('continuity_events'),
    ('scene_state_snapshots'),('approvals'),('audit_events'),('timelines'),('timeline_versions'),
    ('asset_versions'),('exports'),('spend_ledger'),('rights_grants'),('film_memberships'),
    ('actor_library'),('film_library'),('relationship_states'),('narrative_states'),
    ('quality_reports'),('provider_health'),('provider_tasks'),('production_metrics'),
    ('master_audits'),('repair_plans'),('process_definitions'),('process_versions'),
    ('process_runs'),('process_step_runs'),('process_events'),('incidents'),('incident_events'),
    ('root_causes'),('repair_recipes'),('repair_recipe_versions'),('repair_executions'),
    ('prompt_templates'),('prompt_versions'),('provider_observations'),('model_observations'),
    ('quality_measurements'),('decision_log'),('lessons_learned'),('process_promotions')
),
table_status as (
  select
    e.name,
    to_regclass('public.' || e.name) is not null as exists_ok,
    coalesce(c.relrowsecurity, false) as rls_ok
  from expected_tables e
  left join pg_class c
    on c.oid = to_regclass('public.' || e.name)
)
select
  'A1_EXPECTED_TABLES' as check_name,
  case when bool_and(exists_ok) then 'PASS' else 'FAIL' end as status,
  count(*) filter (where exists_ok)::text || '/' || count(*)::text || ' tables present' as detail
from table_status
union all
select
  'A2_RLS_ENABLED',
  case when bool_and(rls_ok) then 'PASS' else 'FAIL' end,
  count(*) filter (where rls_ok)::text || '/' || count(*)::text || ' tables with RLS'
from table_status
union all
select
  'A3_NO_ANON_TABLE_GRANTS',
  case when count(*) = 0 then 'PASS' else 'FAIL' end,
  count(*)::text || ' grants to anon'
from information_schema.role_table_grants
where grantee = 'anon'
  and table_schema = 'public'
  and table_name in (select name from expected_tables)
union all
select
  'A4_NO_AUTHENTICATED_TABLE_GRANTS',
  case when count(*) = 0 then 'PASS' else 'FAIL' end,
  count(*)::text || ' grants to authenticated'
from information_schema.role_table_grants
where grantee = 'authenticated'
  and table_schema = 'public'
  and table_name in (select name from expected_tables);

-- Missing tables, if any.
with expected_tables(name) as (
  values
    ('films'),('film_versions'),('acts'),('sequences'),('scenes'),('shots'),('takes'),
    ('characters'),('character_states'),('locations'),('location_states'),('props'),('prop_states'),
    ('wardrobe_sets'),('voice_profiles'),('assets'),('generation_jobs'),('continuity_events'),
    ('scene_state_snapshots'),('approvals'),('audit_events'),('timelines'),('timeline_versions'),
    ('asset_versions'),('exports'),('spend_ledger'),('rights_grants'),('film_memberships'),
    ('actor_library'),('film_library'),('relationship_states'),('narrative_states'),
    ('quality_reports'),('provider_health'),('provider_tasks'),('production_metrics'),
    ('master_audits'),('repair_plans'),('process_definitions'),('process_versions'),
    ('process_runs'),('process_step_runs'),('process_events'),('incidents'),('incident_events'),
    ('root_causes'),('repair_recipes'),('repair_recipe_versions'),('repair_executions'),
    ('prompt_templates'),('prompt_versions'),('provider_observations'),('model_observations'),
    ('quality_measurements'),('decision_log'),('lessons_learned'),('process_promotions')
)
select name as missing_table
from expected_tables
where to_regclass('public.' || name) is null
order by name;

-- ------------------------------------------------------------
-- B. STORAGE CHECKS
-- ------------------------------------------------------------

with expected_buckets(id) as (
  values
    ('character-references'),
    ('voice-vault'),
    ('film-assets'),
    ('masters'),
    ('qa-artifacts')
),
bucket_status as (
  select
    e.id,
    b.id is not null as exists_ok,
    coalesce(b.public, true) = false as private_ok
  from expected_buckets e
  left join storage.buckets b on b.id = e.id
)
select
  'B1_STORAGE_BUCKETS' as check_name,
  case when bool_and(exists_ok) then 'PASS' else 'FAIL' end as status,
  count(*) filter (where exists_ok)::text || '/' || count(*)::text || ' buckets present' as detail
from bucket_status
union all
select
  'B2_STORAGE_PRIVATE',
  case when bool_and(private_ok) then 'PASS' else 'FAIL' end,
  count(*) filter (where private_ok)::text || '/' || count(*)::text || ' buckets private'
from bucket_status;

select
  id,
  public,
  allowed_mime_types
from storage.buckets
where id in ('character-references','voice-vault','film-assets','masters','qa-artifacts')
order by id;

-- ------------------------------------------------------------
-- C. APPEND-ONLY TRIGGER CHECKS
-- ------------------------------------------------------------

with expected_triggers(table_name, trigger_name) as (
  values
    ('process_events','trg_process_events_append_only'),
    ('incident_events','trg_incident_events_append_only'),
    ('root_causes','trg_root_causes_append_only'),
    ('repair_executions','trg_repair_executions_append_only'),
    ('provider_observations','trg_provider_observations_append_only'),
    ('model_observations','trg_model_observations_append_only'),
    ('quality_measurements','trg_quality_measurements_append_only'),
    ('decision_log','trg_decision_log_append_only'),
    ('process_promotions','trg_process_promotions_append_only'),
    ('spend_ledger','trg_spend_ledger_append_only'),
    ('continuity_events','trg_continuity_events_append_only'),
    ('approvals','trg_approvals_append_only'),
    ('audit_events','trg_audit_events_append_only'),
    ('quality_reports','trg_quality_reports_append_only'),
    ('master_audits','trg_master_audits_append_only')
),
trigger_status as (
  select
    e.table_name,
    e.trigger_name,
    exists (
      select 1
      from pg_trigger t
      where t.tgrelid = to_regclass('public.' || e.table_name)
        and t.tgname = e.trigger_name
        and not t.tgisinternal
        and t.tgenabled <> 'D'
    ) as exists_ok
  from expected_triggers e
)
select
  'C1_APPEND_ONLY_TRIGGERS' as check_name,
  case when bool_and(exists_ok) then 'PASS' else 'FAIL' end as status,
  count(*) filter (where exists_ok)::text || '/' || count(*)::text || ' triggers active' as detail
from trigger_status;

-- ------------------------------------------------------------
-- D. TRANSACTIONAL SMOKE TEST
-- Everything below is temporary and ends with ROLLBACK.
-- ------------------------------------------------------------

begin;

insert into films (
  id, title, premise, duration_minutes, genre, language, aspect_ratio, budget_usd, metadata
) values (
  'smoke-film-v7',
  'ViralCine Supabase Smoke Test',
  'Temporary film created only to validate relational persistence and rollback.',
  5,
  'Drama',
  'es',
  '16:9',
  0,
  '{"smokeTest":true}'::jsonb
);

insert into film_versions (
  id, film_id, label, version_number, status, change_summary, created_by
) values (
  'smoke-film-version-v1',
  'smoke-film-v7',
  'Smoke v1',
  1,
  'draft',
  'Temporary verification version',
  'supabase-smoke-test'
);

insert into acts (
  id, film_id, position, title, dramatic_objective
) values (
  'smoke-act-1',
  'smoke-film-v7',
  1,
  'Acto 1',
  'Validate hierarchy'
);

insert into sequences (
  id, act_id, position, title, objective
) values (
  'smoke-sequence-1',
  'smoke-act-1',
  1,
  'Secuencia 1',
  'Validate sequence persistence'
);

insert into scenes (
  id, sequence_id, position, title, summary, duration_seconds
) values (
  'smoke-scene-1',
  'smoke-sequence-1',
  1,
  'Escena 1',
  'Temporary smoke scene',
  30
);

insert into shots (
  id, scene_id, position, title, duration_seconds, strategy
) values (
  'smoke-shot-1',
  'smoke-scene-1',
  1,
  'Shot 1',
  5,
  'generic-cinematic'
);

insert into takes (
  id, shot_id, version, status, estimated_cost_usd
) values (
  'smoke-take-1',
  'smoke-shot-1',
  1,
  'planned',
  0
);

insert into process_definitions (
  id, process_key, name, domain, description
) values (
  'smoke-process',
  'smoke.supabase.persistence',
  'Supabase persistence smoke test',
  'storage',
  'Temporary process definition used by verification'
);

insert into process_versions (
  id, process_id, version_number, status, implementation_ref, change_summary
) values (
  'smoke-process-v1',
  'smoke-process',
  1,
  'candidate',
  'verification-only',
  'Temporary version'
);

insert into process_runs (
  id, process_id, process_version_id, film_id, scene_id, shot_id, take_id,
  idempotency_key, status, input_snapshot, output_snapshot, estimated_cost_usd,
  started_at, completed_at
) values (
  'smoke-process-run-1',
  'smoke-process',
  'smoke-process-v1',
  'smoke-film-v7',
  'smoke-scene-1',
  'smoke-shot-1',
  'smoke-take-1',
  'smoke-run-key',
  'succeeded',
  '{"input":"ok"}'::jsonb,
  '{"output":"ok"}'::jsonb,
  0,
  now(),
  now()
);

insert into process_events (
  id, process_run_id, film_id, event_type, event_data, actor
) values (
  'smoke-process-event-1',
  'smoke-process-run-1',
  'smoke-film-v7',
  'completed',
  '{"result":"pass"}'::jsonb,
  'supabase-smoke-test'
);

insert into incidents (
  id, film_id, process_run_id, scene_id, shot_id, take_id,
  category, severity, title, description, billing_risk, status
) values (
  'smoke-incident-1',
  'smoke-film-v7',
  'smoke-process-run-1',
  'smoke-scene-1',
  'smoke-shot-1',
  'smoke-take-1',
  'verification',
  'low',
  'Synthetic verification incident',
  'Temporary incident to validate Process Memory relations.',
  'none',
  'resolved'
);

insert into root_causes (
  id, incident_id, category, cause, confidence, verified, verified_by
) values (
  'smoke-root-cause-1',
  'smoke-incident-1',
  'verification',
  'Synthetic cause for database smoke test.',
  1,
  true,
  'supabase-smoke-test'
);

insert into repair_recipes (
  id, recipe_key, name, domain, description
) values (
  'smoke-repair',
  'smoke.repair.database',
  'Smoke repair',
  'storage',
  'Temporary repair recipe'
);

insert into repair_recipe_versions (
  id, repair_recipe_id, version_number, status, repair_steps,
  minimum_successes, success_count, failure_count
) values (
  'smoke-repair-v1',
  'smoke-repair',
  1,
  'candidate',
  '[{"step":"verify"}]'::jsonb,
  3,
  1,
  0
);

insert into quality_measurements (
  id, film_id, process_run_id, target_type, target_id,
  metric_key, numeric_value, unit, passed, measured_by
) values (
  'smoke-quality-1',
  'smoke-film-v7',
  'smoke-process-run-1',
  'process-run',
  'smoke-process-run-1',
  'database_integrity',
  10,
  'score',
  true,
  'supabase-smoke-test'
);

insert into lessons_learned (
  id, domain, film_id, process_version_id, incident_id,
  title, lesson, evidence_count, confidence, status
) values (
  'smoke-lesson-1',
  'storage',
  'smoke-film-v7',
  'smoke-process-v1',
  'smoke-incident-1',
  'Supabase persistence works',
  'Synthetic lesson used only to validate Process Memory persistence.',
  1,
  1,
  'candidate'
);

select
  'D1_FILM_HIERARCHY_WRITE' as check_name,
  case when
    exists(select 1 from films where id='smoke-film-v7') and
    exists(select 1 from scenes where id='smoke-scene-1') and
    exists(select 1 from shots where id='smoke-shot-1') and
    exists(select 1 from takes where id='smoke-take-1')
  then 'PASS' else 'FAIL' end as status,
  'film -> scene -> shot -> take persisted inside test transaction' as detail
union all
select
  'D2_PROCESS_MEMORY_WRITE',
  case when
    exists(select 1 from process_runs where id='smoke-process-run-1') and
    exists(select 1 from incidents where id='smoke-incident-1') and
    exists(select 1 from root_causes where id='smoke-root-cause-1') and
    exists(select 1 from repair_recipe_versions where id='smoke-repair-v1') and
    exists(select 1 from lessons_learned where id='smoke-lesson-1')
  then 'PASS' else 'FAIL' end,
  'process -> incident -> root cause -> repair -> lesson persisted';

-- Verify append-only enforcement without leaving the transaction aborted.
do $$
declare
  protected_ok boolean := false;
begin
  begin
    update process_events
      set event_type = 'tamper-attempt'
    where id = 'smoke-process-event-1';
  exception
    when others then
      if position('append-only' in lower(sqlerrm)) > 0 then
        protected_ok := true;
      else
        raise;
      end if;
  end;

  if not protected_ok then
    raise exception 'APPEND_ONLY_TEST_FAILED: process_events accepted an UPDATE';
  end if;
end $$;

select
  'D3_APPEND_ONLY_RUNTIME' as check_name,
  'PASS' as status,
  'process_events rejected UPDATE as designed' as detail;

-- Constraint guard smoke test.
do $$
declare
  constraint_ok boolean := false;
begin
  begin
    insert into films (
      id, title, premise, duration_minutes, genre, language, aspect_ratio, budget_usd
    ) values (
      'smoke-invalid-film',
      'Invalid',
      '',
      5,
      'Drama',
      'es',
      '16:9',
      -1
    );
  exception
    when check_violation then
      constraint_ok := true;
  end;

  if not constraint_ok then
    raise exception 'CONSTRAINT_TEST_FAILED: negative budget was accepted';
  end if;
end $$;

select
  'D4_CONSTRAINT_RUNTIME' as check_name,
  'PASS' as status,
  'negative budget correctly rejected' as detail;

rollback;

-- ------------------------------------------------------------
-- E. ROLLBACK VERIFICATION
-- ------------------------------------------------------------

select
  'E1_ROLLBACK_CLEAN' as check_name,
  case when
    not exists(select 1 from films where id='smoke-film-v7') and
    not exists(select 1 from process_definitions where id='smoke-process') and
    not exists(select 1 from incidents where id='smoke-incident-1')
  then 'PASS' else 'FAIL' end as status,
  'temporary smoke-test data removed' as detail;

-- Final marker.
select
  'VIRALCINE_SUPABASE_VERIFICATION' as check_name,
  'PASS_IF_ALL_PREVIOUS_CHECKS_PASS' as status,
  now() as verified_at;
