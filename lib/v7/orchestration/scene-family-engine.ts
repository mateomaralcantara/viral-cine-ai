import type { FilmV7 } from '@/lib/v7/domain/film';

/** V7 Scene Family Engine: planning only. No provider credentials, SDK, billable side effects. */
export const SCENE_AGENT_FAMILIES = Object.freeze([
  { id: 'director', label: 'Dirección y coordinación', agents: ['showrunner', 'scheduler', 'dependency-supervisor'] },
  { id: 'story', label: 'Guion y dramaturgia', agents: ['story-editor', 'screenwriter', 'dialogue-auditor'] },
  { id: 'casting', label: 'Casting e identidad', agents: ['character-casting', 'face-consistency', 'consent-rights'] },
  { id: 'continuity', label: 'Memoria y continuidad', agents: ['continuity-librarian', 'wardrobe-prop-auditor', 'scene-state'] },
  { id: 'photography', label: 'Cámara e imagen', agents: ['shot-designer', 'lighting', 'reference-composer'] },
  { id: 'voice', label: 'Voces y sonido', agents: ['voice-dna', 'speaker-matcher', 'sound-designer', 'lip-sync-checker'] },
  { id: 'production', label: 'Render por bloques', agents: ['provider-router', 'one-shot-submitter', 'provider-resumer'] },
  { id: 'quality', label: 'QA independiente', agents: ['technical-qc', 'identity-qc', 'physics-qc', 'audio-qc', 'continuity-qc', 'narrative-qc'] },
  { id: 'repair', label: 'Diagnóstico y autocorrección', agents: ['root-cause', 'local-repair', 'recheck', 'human-escalation'] },
  { id: 'editing', label: 'Montaje y posproducción', agents: ['timeline-editor', 'audio-mixer', 'scene-exporter'] },
  { id: 'approval', label: 'Aprobación humana', agents: ['shot-approval-guard', 'scene-approval-guard', 'audit-writer'] },
  { id: 'finance', label: 'Presupuesto y trazabilidad', agents: ['cost-keeper', 'spend-ledger', 'idempotency-guard'] }
] as const);

export type SceneFamilyId = typeof SCENE_AGENT_FAMILIES[number]['id'];
export type SceneStep = {
  id: string;
  filmId: string;
  sceneId: string;
  shotId?: string;
  family: SceneFamilyId;
  action: string;
  dependsOn: string[];
  externalSpendAllowed: false;
  paidRetryAllowed: false;
};

/**
 * Shot and scene tasks are generated from the actual Film→Act→Sequence→Scene→Shot tree.
 * All scenes appear in the same film-wide plan; each scene is an independent
 * resumable unit, not a bespoke E01-P01/E01-P02 API.
 */
export function planCompleteFilmScenes(film: FilmV7) {
  const steps: SceneStep[] = [];
  const scenes: Array<{ sceneId: string; name: string; shotIds: string[]; plannedSteps: number }> = [];
  let priorSceneContinuity: string | undefined;
  for (const act of film.acts) {
    for (const sequence of act.sequences) {
      for (const scene of sequence.scenes) {
        const prefix = film.id + '/' + scene.id;
        const push = (family: SceneFamilyId, action: string, dependencies: string[], shotId?: string) => {
          const id = prefix + '/' + (shotId ?? 'scene') + '/' + action;
          steps.push({ id, filmId: film.id, sceneId: scene.id, shotId, family, action,
            dependsOn: dependencies, externalSpendAllowed: false, paidRetryAllowed: false });
          return id;
        };
        const story = push('story', 'script.check', []);
        const casting = push('casting', 'identities.resolve', [story]);
        const continuity = push('continuity', 'continuity.lock',
          [...(priorSceneContinuity ? [priorSceneContinuity] : []), casting]);
        const shotQa: string[] = [];
        for (const shot of scene.shots) {
          const planning = push('photography', 'shot.plan', [continuity], shot.id);
          const voice = push('voice', 'audio.plan', [planning], shot.id);
          const quote = push('finance', 'cost.preflight', [planning, voice], shot.id);
          const existing = push('production', 'asset.reconcile', [quote], shot.id);
          // If a paid asset is missing, provider dispatch is a HOLD requiring
          // a separate, authenticated, explicit economic grant.
          const gate = push('production', 'provider.permission-gate', [existing], shot.id);
          const qa = push('quality', 'qa.shot', [gate], shot.id);
          const repair = push('repair', 'diagnose-and-recheck', [qa], shot.id);
          const approval = push('approval', 'shot.human-approval', [repair], shot.id);
          shotQa.push(approval);
        }
        const assembly = push('editing', 'scene.assemble', shotQa.length ? shotQa : [continuity]);
        const sceneQa = push('quality', 'qa.scene', [assembly]);
        const sceneApproval = push('approval', 'scene.human-approval', [sceneQa]);
        priorSceneContinuity = push('continuity', 'scene.snapshot', [sceneApproval]);
        push('editing', 'scene.archive', [priorSceneContinuity]);
        scenes.push({ sceneId: scene.id, name: scene.title, shotIds: scene.shots.map(x => x.id),
          plannedSteps: steps.filter(x => x.sceneId === scene.id).length });
      }
    }
  }
  // Validate all dependencies locally, before any operation could be dispatched.
  const ids = new Set(steps.map(x => x.id));
  if (ids.size !== steps.length || steps.some(x => x.dependsOn.some(dep => !ids.has(dep)))) {
    throw new Error('Scene Family Engine: grafo duplicado o dependencia inexistente.');
  }
  return { filmId: film.id, scenes, steps, familyCount: SCENE_AGENT_FAMILIES.length,
    providerCalls: 0, estimatedAdditionalSpendUsd: 0 };
}

