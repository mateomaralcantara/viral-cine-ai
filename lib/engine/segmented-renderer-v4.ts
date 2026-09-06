import { createHash } from 'node:crypto';
import { access, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DialogueLine, FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import { assetAbsolutePath, assetRelativePath, projectAssetDir } from '@/lib/storage/project-store';
import { concatenate, createSyntheticSpeechAudio } from '@/lib/media/ffmpeg';
import {
  extractVideoOnlySegment,
  muxSegmentAudio,
  probeMediaDurationSeconds
} from '@/lib/media/segmented-ffmpeg';
import { hasMultipleDialogueSpeakers } from '@/lib/engine/speaker-resolution';

const TIMING_TOLERANCE_SECONDS = 0.025;
const OUTPUT_DURATION_TOLERANCE_SECONDS = 0.12;

export type SegmentedTurn = {
  id: string;
  index: number;
  speakerId: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  requiresLipSync: boolean;
};

export type SegmentedShotPlan = {
  projectId: string;
  sceneId: string;
  sceneOrder: number;
  shotId: string;
  shotOrder: number;
  shotDurationSeconds: number;
  sourceVideoAsset: string;
  sourceVideoPath: string;
  turns: SegmentedTurn[];
};

export type SegmentedRendererPreview = {
  projectId: string;
  title: string;
  mixedShots: number;
  readyShots: number;
  blockedShots: number;
  turns: number;
  mediaBackedShots: number;
  rows: Array<{
    sceneOrder: number;
    shotOrder: number;
    shotId: string;
    turns: number;
    ready: boolean;
    sourceVideoAsset?: string;
    issue?: string;
  }>;
};

export type OfflineSegmentedRenderResult = {
  projectId: string;
  sceneId: string;
  shotId: string;
  sourceVideoAsset: string;
  sourceSha256Before: string;
  sourceSha256After: string;
  sourcePreserved: boolean;
  sourceDurationSeconds: number;
  outputPath: string;
  outputAsset: string;
  outputDurationSeconds: number;
  durationDeltaSeconds: number;
  turns: number;
  externalCalls: false;
  spendUsd: 0;
};

export function buildSegmentedShotPlan(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot
): SegmentedShotPlan {
  if (!shot.videoAsset) throw new Error('La toma multihablante no tiene videoAsset fuente.');
  if (!hasMultipleDialogueSpeakers(shot)) {
    throw new Error('La toma no contiene varios hablantes estructurados; el renderer segmentado no aplica.');
  }
  if (shot.dialogueLines.length < 2) {
    throw new Error('La toma multihablante requiere al menos dos dialogueLines.');
  }

  const turns = normalizeTurns(shot.dialogueLines, shot.durationSeconds);
  validateContinuousTimeline(turns, shot.durationSeconds);

  return {
    projectId: project.id,
    sceneId: scene.id,
    sceneOrder: scene.order,
    shotId: shot.id,
    shotOrder: shot.order,
    shotDurationSeconds: shot.durationSeconds,
    sourceVideoAsset: shot.videoAsset,
    sourceVideoPath: assetAbsolutePath(project.id, shot.videoAsset),
    turns
  };
}

export function previewSegmentedRenderer(project: FilmProject): SegmentedRendererPreview {
  const rows: SegmentedRendererPreview['rows'] = [];
  for (const scene of project.plan?.scenes || []) {
    for (const shot of scene.shots) {
      if (!hasMultipleDialogueSpeakers(shot)) continue;
      try {
        const plan = buildSegmentedShotPlan(project, scene, shot);
        rows.push({
          sceneOrder: scene.order,
          shotOrder: shot.order,
          shotId: shot.id,
          turns: plan.turns.length,
          ready: true,
          sourceVideoAsset: plan.sourceVideoAsset
        });
      } catch (error) {
        rows.push({
          sceneOrder: scene.order,
          shotOrder: shot.order,
          shotId: shot.id,
          turns: shot.dialogueLines.length,
          ready: false,
          sourceVideoAsset: shot.videoAsset,
          issue: messageOf(error)
        });
      }
    }
  }

  return {
    projectId: project.id,
    title: project.input.title,
    mixedShots: rows.length,
    readyShots: rows.filter((row) => row.ready).length,
    blockedShots: rows.filter((row) => !row.ready).length,
    turns: rows.reduce((sum, row) => sum + row.turns, 0),
    mediaBackedShots: rows.filter((row) => Boolean(row.sourceVideoAsset)).length,
    rows
  };
}

export async function renderSegmentedShotOffline(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot
): Promise<OfflineSegmentedRenderResult> {
  assertOfflineSafety();
  const plan = buildSegmentedShotPlan(project, scene, shot);
  await access(plan.sourceVideoPath);

  const sourceDurationSeconds = await probeMediaDurationSeconds(plan.sourceVideoPath);
  if (sourceDurationSeconds + OUTPUT_DURATION_TOLERANCE_SECONDS < plan.shotDurationSeconds) {
    throw new Error(
      `El MP4 fuente dura ${sourceDurationSeconds.toFixed(3)}s y la toma exige ${plan.shotDurationSeconds.toFixed(3)}s.`
    );
  }

  const sourceSha256Before = await sha256File(plan.sourceVideoPath);
  const outputDir = path.join(
    projectAssetDir(project.id, 'video'),
    'segmented-v4-offline',
    `scene-${pad(scene.order)}-shot-${pad(shot.order)}-${shot.id}`
  );
  await mkdir(outputDir, { recursive: true });

  const renderedTurns: string[] = [];
  for (const turn of plan.turns) {
    const prefix = `turn-${pad(turn.index)}`;
    const videoOnlyPath = path.join(outputDir, `${prefix}-video.mp4`);
    const audioPath = path.join(outputDir, `${prefix}-audio.mp3`);
    const renderedPath = path.join(outputDir, `${prefix}.mp4`);

    await extractVideoOnlySegment(
      plan.sourceVideoPath,
      turn.startSeconds,
      turn.durationSeconds,
      videoOnlyPath,
      project.input.aspectRatio
    );
    await createSyntheticSpeechAudio(turn.durationSeconds, audioPath);
    await muxSegmentAudio(
      videoOnlyPath,
      audioPath,
      turn.durationSeconds,
      renderedPath,
      project.input.aspectRatio
    );
    renderedTurns.push(renderedPath);
  }

  const outputPath = path.join(outputDir, 'recomposed-offline.mp4');
  await concatenate(renderedTurns, outputPath);

  const outputDurationSeconds = await probeMediaDurationSeconds(outputPath);
  const durationDeltaSeconds = Math.abs(outputDurationSeconds - plan.shotDurationSeconds);
  if (durationDeltaSeconds > OUTPUT_DURATION_TOLERANCE_SECONDS) {
    throw new Error(
      `La recomposición dura ${outputDurationSeconds.toFixed(3)}s; debía durar ${plan.shotDurationSeconds.toFixed(3)}s ` +
      `(delta ${durationDeltaSeconds.toFixed(3)}s).`
    );
  }

  const sourceSha256After = await sha256File(plan.sourceVideoPath);
  const sourcePreserved = sourceSha256Before === sourceSha256After;
  if (!sourcePreserved) {
    throw new Error('Protección de media: el SHA256 del MP4 fuente cambió durante el render segmentado.');
  }

  return {
    projectId: project.id,
    sceneId: scene.id,
    shotId: shot.id,
    sourceVideoAsset: plan.sourceVideoAsset,
    sourceSha256Before,
    sourceSha256After,
    sourcePreserved,
    sourceDurationSeconds,
    outputPath,
    outputAsset: assetRelativePath(project.id, outputPath),
    outputDurationSeconds,
    durationDeltaSeconds,
    turns: plan.turns.length,
    externalCalls: false,
    spendUsd: 0
  };
}

function normalizeTurns(lines: DialogueLine[], shotDurationSeconds: number): SegmentedTurn[] {
  return lines.map((line, index) => {
    const startSeconds = line.startSeconds;
    const endSeconds = line.endSeconds;
    if (!line.speakerId?.trim()) throw new Error(`Turno ${index + 1}: falta speakerId.`);
    if (!line.text?.trim()) throw new Error(`Turno ${index + 1}: falta texto.`);
    if (!Number.isFinite(startSeconds) || startSeconds < 0) throw new Error(`Turno ${index + 1}: startSeconds inválido.`);
    if (endSeconds === undefined || !Number.isFinite(endSeconds)) throw new Error(`Turno ${index + 1}: falta endSeconds.`);
    if (endSeconds <= startSeconds) throw new Error(`Turno ${index + 1}: endSeconds debe ser mayor que startSeconds.`);
    if (endSeconds > shotDurationSeconds + TIMING_TOLERANCE_SECONDS) {
      throw new Error(`Turno ${index + 1}: termina fuera de la duración de la toma.`);
    }
    return {
      id: line.id,
      index: index + 1,
      speakerId: line.speakerId,
      text: line.text.trim(),
      startSeconds,
      endSeconds,
      durationSeconds: endSeconds - startSeconds,
      requiresLipSync: line.speakerId !== 'narrator'
    };
  });
}

function validateContinuousTimeline(turns: SegmentedTurn[], shotDurationSeconds: number) {
  if (!turns.length) throw new Error('La toma no tiene turnos temporales.');
  if (Math.abs(turns[0].startSeconds) > TIMING_TOLERANCE_SECONDS) {
    throw new Error(`La línea temporal no comienza en 0s; comienza en ${turns[0].startSeconds.toFixed(3)}s.`);
  }
  for (let index = 1; index < turns.length; index += 1) {
    const previous = turns[index - 1];
    const current = turns[index];
    const delta = current.startSeconds - previous.endSeconds;
    if (Math.abs(delta) > TIMING_TOLERANCE_SECONDS) {
      throw new Error(
        `La línea temporal tiene ${delta > 0 ? 'un hueco' : 'un solapamiento'} de ${Math.abs(delta).toFixed(3)}s ` +
        `entre turnos ${previous.index} y ${current.index}.`
      );
    }
  }
  const last = turns.at(-1)!;
  if (Math.abs(last.endSeconds - shotDurationSeconds) > TIMING_TOLERANCE_SECONDS) {
    throw new Error(
      `La línea temporal termina en ${last.endSeconds.toFixed(3)}s y la toma dura ${shotDurationSeconds.toFixed(3)}s.`
    );
  }
}

function assertOfflineSafety() {
  if (process.env.PRODUCTION_MODE === 'real') {
    throw new Error('Renderer offline bloqueado porque PRODUCTION_MODE=real.');
  }
  if (process.env.ALLOW_EXTERNAL_API_CALLS === 'true') {
    throw new Error('Renderer offline exige ALLOW_EXTERNAL_API_CALLS=false.');
  }
  if (process.env.ALLOW_PAID_GENERATION === 'true') {
    throw new Error('Renderer offline exige ALLOW_PAID_GENERATION=false.');
  }
}

async function sha256File(filePath: string) {
  const buffer = await readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
