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
