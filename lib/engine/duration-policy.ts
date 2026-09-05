import type { FilmPlan } from '@/lib/domain/schemas';

export const MIN_FILM_MINUTES = 5;
export const MAX_FILM_MINUTES = 120;
export const MIN_SCENES = 12;
export const MAX_SCENES = 120;
export const MIN_SCENE_SECONDS = 5;
export const MAX_SCENE_SECONDS = 90;

export function sceneCountForDuration(durationMinutes: number) {
  const targetSeconds = durationMinutes * 60;
  return Math.max(MIN_SCENES, Math.min(MAX_SCENES, Math.round(targetSeconds / 60)));
}

export function evenlyDistributedDurations(sceneCount: number, targetSeconds: number) {
  assertDurationCapacity(sceneCount, targetSeconds);
  const base = Math.floor(targetSeconds / sceneCount);
  const remainder = targetSeconds - base * sceneCount;
  return Array.from({ length: sceneCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function normalizeSceneDurations(plan: FilmPlan, targetSeconds: number): FilmPlan {
  assertDurationCapacity(plan.scenes.length, targetSeconds);
  const current = plan.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  if (current === targetSeconds) return plan;

  const factor = targetSeconds / Math.max(1, current);
  const scenes = plan.scenes.map((scene) => ({
    ...scene,
    durationSeconds: clamp(Math.round(scene.durationSeconds * factor), MIN_SCENE_SECONDS, MAX_SCENE_SECONDS)
  }));
  let difference = targetSeconds - scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);

  while (difference !== 0) {
    let changed = false;
    for (const scene of scenes) {
      if (difference > 0 && scene.durationSeconds < MAX_SCENE_SECONDS) {
        const addition = Math.min(difference, MAX_SCENE_SECONDS - scene.durationSeconds);
        scene.durationSeconds += addition;
        difference -= addition;
        changed = true;
      } else if (difference < 0 && scene.durationSeconds > MIN_SCENE_SECONDS) {
        const subtraction = Math.min(-difference, scene.durationSeconds - MIN_SCENE_SECONDS);
        scene.durationSeconds -= subtraction;
        difference += subtraction;
        changed = true;
      }
      if (difference === 0) break;
    }
    if (!changed) throw new Error('No fue posible ajustar las escenas a la duración solicitada.');
  }
  return { ...plan, scenes };
}

function assertDurationCapacity(sceneCount: number, targetSeconds: number) {
  if (!Number.isInteger(sceneCount) || sceneCount < MIN_SCENES || sceneCount > MAX_SCENES) {
    throw new Error(`El plan debe contener entre ${MIN_SCENES} y ${MAX_SCENES} escenas.`);
  }
  if (targetSeconds < sceneCount * MIN_SCENE_SECONDS || targetSeconds > sceneCount * MAX_SCENE_SECONDS) {
    throw new Error('La cantidad de escenas no puede cubrir la duración solicitada dentro de los límites permitidos.');
  }
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
