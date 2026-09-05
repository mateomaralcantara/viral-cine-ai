import type { FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import { ProductionSafetyError } from '@/lib/engine/production-safety';

export type GenerationReservation = {
  generationNumber: number;
  reservedUsd: number;
  movieReservedUsd: number;
};

export function reserveShotGeneration(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot
): GenerationReservation {
  assertShotGenerationAllowed(project, scene, shot);

  const reservedUsd = estimatedGenerationCost(shot, scene);
  shot.generationCount = (shot.generationCount || 0) + 1;
  shot.estimatedSpendUsd = round((shot.estimatedSpendUsd || 0) + reservedUsd);
  shot.lastGenerationAt = new Date().toISOString();

  return {
    generationNumber: shot.generationCount,
    reservedUsd,
    movieReservedUsd: round(totalReservedSpend(project))
  };
}

export function assertShotGenerationAllowed(project: FilmProject, scene: FilmScene, shot: FilmShot) {
  const maximumGenerations = integerEnv('SHOT_MAX_TOTAL_GENERATIONS', 1, 1, 10);
  const generationCount = shot.generationCount || 0;
  if (generationCount >= maximumGenerations) {
    throw new ProductionSafetyError(
      `Bloqueo de gasto: la escena ${scene.order}, plano ${shot.order} ya uso ${generationCount} ` +
      `de ${maximumGenerations} generaciones permitidas. Revisa el material o aumenta SHOT_MAX_TOTAL_GENERATIONS conscientemente.`
    );
  }

  const nextCost = estimatedGenerationCost(shot, scene);
  const shotLimit = numberEnv('MAX_SHOT_SPEND_USD', 5, 0.1, 1_000);
  const shotSpend = shot.estimatedSpendUsd || 0;
  if (shotSpend + nextCost > shotLimit + 0.001) {
    throw new ProductionSafetyError(
      `Bloqueo de gasto: el siguiente intento llevaria la escena ${scene.order}, plano ${shot.order} ` +
      `a US$${round(shotSpend + nextCost).toFixed(2)}; el limite por plano es US$${shotLimit.toFixed(2)}.`
    );
  }

  const configuredMovieLimit = numberEnv('MAX_MOVIE_SPEND_USD', project.input.budgetUsd, 1, 100_000);
  const movieLimit = Math.min(configuredMovieLimit, project.input.budgetUsd);
  const movieSpend = totalReservedSpend(project);
  if (movieSpend + nextCost > movieLimit + 0.001) {
    throw new ProductionSafetyError(
      `Bloqueo de gasto: el siguiente intento llevaria la pelicula a US$${round(movieSpend + nextCost).toFixed(2)}; ` +
      `el limite activo es US$${movieLimit.toFixed(2)}.`
    );
  }
}

export function assertEstimatedBudgetAllowed(project: FilmProject) {
  if (process.env.PRODUCTION_MODE !== 'real' || !project.budget) return;
  const configuredMovieLimit = numberEnv('MAX_MOVIE_SPEND_USD', project.input.budgetUsd, 1, 100_000);
  const movieLimit = Math.min(configuredMovieLimit, project.input.budgetUsd);
  if (!project.budget.withinBudget || project.budget.estimatedUsd > movieLimit + 0.001) {
    throw new ProductionSafetyError(
      `Bloqueo de presupuesto: el plan estima US$${project.budget.estimatedUsd.toFixed(2)} y el limite activo es US$${movieLimit.toFixed(2)}. ` +
      'Reduce tomas o costos antes de autorizar producción real.'
    );
  }
}

export function totalReservedSpend(project: FilmProject) {
  return project.plan?.scenes.reduce(
    (movieTotal, scene) => movieTotal + scene.shots.reduce(
      (sceneTotal, shot) => sceneTotal + (shot.estimatedSpendUsd || 0),
      0
    ),
    0
  ) || 0;
}

export function estimatedGenerationCost(shot: FilmShot, scene?: FilmScene) {
  const blocks = Math.max(1, Math.ceil(shot.durationSeconds / 8));
  const generalVideo = numberEnv('COST_AI_VIDEO_8S', 1.23, 0, 1_000) * blocks;
  if (shot.mode !== 'avatar-video' || !likelyAvatarFallback(scene, shot)) return round(generalVideo);

  const avatar = numberEnv('COST_AVATAR_SECOND', 0.30, 0, 1_000) * shot.durationSeconds;
  return round(Math.max(generalVideo, avatar));
}

function likelyAvatarFallback(scene: FilmScene | undefined, shot: FilmShot) {
  if (!scene) return true;
  if (process.env.FAL_AVATAR_ONLY_SINGLE_SUBJECT === 'false') return true;
  const activeCharacterIds = shot.characterIds.length ? shot.characterIds : scene.characterIds;
  if (activeCharacterIds.length !== 1) return false;
  const description = `${shot.title} ${shot.visualPrompt} ${shot.camera}`;
  return /(primer plano|plano medio|close.?up|medium close|portrait|bust|head.?and.?shoulders)/i.test(description);
}

function integerEnv(name: string, fallback: number, minimum: number, maximum: number) {
  return Math.round(numberEnv(name, fallback, minimum, maximum));
}

function numberEnv(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, value));
}

const round = (value: number) => Math.round(value * 100) / 100;
