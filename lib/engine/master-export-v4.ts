import type { FilmProject } from '@/lib/domain/schemas';

export type MasterExportRow = {
  sceneOrder: number;
  shotOrder: number;
  shotId: string;
  durationSeconds: number;
  videoAsset?: string;
  pipelineVersion?: string;
  status: string;
  degradedLipSync: boolean;
};

export type MasterExportPlan = {
  projectId: string;
  title: string;
  totalShots: number;
  readyShots: number;
  expectedDurationSeconds: number;
  degradedLipSyncShots: number;
  rows: MasterExportRow[];
  blockers: string[];
};

export function buildMasterExportPlan(project: FilmProject): MasterExportPlan {
  const rows: MasterExportRow[] = [];
  const blockers: string[] = [];

  for (const scene of project.plan?.scenes || []) {
    for (const shot of scene.shots) {
      const row: MasterExportRow = {
        sceneOrder: scene.order,
        shotOrder: shot.order,
        shotId: shot.id,
        durationSeconds: shot.durationSeconds,
        videoAsset: shot.videoAsset,
        pipelineVersion: shot.pipelineVersion,
        status: shot.status,
        degradedLipSync: String(shot.lastProvider || '').includes('local-lipsync-fallback')
      };
      rows.push(row);

      const label = 'E' + scene.order + '/T' + shot.order;
      if (shot.status !== 'ready') blockers.push(label + ': estado=' + shot.status + '.');
      if (!shot.videoAsset) blockers.push(label + ': falta videoAsset oficial.');
      if (!isApprovedMasterPipeline(shot.pipelineVersion)) {
        blockers.push(label + ': pipeline no aprobado para master (' + (shot.pipelineVersion || 'SIN PIPELINE') + ').');
      }
    }
  }

  rows.sort((a, b) => a.sceneOrder - b.sceneOrder || a.shotOrder - b.shotOrder);

  return {
    projectId: project.id,
    title: project.input.title,
    totalShots: rows.length,
    readyShots: rows.filter((row) =>
      row.status === 'ready' &&
      Boolean(row.videoAsset) &&
      isApprovedMasterPipeline(row.pipelineVersion)
    ).length,
    expectedDurationSeconds: round(rows.reduce((sum, row) => sum + row.durationSeconds, 0)),
    degradedLipSyncShots: rows.filter((row) => row.degradedLipSync).length,
    rows,
    blockers: [...new Set(blockers)]
  };
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}


function isApprovedMasterPipeline(version?: string) {
  return Boolean(
    version &&
    (
      version === '4.0-audio-first' ||
      version.startsWith('4.2-') ||
      version.startsWith('5.0-') ||
      version.startsWith('6.0-')
    )
  );
}
