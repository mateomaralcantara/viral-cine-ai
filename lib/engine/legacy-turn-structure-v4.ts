import type { DialogueLine, FilmProject, FilmShot } from '@/lib/domain/schemas';
import { buildLegacyMixedTurnPlan } from '@/lib/engine/legacy-mixed-turns-v4';

const AMBIGUOUS_MIGRATION_ISSUE = 'Migración 4.0: hablante ambiguo. Asigna speakerId manualmente antes de producir este segmento.';
const STRUCTURED_MULTI_ISSUE = 'ViralCine 4.0: toma multihablante estructurada; requiere render por subsegmentos antes de producción real.';

export type TurnStructurePreview = {
  projectId: string;
  title: string;
  mixedShots: number;
  turns: number;
  readyShots: number;
  blockedShots: number;
  alreadyStructured: number;
  mediaBackedShots: number;
  rows: Array<{
    sceneOrder: number;
    shotOrder: number;
    shotId: string;
    turns: number;
    ready: boolean;
    alreadyStructured: boolean;
    existingMedia: boolean;
  }>;
};

export function previewLegacyTurnStructure(project: FilmProject): TurnStructurePreview {
  const plan = buildLegacyMixedTurnPlan(project);
  const rows = plan.rows.map((row) => {
    const shot = findShot(project, row.shotId);
    const desired = desiredDialogueLines(row.shotId, row.turns);
    const ready = row.unresolvedTurns === 0 && row.turns.length > 1 && row.turns.every((turn) => Boolean(turn.speakerId));
    return {
      sceneOrder: row.sceneOrder,
      shotOrder: row.shotOrder,
      shotId: row.shotId,
      turns: row.turns.length,
      ready,
      alreadyStructured: Boolean(shot && sameDialogueLines(shot.dialogueLines || [], desired)),
      existingMedia: Boolean(row.originalMedia.length)
    };
  });
  return {
    projectId: project.id,
    title: project.input.title,
    mixedShots: rows.length,
    turns: plan.totals.plannedTurns,
    readyShots: rows.filter((row) => row.ready).length,
    blockedShots: rows.filter((row) => !row.ready).length,
    alreadyStructured: rows.filter((row) => row.alreadyStructured).length,
    mediaBackedShots: rows.filter((row) => row.existingMedia).length,
    rows
  };
}

export function applyLegacyTurnStructure(project: FilmProject) {
  if (!project.plan) throw new Error('El proyecto no tiene plan.');
  const plan = buildLegacyMixedTurnPlan(project);
  const blocked = plan.rows.filter((row) =>
    row.unresolvedTurns > 0 || row.turns.length < 2 || row.turns.some((turn) => !turn.speakerId)
  );
  if (blocked.length) {
    throw new Error(`No se puede estructurar: ${blocked.length} toma(s) contienen turnos sin speakerId o no son realmente multihablante.`);
  }

  const mediaBefore = mediaReferenceSnapshot(project);
  let applied = 0;
  for (const row of plan.rows) {
    const shot = findShot(project, row.shotId);
    if (!shot) throw new Error(`No existe la toma '${row.shotId}'.`);
    const desired = desiredDialogueLines(row.shotId, row.turns);
    if (sameDialogueLines(shot.dialogueLines || [], desired)) continue;

    shot.speakerId = undefined;
    shot.dialogueLines = desired;
    shot.preflightIssues = unique([
      ...(shot.preflightIssues || []).filter((issue) => issue !== AMBIGUOUS_MIGRATION_ISSUE && issue !== STRUCTURED_MULTI_ISSUE),
      STRUCTURED_MULTI_ISSUE
    ]);
    shot.pipelineVersion = shot.pipelineVersion || '4.0-audio-first';
    applied += 1;
  }

  const mediaAfter = mediaReferenceSnapshot(project);
  if (mediaBefore !== mediaAfter) {
    throw new Error('Protección de media: estructurar turnos cambió una referencia de asset.');
  }

  project.productionLog.push(
    `${new Date().toISOString()} ViralCine 4.0: ${applied} toma(s) multihablante estructurada(s) en subsegmentos temporales. ` +
    `${plan.totals.plannedTurns} turnos identificados. Media histórica preservada; no se generó ni cortó ningún archivo.`
  );
  return { applied, preview: previewLegacyTurnStructure(project) };
}

function desiredDialogueLines(
  shotId: string,
  turns: Array<{ speakerId?: string; text: string; estimatedStartSeconds: number; estimatedEndSeconds: number }>
): DialogueLine[] {
  return turns.map((turn, index) => ({
    id: `${shotId}-turn-${String(index + 1).padStart(2, '0')}`,
    speakerId: turn.speakerId || '',
    text: turn.text,
    startSeconds: turn.estimatedStartSeconds,
    endSeconds: turn.estimatedEndSeconds
  }));
}

function sameDialogueLines(left: DialogueLine[], right: DialogueLine[]) {
  if (left.length !== right.length) return false;
  return left.every((line, index) => {
    const other = right[index];
    return Boolean(other) &&
      line.id === other.id &&
      line.speakerId === other.speakerId &&
      normalize(line.text) === normalize(other.text) &&
      line.startSeconds === other.startSeconds &&
      line.endSeconds === other.endSeconds;
  });
}

function findShot(project: FilmProject, shotId: string): FilmShot | undefined {
  for (const scene of project.plan?.scenes || []) {
    const shot = scene.shots.find((item) => item.id === shotId);
    if (shot) return shot;
  }
  return undefined;
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

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
