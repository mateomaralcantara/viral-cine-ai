import type { BudgetEstimate, FilmPlan, ProjectInput } from '@/lib/domain/schemas';

const envNumber = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

export function estimateBudget(input: ProjectInput, plan: FilmPlan): BudgetEstimate {
  const imageCost = envNumber('COST_IMAGE', 0.08);
  const legacyVideoCost = envNumber('COST_AI_VIDEO_8S', 1.23) / 8;
  const videoSecond = envNumber('COST_AI_VIDEO_SECOND', legacyVideoCost);
  const avatarSecond = envNumber('COST_AVATAR_SECOND', 0.3);
  const ttsPerThousand = envNumber('COST_TTS_1K_CHARS', 0.015);
  const qualityReview = envNumber('COST_QUALITY_REVIEW', 0.03);
  const strictQuality = process.env.PRODUCTION_MODE === 'real' && process.env.SCENE_QUALITY_MODE !== 'off';
  const maximumAttempts = strictQuality
    ? Math.max(1, Math.min(3, Math.round(envNumber('SCENE_QUALITY_MAX_ATTEMPTS', 1))))
    : 1;
  const shots = plan.scenes.flatMap((scene) => scene.shots);
  const videoSeconds = shots
    .filter((shot) => shot.mode === 'video')
    .reduce((sum, shot) => sum + shot.durationSeconds, 0);
  const avatarSeconds = shots
    .filter((shot) => shot.mode === 'avatar-video')
    .reduce((sum, shot) => sum + shot.durationSeconds, 0);

  const breakdown = {
    script: 1.5,
    images: round(shots.length * imageCost * maximumAttempts),
    voice: round((plan.scenes.reduce((sum, scene) => sum + scene.narration.length + scene.dialogue.length, 0) / 1000) * ttsPerThousand),
    video: round(videoSeconds * videoSecond * maximumAttempts),
    avatars: round(avatarSeconds * avatarSecond * maximumAttempts),
    music: input.generateMusic ? 4 : 0,
    quality: strictQuality ? round(shots.length * qualityReview * maximumAttempts) : 0
  };
  const estimatedUsd = round(Object.values(breakdown).reduce((sum, value) => sum + value, 0));
  const notes = [
    `El cálculo incluye ${shots.length} tomas de video reales; no usa galerías de imágenes como producto final.`,
    `Video general: ${videoSeconds}s. Avatar con sincronización labial: ${avatarSeconds}s.`,
    strictQuality
      ? `El estimado preventivo reserva hasta ${maximumAttempts} intentos por toma para imagen, video, avatar y revisión; la voz se reutiliza.`
      : 'La puerta de calidad estricta no está activa en este modo.',
    'El costo real depende del proveedor, regeneraciones, resolución y duración de los avatares.'
  ];
  if (estimatedUsd > input.budgetUsd) {
    notes.unshift('El plan supera el presupuesto objetivo. Reduce duración, usa un modelo de video económico o limita las tomas de avatar.');
  }

  return {
    targetUsd: input.budgetUsd,
    estimatedUsd,
    withinBudget: estimatedUsd <= input.budgetUsd,
    breakdown,
    notes
  };
}

const round = (value: number) => Math.round(value * 100) / 100;
