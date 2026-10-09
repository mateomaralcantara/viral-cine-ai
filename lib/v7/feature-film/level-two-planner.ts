/**
 * ViralCine V7 — Nivel 2: deterministic feature-film capacity blueprint.
 *
 * Planning ONLY. No scripts, narration, faces, voices or completed shots are
 * fabricated. Every proposed scene/shot remains blocked until its screenplay,
 * visual references and spending authorization are approved.
 */
export const FEATURE_LEVELS_MINUTES = [4, 15, 30, 60, 90] as const;
export type FeatureLevelMinutes = typeof FEATURE_LEVELS_MINUTES[number];

type FeatureAct = {
  number: number;
  title: string;
  dramaticPurpose: string;
  seconds: number;
  scenes: FeatureScene[];
};

export type FeatureScene = {
  id: string;
  act: number;
  sequence: number;
  title: string;
  seconds: number;
  shots: FeatureShot[];
  screenplayStatus: 'pending';
  continuityStatus: 'pending';
};

export type FeatureShot = {
  id: string;
  seconds: number;
  providerSeconds: 4 | 6 | 8;
  screenplayStatus: 'pending';
  identityReferenceStatus: 'pending';
  productionStatus: 'not-submitted';
};

export type FeaturePlan = {
  level: 2;
  targetMinutes: FeatureLevelMinutes;
  targetSeconds: number;
  totalScenes: number;
  totalShots: number;
  providerVideoSecondsEstimate: number;
  audioSecondsRequired: number;
  totalEstimatedVideoCostUsd: number | null;
  excludes: string[];
  status: 'structural-blueprint-not-approved-for-generation';
  gates: string[];
  acts: FeatureAct[];
};

function splitWholeSeconds(seconds: number, parts: number): number[] {
  if (!Number.isInteger(seconds) || !Number.isInteger(parts) || parts < 1 || seconds < parts) {
    throw new Error('Duración/segmentos inválidos');
  }
  const basic = Math.floor(seconds / parts);
  const remainder = seconds % parts;
  return Array.from({ length: parts }, (_, index) => basic + (index < remainder ? 1 : 0));
}

export function makeFeatureFilmPlan(args: {
  minutes: number;
  videoRateUsdPerSecond?: number | null;
}): FeaturePlan {
  if (!FEATURE_LEVELS_MINUTES.includes(args.minutes as FeatureLevelMinutes)) {
    throw new Error('Nivel no admitido: usa 4, 15, 30, 60 o 90 minutos.');
  }
  const minutes = args.minutes as FeatureLevelMinutes;
  const totalSeconds = minutes * 60;
  const rate = args.videoRateUsdPerSecond;
  if (rate != null && (!Number.isFinite(rate) || rate <= 0 || rate > 10)) {
    throw new Error('No se puede cotizar con una tarifa de video inválida.');
  }

  // 120s per scene is only a preliminary capacity assumption, not a script.
  const count = Math.max(3, Math.ceil(totalSeconds / 120));
  const secondsByAct = [totalSeconds / 4, totalSeconds / 2, totalSeconds / 4];
  // All supported levels are divisible by 4, so these remain exact integers.
  const sceneCounts = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    // Weighted allocation with an explicit scene in all three acts.
    if (i < 3) sceneCounts[i] = 1;
    else {
      const desired = [0.25, 0.5, 0.25];
      const next = desired
        .map((weight, act) => ({ act, deficit: weight * (i + 1) - sceneCounts[act] }))
        .sort((a, b) => b.deficit - a.deficit || a.act - b.act)[0];
      sceneCounts[next.act]++;
    }
  }

  const actTitles = [
    ['Presentación', 'Presentar universo, objetivo dramático y conflicto'],
    ['Confrontación', 'Construir obstáculos, decisiones y transformación'],
    ['Resolución', 'Resolver el conflicto y sus consecuencias']
  ] as const;

  let shotCounter = 0;
  const acts: FeatureAct[] = actTitles.map(([title, dramaticPurpose], index) => {
    const sceneDurations = splitWholeSeconds(secondsByAct[index], sceneCounts[index]);
    const scenes: FeatureScene[] = sceneDurations.map((seconds, sceneIndex) => {
      const shotCount = Math.ceil(seconds / 8);
      const durations = splitWholeSeconds(seconds, shotCount);
      const shots: FeatureShot[] = durations.map((shotSeconds) => {
        shotCounter++;
        return {
          id: 'P' + String(shotCounter).padStart(4, '0'),
          seconds: shotSeconds,
          providerSeconds: shotSeconds <= 4 ? 4 : shotSeconds <= 6 ? 6 : 8,
          screenplayStatus: 'pending',
          identityReferenceStatus: 'pending',
          productionStatus: 'not-submitted'
        };
      });
      return {
        id: 'A' + (index + 1) + '-S' + String(sceneIndex + 1).padStart(3, '0'),
        act: index + 1,
        sequence: sceneIndex + 1,
        title: 'Escena pendiente de guion ' + (sceneIndex + 1),
        seconds,
        shots,
        screenplayStatus: 'pending',
        continuityStatus: 'pending'
      };
    });
    return { number: index + 1, title, dramaticPurpose, seconds: secondsByAct[index], scenes };
  });

  const allScenes = acts.flatMap((act) => act.scenes);
  const allShots = allScenes.flatMap((scene) => scene.shots);
  const providerVideoSecondsEstimate = allShots.reduce((sum, shot) => sum + shot.providerSeconds, 0);

  if (allScenes.length > 200 || allShots.length > 2000 ||
      allShots.reduce((sum, shot) => sum + shot.seconds, 0) !== totalSeconds) {
    throw new Error('Plan fuera de límites de ViralCine V7.');
  }

  return {
    level: 2, targetMinutes: minutes, targetSeconds: totalSeconds,
    totalScenes: allScenes.length, totalShots: allShots.length,
    providerVideoSecondsEstimate, audioSecondsRequired: totalSeconds,
    totalEstimatedVideoCostUsd: rate == null ? null
      : Math.round(providerVideoSecondsEstimate * rate * 10000) / 10000,
    excludes: [
      'La cotización cubre solo segundos de video teóricos, no garantiza gasto real.',
      'No incluye voz, música, imágenes, QA, ediciones ni reintentos.',
      'No supone que existan guion, personajes, referencias ni clips aprobados.'
    ],
    status: 'structural-blueprint-not-approved-for-generation',
    gates: [
      'Aprobar guion original de todas las escenas.',
      'Registrar identidad, vestuario y continuidad de personajes.',
      'Registrar referencias visuales y voces con derechos autorizados.',
      'Verificar tarifas y saldo real; aprobar presupuesto por bloque.',
      'Generar una toma por operación; registrar ID de proveedor antes de cualquier recuperación.',
      'Aprobar QA, montaje y master por etapas.'
    ],
    acts
  };
}
