import type { FilmProject, FilmShot } from '@/lib/domain/schemas';
import { estimatedGenerationCost } from '@/lib/engine/spend-guard';
import {
  estimateOperationCost,
  reservedMovieSpend,
  voiceCostUnits
} from '@/lib/engine/spend-ledger';

export function pilotModeEnabled(project?: FilmProject) {
  if (project?.pilot) return project.pilot.enabled;
  return process.env.PILOT_MODE !== 'false';
}

export function pilotSceneLimit(project?: FilmProject) {
  if (project?.pilot?.enabled) return project.pilot.maxScenes;
  return clampInt(process.env.PILOT_MAX_SCENES, 1, 1, 3);
}

export function pilotShotLimit(project?: FilmProject) {
  if (project?.pilot?.enabled) return project.pilot.maxShotsPerScene;
  return clampInt(process.env.PILOT_MAX_SHOTS, 4, 1, 6);
}

export function pilotSpendLimit(project?: FilmProject) {
  if (project?.pilot?.enabled) return project.pilot.maxSpendUsd;
  const value = Number(process.env.PILOT_MAX_SPEND_USD);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function estimatePilotShotSpend(shot: FilmShot) {
  const visibleDialogue =
    Boolean(shot.spokenText.trim()) &&
    Boolean(shot.speakerId) &&
    shot.speakerId !== 'narrator';

  const image = estimateOperationCost('image', 1);
  const voice = shot.spokenText.trim()
    ? estimateOperationCost('voice', voiceCostUnits(shot.spokenText))
    : 0;
  const video = estimatedGenerationCost(shot);
  const lipSync = visibleDialogue
    ? estimateOperationCost('lip-sync', shot.durationSeconds)
    : 0;
  const audit = estimateOperationCost('audit', 1);

  return round(image + voice + video + lipSync + audit);
}

export async function assertPilotShotBudget(
  project: FilmProject,
  shot: FilmShot
) {
  if (!pilotModeEnabled(project)) return;

  const current = await reservedMovieSpend(project.id);
  const additional = estimatePilotShotSpend(shot);
  const limit = pilotSpendLimit(project);

  if (current + additional > limit + 0.0001) {
    throw new Error(
      `Piloto bloqueado por presupuesto: US$${current.toFixed(2)} reservados + US$${additional.toFixed(2)} estimados superarían el límite de US$${limit.toFixed(2)}.`
    );
  }
}

function clampInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

const round = (value: number) => Math.round(value * 100) / 100;
