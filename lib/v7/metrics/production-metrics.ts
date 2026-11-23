import type { FilmV7 } from '@/lib/v7/domain/film';

export type ProductionMetrics = {
  scenes: number;
  shots: number;
  takes: number;
  approvedTakes: number;
  finishedMinutes: number;
  actualSpendUsd: number;
  costPerFinishedMinuteUsd: number;
  approvalRate: number;
};

export function calculateProductionMetrics(film: FilmV7): ProductionMetrics {
  const scenes = film.acts.flatMap((act) => act.sequences.flatMap((sequence) => sequence.scenes));
  const shots = scenes.flatMap((scene) => scene.shots);
  const takes = shots.flatMap((shot) => shot.takes);
  const approvedTakes = takes.filter((take) => take.status === 'approved');
  const finishedSeconds = shots.reduce((sum, shot) => {
    const take = shot.takes.find((candidate) => candidate.id === shot.selectedTakeId);
    return sum + (take ? shot.durationSeconds : 0);
  }, 0);
  const actualSpendUsd = Math.round(
    takes.reduce((sum, take) => sum + (take.actualCostUsd || 0), 0) * 10000
  ) / 10000;
  const finishedMinutes = finishedSeconds / 60;
  return {
    scenes: scenes.length,
    shots: shots.length,
    takes: takes.length,
    approvedTakes: approvedTakes.length,
    finishedMinutes,
    actualSpendUsd,
    costPerFinishedMinuteUsd: finishedMinutes > 0
      ? Math.round(actualSpendUsd / finishedMinutes * 10000) / 10000
      : 0,
    approvalRate: takes.length ? approvedTakes.length / takes.length : 0
  };
}
