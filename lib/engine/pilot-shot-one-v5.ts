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

export const PILOT_SHOT_ONE_CORRECTION_V2 = {
  visualPrompt:
    'Amanecer urbano realista después de lluvia. Elena, exactamente la misma mujer del FACE MASTER y BODY MASTER, está ya agachada junto al bordillo mojado en estado Calle. Una sola moneda metálica es claramente visible en primer término, separada del fondo. Elena NO camina y NO tiene las manos en los bolsillos. Su mano derecha entra en cuadro, pinza la moneda entre pulgar e índice y la levanta; la moneda permanece visible durante la acción. Elena viste la chaqueta gris desgastada y ropa de calle definida en su estado, sin maquillaje glamuroso, sin pose de moda y sin embellecimiento. Mientras guarda la moneda en la palma, se incorpora lentamente con cansancio real. Mantener exactamente rostro, edad aparente, tono de piel, cabello y proporciones del Identity Lock.',
  camera:
    'Comenzar muy bajo con la moneda nítida en primer término y Elena agachada parcialmente visible detrás. Seguir la mano al recogerla y realizar un único tilt/dolly ascendente lento hasta un plano medio parcial de Elena al incorporarse. Sin cortes, sin travelling frontal, sin zoom artificial y sin cambiar de eje.',
  intention:
    'Hacer inequívoca la acción narrativa de encontrar y recoger la moneda, preservando exactamente la identidad de Elena.',
  startState:
    'Fotograma inicial: moneda grande y claramente legible junto al bordillo mojado; Elena ya está agachada detrás, rostro parcialmente visible en tres cuartos y coherente con FACE MASTER.',
  endState:
    'Elena queda medio incorporada con la moneda visible en la palma durante un instante antes de cerrar la mano; su identidad sigue siendo exactamente la referencia maestra.',
  bodyMotion:
    'Una sola acción física: mano derecha alcanza la moneda, pulgar e índice la pinzan, codo y hombro acompañan, Elena transfiere peso de piernas y torso y se incorpora lentamente. Prohibido caminar, meter ambas manos en bolsillos o hacer gestos de pasarela.',
  environmentMotion:
    'Gotas residuales y reflejos de tráfico distante muy sutiles; el entorno nunca compite con la moneda ni con la mano.',
  cameraMotion:
    'Seguimiento corto de la mano y ascenso vertical suave sincronizado con la incorporación de Elena; movimiento físico continuo y estable, sin cortes.'
} as const;

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

export function preparePilotShotOneRetry(
  project: FilmProject,
  maxSpendUsd: number
) {
  const { scene, shot } = getPilotShotOne(project);

  if (
    project.status !== 'quality-review' ||
    scene.status !== 'review-required' ||
    shot.status !== 'review-required'
  ) {
    throw new Error(
      'La Toma 1 solo puede preparar un segundo intento desde Revisión de calidad.'
    );
  }

  if ((shot.generationCount || 0) !== 1) {
    throw new Error(
      `Segundo intento bloqueado: la Toma 1 registra ${shot.generationCount || 0} generaciones. Se permite preparar exactamente un reintento controlado.`
    );
  }

  shot.visualPrompt = PILOT_SHOT_ONE_CORRECTION_V2.visualPrompt;
  shot.camera = PILOT_SHOT_ONE_CORRECTION_V2.camera;
  shot.qualityForceRegenerate = true;

  if (!shot.motionSpec) {
    throw new Error('La Toma 1 perdió su especificación Real Motion.');
  }

  shot.motionSpec = {
    ...shot.motionSpec,
    intention: PILOT_SHOT_ONE_CORRECTION_V2.intention,
    startState: PILOT_SHOT_ONE_CORRECTION_V2.startState,
    endState: PILOT_SHOT_ONE_CORRECTION_V2.endState,
    bodyMotion: PILOT_SHOT_ONE_CORRECTION_V2.bodyMotion,
    environmentMotion: PILOT_SHOT_ONE_CORRECTION_V2.environmentMotion,
    cameraMotion: PILOT_SHOT_ONE_CORRECTION_V2.cameraMotion,
    preferredProviders: ['veo', 'fal-video'],
    minMotionScore: 8,
    minIdentityScore: 9,
    minContinuityScore: 9,
    minAnatomyScore: 9,
    minCameraScore: 9,
    allowStillFallbackFinal: false
  };

  project.pilot = {
    enabled: true,
    maxScenes: 1,
    maxShotsPerScene: 1,
    maxSpendUsd,
    approvedForFullProduction: false
  };

  project.productionLog = [
    ...project.productionLog,
    `${new Date().toISOString()} Corrección V2 preparada para E1/T1 “La moneda”: identidad maestra reforzada, moneda visible, acción mano-moneda obligatoria y cámara baja→media; segundo intento aún NO ejecutado.`
  ];

  return { scene, shot };
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