export type RepairFailure = 'local-transient' | 'local-deterministic' |
  'provider-pending' | 'provider-uncertain' | 'paid-regeneration-needed' | 'quality-critical';
export type RepairAction = 'recheck-free' | 'repair-free' | 'resume-existing-operation' | 'hold-human';
/**
 * Self-healing is bounded: no silent infinite loops; never resubmit a provider
 * operation. Paid repair always needs new explicit authority.
 */
export function chooseSelfHealingAction(input: {
  failure: RepairFailure;
  freeAttempts: number;
  maxFreeAttempts?: number;
  hasProviderOperationId?: boolean;
}): { action: RepairAction; reason: string; consumesSpendUsd: 0 } {
  const max = input.maxFreeAttempts ?? 3;
  if (!Number.isInteger(input.freeAttempts) || input.freeAttempts < 0 ||
      !Number.isInteger(max) || max < 0 || max > 10) {
    throw new Error('Política de autocorrección inválida.');
  }
  if (input.failure === 'provider-pending' && input.hasProviderOperationId) {
    return { action: 'resume-existing-operation', reason: 'Consultar el ID existente, sin reenviar.', consumesSpendUsd: 0 };
  }
  if (input.failure === 'provider-pending' || input.failure === 'provider-uncertain' ||
      input.failure === 'paid-regeneration-needed' || input.failure === 'quality-critical') {
    return { action: 'hold-human', reason: 'Requiere reconciliación, decisión humana o presupuesto nuevo.', consumesSpendUsd: 0 };
  }
  if (input.freeAttempts >= max) return { action: 'hold-human',
    reason: 'Agotado el límite de correcciones locales; escalar con diagnóstico.', consumesSpendUsd: 0 };
  return { action: input.failure === 'local-deterministic' ? 'repair-free' : 'recheck-free',
    reason: 'Corrección o nueva verificación local sin servicios pagados.', consumesSpendUsd: 0 };
}

/**
 * The repair family actually loops: inspect -> diagnose -> repair -> verify.
 * Only callers explicitly marked free/local may provide these callbacks. The
 * supervisor never handles provider clients or money. When exhausted it halts.
 */
export async function runFreeRepairLoop(input: {
  inspect: () => Promise<{ passed:boolean; failure?:RepairFailure; details?:string }>;
  repair: (failure:RepairFailure, attempt:number) => Promise<void>;
  maxFreeAttempts?:number;
  hasProviderOperationId?:boolean;
}):Promise<{status:'passed'|'blocked';attempts:number;history:string[];action?:RepairAction}>{
  const history:string[]=[];
  const maximum=input.maxFreeAttempts??3;
  if(!Number.isInteger(maximum)||maximum<0||maximum>10)throw new Error('Máximo de correcciones inválido.');
  for(let attempt=0;attempt<=maximum;attempt++){
    const result=await input.inspect();
    history.push('QA '+(attempt+1)+': '+(result.passed?'PASS':result.failure??'unclassified'));
    if(result.passed)return {status:'passed',attempts:attempt,history};
    const action=chooseSelfHealingAction({failure:result.failure??'quality-critical',
      freeAttempts:attempt,maxFreeAttempts:maximum,hasProviderOperationId:input.hasProviderOperationId});
    history.push(action.action+': '+action.reason);
    if(action.action==='hold-human'||action.action==='resume-existing-operation'){
      return {status:'blocked',attempts:attempt,history,action:action.action};
    }
    await input.repair(result.failure??'quality-critical',attempt+1);
  }
  return {status:'blocked',attempts:maximum,history,action:'hold-human'};
}
