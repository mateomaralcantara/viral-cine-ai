import type { FilmProject, FilmShot } from '@/lib/domain/schemas';
import { estimateOperationCost, reservedMovieSpend, voiceCostUnits } from '@/lib/engine/spend-ledger';

export function pilotModeEnabled() {
  return process.env.PILOT_MODE !== 'false';
}

export function pilotSceneLimit() {
  return clampInt(process.env.PILOT_MAX_SCENES, 1, 1, 3);
}

export function pilotShotLimit() {
  return clampInt(process.env.PILOT_MAX_SHOTS, 4, 1, 6);
}

export function pilotSpendLimit() {
  const value = Number(process.env.PILOT_MAX_SPEND_USD);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export async function assertPilotShotBudget(project: FilmProject, shot: FilmShot) {
  if (!pilotModeEnabled()) return;
  const current = await reservedMovieSpend(project.id);
  const visibleDialogue = Boolean(shot.spokenText.trim()) && Boolean(shot.speakerId) && shot.speakerId !== 'narrator';
  const additional =
    estimateOperationCost('voice', voiceCostUnits(shot.spokenText)) +
    estimateOperationCost('video', shot.durationSeconds) +
    (visibleDialogue ? estimateOperationCost('lip-sync', shot.durationSeconds) : 0) +
    estimateOperationCost('audit', 1);
  const limit = pilotSpendLimit();
  if (current + additional > limit + 0.0001) {
    throw new Error(
      `Piloto bloqueado por presupuesto: US$${current.toFixed(2)} reservados + US$${additional.toFixed(2)} estimados superarían el límite de US$${limit.toFixed(2)}.`
    );
  }
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}
