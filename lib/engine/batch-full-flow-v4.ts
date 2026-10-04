import type { FilmProject, FilmShot } from '@/lib/domain/schemas';

export type BatchSelectionOptions = {
  maxShots?: number;
  sceneOrder?: number;
  fromShotId?: string;
};

export type BatchQueueItem = {
  sceneOrder: number;
  shotOrder: number;
  shotId: string;
  title: string;
  kind: 'single' | 'segmented';
};

export function isFullFlow42Complete(shot: FilmShot) {
  return Boolean(
    shot.status === 'ready' &&
    shot.videoAsset &&
    shot.pipelineVersion?.startsWith('4.2-')
  );
}

export function buildBatchQueue(
  project: FilmProject,
  options: BatchSelectionOptions = {}
): BatchQueueItem[] {
  const rows: BatchQueueItem[] = [];
  let fromReached = !options.fromShotId;

  for (const scene of project.plan?.scenes || []) {
    if (options.sceneOrder && scene.order !== options.sceneOrder) continue;

    for (const shot of scene.shots) {
      if (!fromReached) {
        if (shot.id !== options.fromShotId) continue;
        fromReached = true;
      }

      if (isFullFlow42Complete(shot)) continue;

      rows.push({
        sceneOrder: scene.order,
        shotOrder: shot.order,
        shotId: shot.id,
        title: shot.title,
        kind: shot.dialogueLines.length > 1 ? 'segmented' : 'single'
      });

      if (options.maxShots && rows.length >= options.maxShots) {
        return rows;
      }
    }
  }

  if (options.fromShotId && !fromReached) {
    throw new Error('No existe --from-shot ' + options.fromShotId + ' en el alcance seleccionado.');
  }

  return rows;
}

export function canFitBatchBudget(
  spentOrReservedUsd: number,
  nextEstimatedUsd: number,
  maxUsd: number
) {
  return roundMoney(spentOrReservedUsd + nextEstimatedUsd) <= roundMoney(maxUsd);
}

export function roundMoney(value: number) {
  return Math.round(value * 10000) / 10000;
}
