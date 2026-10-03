import { createHash } from 'node:crypto';
import { access, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import { assetRelativePath, projectAssetDir } from '@/lib/storage/project-store';
import { prepareAudioFirstVoice } from '@/lib/engine/audio-first';
import { inspectSingleVisualSource } from '@/lib/engine/single-visual-source-v4';
import {
  extractVideoOnlySegment,
  fitAudioToSlot,
  muxSegmentAudio,
  probeMediaDurationSeconds
} from '@/lib/media/segmented-ffmpeg';
import { assertCinematicSceneVideo, assertCinematicVideoTrack } from '@/lib/media/probe';

const OUTPUT_TOLERANCE_SECONDS = 0.12;

export type SingleRealRenderResult = {
  projectId: string;
  sceneId: string;
  shotId: string;
  sourceVideoAsset: string;
  sourceSha256Before: string;
  sourceSha256After: string;
  sourcePreserved: boolean;
  rawAudioDurationSeconds: number;
  speedFactor: number;
  masterAudioAsset: string;
  outputAsset: string;
  outputDurationSeconds: number;
};

export async function renderSingleShotReal(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot
): Promise<SingleRealRenderResult> {
  if (!shot.spokenText.trim()) {
    throw new Error('La toma single real no contiene texto hablado.');
  }
  if (shot.dialogueLines.length > 1) {
    throw new Error('La toma es multihablante; usa el renderer segmentado.');
  }

  const visual = await inspectSingleVisualSource(project, scene, shot);
  if (!visual.referenceReady || !visual.videoReady) {
    throw new Error('Single real bloqueado: la referencia y el video visual 4.1 deben estar listos.');
  }

  await assertCinematicVideoTrack(visual.videoPath, shot.durationSeconds);
  const sourceSha256Before = await sha256File(visual.videoPath);
  const sourceFingerprint = sourceSha256Before.slice(0, 12);

  const voiceHash = createHash('sha256')
    .update((shot.speakerId || 'narrator') + '\0' + shot.spokenText.trim())
    .digest('hex')
    .slice(0, 10);

  const voiceKey =
    'single-v4-voice/scene-' + pad(scene.order) +
    '-shot-' + pad(shot.order) + '-' + voiceHash;

  const voiceShot: FilmShot = {
    ...shot,
    id: shot.id + ':single-voice:' + voiceHash,
    voiceAsset: undefined,
    alignmentAsset: undefined,
    lipSyncAsset: undefined,
    videoAsset: undefined,
    baseVideoAsset: undefined,
    dialogueLines: [{
      id: shot.dialogueLines[0]?.id || shot.id + ':single-line',
      speakerId: shot.speakerId || shot.dialogueLines[0]?.speakerId || 'narrator',
      text: shot.spokenText.trim(),
      emotion: shot.dialogueLines[0]?.emotion,
      startSeconds: 0,
      endSeconds: shot.durationSeconds
    }]
  };

  const prepared = await prepareAudioFirstVoice(project, scene, voiceShot, voiceKey);
  const rawAudioDurationSeconds = await probeMediaDurationSeconds(prepared.voicePath);
  const speedFactor = rawAudioDurationSeconds <= shot.durationSeconds
    ? 1
    : rawAudioDurationSeconds / shot.durationSeconds;

  if (speedFactor > 1.2) {
    throw new Error(
      'La narración dura ' + rawAudioDurationSeconds.toFixed(3) +
      's y necesitaría ' + speedFactor.toFixed(3) +
      'x para caber en ' + shot.durationSeconds.toFixed(3) +
      's; supera el límite seguro de 1.2x.'
    );
  }

  const folder =
    'scene-' + pad(scene.order) +
    '-shot-' + pad(shot.order) + '-' + shot.id +
    '-src-' + sourceFingerprint;
  const videoDir = path.join(projectAssetDir(project.id, 'video'), 'single-v4-real', folder);
  const audioDir = path.join(projectAssetDir(project.id, 'audio'), 'single-v4-real', folder);
  await Promise.all([
    mkdir(videoDir, { recursive: true }),
    mkdir(audioDir, { recursive: true })
  ]);

  const masterAudioPath = path.join(audioDir, 'master-audio.wav');
  if (!(await fileExists(masterAudioPath))) {
    await fitAudioToSlot(
      prepared.voicePath,
      speedFactor,
      shot.durationSeconds,
      masterAudioPath
    );
  }

  const videoOnlyPath = path.join(videoDir, 'video-only.mp4');
  if (!(await fileExists(videoOnlyPath))) {
    await extractVideoOnlySegment(
      visual.videoPath,
      0,
      shot.durationSeconds,
      videoOnlyPath,
      project.input.aspectRatio
    );
  }

  const outputPath = path.join(videoDir, 'final-real.mp4');
  if (!(await fileExists(outputPath))) {
    await muxSegmentAudio(
      videoOnlyPath,
      masterAudioPath,
      shot.durationSeconds,
      outputPath,
      project.input.aspectRatio
    );
  }

  await assertCinematicSceneVideo(outputPath, shot.durationSeconds, {
    requireMotion: true,
    requireAudibleAudio: true
  });

  const outputDurationSeconds = await probeMediaDurationSeconds(outputPath);
  if (Math.abs(outputDurationSeconds - shot.durationSeconds) > OUTPUT_TOLERANCE_SECONDS) {
    throw new Error(
      'La salida single real dura ' + outputDurationSeconds.toFixed(3) +
      's; debía durar ' + shot.durationSeconds.toFixed(3) + 's.'
    );
  }

  const sourceSha256After = await sha256File(visual.videoPath);
  const sourcePreserved = sourceSha256Before === sourceSha256After;
  if (!sourcePreserved) {
    throw new Error('Protección de media: el SHA256 del video Veo cambió durante el render.');
  }

  return {
    projectId: project.id,
    sceneId: scene.id,
    shotId: shot.id,
    sourceVideoAsset: visual.videoAsset,
    sourceSha256Before,
    sourceSha256After,
    sourcePreserved,
    rawAudioDurationSeconds,
    speedFactor,
    masterAudioAsset: assetRelativePath(project.id, masterAudioPath),
    outputAsset: assetRelativePath(project.id, outputPath),
    outputDurationSeconds
  };
}

export function singleVoiceCheckpointPath(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot
) {
  const voiceHash = createHash('sha256')
    .update((shot.speakerId || 'narrator') + '\0' + shot.spokenText.trim())
    .digest('hex')
    .slice(0, 10);
  return path.join(
    projectAssetDir(project.id, 'audio'),
    'single-v4-voice',
    'scene-' + pad(scene.order) + '-shot-' + pad(shot.order) + '-' + voiceHash + '.mp3'
  );
}

async function sha256File(filePath: string) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}
