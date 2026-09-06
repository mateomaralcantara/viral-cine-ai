import type { FilmProject, FilmShot } from '@/lib/domain/schemas';
import { classifyLegacyProjectShots } from '@/lib/engine/legacy-shot-classifier-v4';

const AMBIGUOUS_MIGRATION_ISSUE = 'Migración 4.0: hablante ambiguo. Asigna speakerId manualmente antes de producir este segmento.';

export type NarratorResolutionPreview = {
  projectId: string;
  title: string;
  eligibleShotIds: string[];
  eligibleCount: number;
  alreadyResolved: number;
  remainingNonNarratorSpoken: number;
};

export function previewSafeNarratorResolution(project: FilmProject, minimumConfidence = 0.99): NarratorResolutionPreview {
  const report = classifyLegacyProjectShots(project);
  const eligible = report.rows.filter((row) =>
    row.classification === 'narrator' &&
    row.suggestedSpeakerId === 'narrator' &&
    row.confidence >= minimumConfidence &&
    !row.currentSpeakerId
  );
  return {
    projectId: project.id,
    title: project.input.title,
    eligibleShotIds: eligible.map((row) => row.shotId),
    eligibleCount: eligible.length,
    alreadyResolved: report.rows.filter((row) => row.currentSpeakerId === 'narrator').length,
    remainingNonNarratorSpoken: report.rows.filter((row) =>
      row.spokenText.trim() && row.classification !== 'narrator' && !row.currentSpeakerId
    ).length
  };
}

export function applySafeNarratorResolution(project: FilmProject, minimumConfidence = 0.99) {
  if (!project.plan) throw new Error('El proyecto no tiene plan.');
  const preview = previewSafeNarratorResolution(project, minimumConfidence);
  const eligible = new Set(preview.eligibleShotIds);
  const mediaBefore = mediaReferenceSnapshot(project);
  let applied = 0;

  for (const scene of project.plan.scenes) {
    for (const shot of scene.shots) {
      if (!eligible.has(shot.id)) continue;
      assignNarrator(shot);
      applied += 1;
    }
  }

  const mediaAfter = mediaReferenceSnapshot(project);
  if (mediaBefore !== mediaAfter) {
    throw new Error('Protección de media: una referencia de asset cambió durante la resolución de narrador.');
  }

  project.productionLog.push(
    `${new Date().toISOString()} Reconciliación segura 4.0: ${applied} tomas de narración asignadas a narrator. ` +
    'No se modificó ni regeneró media; segmentos mixtos/personaje quedaron sin tocar.'
  );
  return { applied, preview };
}

function assignNarrator(shot: FilmShot) {
  shot.speakerId = 'narrator';
  if (!shot.dialogueLines?.length) {
    shot.dialogueLines = [{
      id: `narrator-${shot.id}`,
      speakerId: 'narrator',
      text: shot.spokenText,
      startSeconds: 0
    }];
  } else if (shot.dialogueLines.length === 1 && normalize(shot.dialogueLines[0].text) === normalize(shot.spokenText)) {
    shot.dialogueLines[0].speakerId = 'narrator';
  }
  shot.preflightIssues = (shot.preflightIssues || []).filter((issue) => issue !== AMBIGUOUS_MIGRATION_ISSUE);
  if (!shot.preflightIssues.length) shot.preflightIssues = undefined;
  shot.pipelineVersion = shot.pipelineVersion || '4.0-audio-first';
}

function mediaReferenceSnapshot(project: FilmProject) {
  return JSON.stringify((project.plan?.scenes || []).map((scene) => ({
    sceneId: scene.id,
    imageAsset: scene.imageAsset,
    voiceAsset: scene.voiceAsset,
    videoAsset: scene.videoAsset,
    qualityReportAsset: scene.qualityReportAsset,
    shots: scene.shots.map((shot) => ({
      id: shot.id,
      imageAsset: shot.imageAsset,
      voiceAsset: shot.voiceAsset,
      videoAsset: shot.videoAsset,
      baseVideoAsset: shot.baseVideoAsset,
      lipSyncAsset: shot.lipSyncAsset,
      alignmentAsset: shot.alignmentAsset
    }))
  })));
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}
