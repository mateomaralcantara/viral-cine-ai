import type { FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import {
  getCharacterBodyReference,
  getCharacterMasterReference,
  getIdentityLockStatus
} from '@/lib/engine/preflight-identity-check';
import { getPilotStateLockStatus } from '@/lib/engine/pilot-state-lock-v5';
import { getPilotRoutingLockStatus } from '@/lib/engine/pilot-routing-lock-v5';
import { estimatePilotShotSpend } from '@/lib/engine/pilot';
import {
  hasUsableCredential,
  safetyStatus
} from '@/lib/engine/production-safety';

export const PILOT_SHOT_ONE_ID = 'pilot-15d-01';

export type PilotShotOneCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type PilotShotOnePreflight = {
  shotId: string;
  shotTitle: string;
  sceneOrder: number;
  shotOrder: number;
  durationSeconds: number;
  estimatedUsd: number;
  hardCapUsd: number;
  ready: boolean;
  safetyReady: boolean;
  providerReady: boolean;
  checks: PilotShotOneCheck[];
  primaryProvider?: string;
  fallbackProvider?: string;
};

export function getPilotShotOne(
  project: FilmProject
): { scene: FilmScene; shot: FilmShot } {
  if (!project.plan) {
    throw new Error('El proyecto no tiene plan.');
  }

  for (const scene of project.plan.scenes) {
    const shot = scene.shots.find(
      (item) => item.id === PILOT_SHOT_ONE_ID
    );
    if (shot) return { scene, shot };
  }

  throw new Error('No se encontró la toma piloto 1 “La moneda”.');
}

export function getPilotShotOnePreflight(
  project: FilmProject
): PilotShotOnePreflight {
  const { scene, shot } = getPilotShotOne(project);
  const identity = getIdentityLockStatus(project);
  const state = getPilotStateLockStatus(project);
  const routing = getPilotRoutingLockStatus(project);
  const safety = safetyStatus();

  const elenaId = shot.characterIds[0];
  const face = elenaId
    ? getCharacterMasterReference(project, elenaId)
    : undefined;
  const body = elenaId
    ? getCharacterBodyReference(project, elenaId)
    : undefined;
  const stateId = elenaId
    ? shot.characterStateIds?.[elenaId]
    : undefined;
  const stateEntry = project.plan?.realMotion?.characterBible
    .find((entry) => entry.characterId === elenaId)
    ?.states.find((item) => item.id === stateId);

  const providers = shot.motionSpec?.preferredProviders || [];
  const primaryProvider = providers[0];
  const fallbackProvider = providers[1];

  const hasVideoCredential =
    (primaryProvider === 'veo' && hasUsableCredential('GEMINI_API_KEY')) ||
    (primaryProvider === 'fal-video' && hasUsableCredential('FAL_KEY')) ||
    (fallbackProvider === 'veo' && hasUsableCredential('GEMINI_API_KEY')) ||
    (fallbackProvider === 'fal-video' && hasUsableCredential('FAL_KEY'));

  const noPriorPaidAttempt =
    (shot.generationCount || 0) === 0 &&
    !['submitted', 'succeeded', 'failed-unknown'].includes(
      shot.lastGenerationState || ''
    );

  const checks: PilotShotOneCheck[] = [
    {
      id: 'identity',
      label: 'Identity Lock',
      passed: identity.ready,
      detail: identity.ready
        ? 'Face + Body 5/5 aprobados.'
        : `Identity Lock ${identity.approved}/${identity.required}.`
    },
    {
      id: 'state',
      label: 'State Lock',
      passed: state.ready && stateId === 'elena-b-street',
      detail:
        state.ready && stateEntry
          ? `Elena bloqueada en estado “${stateEntry.label}”.`
          : 'La toma 1 debe usar Elena · Calle.'
    },
    {
      id: 'routing',
      label: 'Routing Lock',
      passed:
        routing.ready &&
        primaryProvider === 'veo' &&
        fallbackProvider === 'fal-video',
      detail:
        primaryProvider && fallbackProvider
          ? `${primaryProvider} → ${fallbackProvider}`
          : 'Ruta de proveedor incompleta.'
    },
    {
      id: 'motion',
      label: 'Real Motion',
      passed:
        Boolean(shot.motionSpec) &&
        shot.motionSpec?.allowStillFallbackFinal === false &&
        (shot.motionSpec?.minIdentityScore || 0) >= 9 &&
        (shot.motionSpec?.minAnatomyScore || 0) >= 9,
      detail:
        'Movimiento real, identidad ≥9/10, anatomía ≥9/10, still FINAL prohibido.'
    },
    {
      id: 'references',
      label: 'Referencias visuales',
      passed: Boolean(face && body),
      detail:
        face && body
          ? 'FACE MASTER + BODY MASTER disponibles para Elena.'
          : 'Falta FACE MASTER o BODY MASTER de Elena.'
    },
    {
      id: 'openai',
      label: 'Referencia + auditoría',
      passed: hasUsableCredential('OPENAI_API_KEY'),
      detail: hasUsableCredential('OPENAI_API_KEY')
        ? 'OpenAI disponible para primer frame y auditoría.'
        : 'Falta OPENAI_API_KEY utilizable.'
    },
    {
      id: 'video-provider',
      label: 'Proveedor de video',
      passed: hasVideoCredential,
      detail: hasVideoCredential
        ? 'Existe credencial utilizable para Veo o Fal.'
        : 'Falta GEMINI_API_KEY o FAL_KEY utilizable.'
    },
    {
      id: 'paid-mode',
      label: 'Autorización pagada',
      passed: safety.paidGenerationEnabled,
      detail: safety.reason
    },
    {
      id: 'fresh-attempt',
      label: 'Gasto duplicado',
      passed: noPriorPaidAttempt,
      detail: noPriorPaidAttempt
        ? 'No existe un intento pagado previo para esta toma.'
        : 'Existe historial de generación; requiere reconciliación manual antes de otro cobro.'
    }
  ];

  const estimatedUsd = estimatePilotShotSpend(shot);
  const hardCapUsd = Math.min(
    10,
    Math.max(0.1, Math.ceil((estimatedUsd + 0.05) * 100) / 100)
  );

  const safetyReady = safety.paidGenerationEnabled;
  const providerReady =
    hasUsableCredential('OPENAI_API_KEY') && hasVideoCredential;
  const ready = checks.every((check) => check.passed);

  return {
    shotId: shot.id,
    shotTitle: shot.title,
    sceneOrder: scene.order,
    shotOrder: shot.order,
    durationSeconds: shot.durationSeconds,
    estimatedUsd,
    hardCapUsd,
    ready,
    safetyReady,
    providerReady,
    checks,
    primaryProvider,
    fallbackProvider
  };
}

export function armPilotShotOne(project: FilmProject) {
  const preflight = getPilotShotOnePreflight(project);

  if (!preflight.ready) {
    const failed = preflight.checks
      .filter((check) => !check.passed)
      .map((check) => `${check.label}: ${check.detail}`)
      .join(' | ');

    throw new Error(
      `TOMA 1 NO AUTORIZADA. ${failed}`
    );
  }

  project.pilot = {
    enabled: true,
    maxScenes: 1,
    maxShotsPerScene: 1,
    maxSpendUsd: preflight.hardCapUsd,
    approvedForFullProduction: false
  };

  project.productionLog = [
    ...project.productionLog,
    `${new Date().toISOString()} Piloto 5.0 armado: SOLO E1/T1 “La moneda”; tope preventivo US$${preflight.hardCapUsd.toFixed(2)}.`
  ];

  return preflight;
}
