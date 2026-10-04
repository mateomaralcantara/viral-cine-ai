import { createHash } from 'node:crypto';
import { access, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import { assetRelativePath, projectAssetDir } from '@/lib/storage/project-store';
import { prepareAudioFirstVoice, applyAudioFirstLipSync } from '@/lib/engine/audio-first';
import { requiresLipSyncForSpeaker } from '@/lib/engine/lip-sync-policy-v4';
import { inspectSingleVisualSource } from '@/lib/engine/single-visual-source-v4';
import {
  extractVideoOnlySegmentWithTailHold,
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
  targetDurationSeconds: number;
  scheduledDurationSeconds: number;
  durationAdjusted: boolean;
  rescueSpeedUsed: boolean;
  emergencyNarrationRescueUsed: boolean;
  lipSyncRequired: boolean;
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
  const lipSyncRequired = requiresLipSyncForSpeaker(
    project,
    voiceShot.speakerId || voiceShot.dialogueLines[0]?.speakerId
  );
  const speakerId =
    voiceShot.speakerId || voiceShot.dialogueLines[0]?.speakerId || '';
  const timing = planSingleRenderTiming(
    rawAudioDurationSeconds,
    shot.durationSeconds,
    {
      allowNarrationRescue: !lipSyncRequired,
      allowEmergencyNarrationRescue:
        !lipSyncRequired && speakerId === 'narrator'
    }
  );
  const renderDurationSeconds = timing.outputDurationSeconds;
  const speedFactor = timing.speedFactor;

  // El voiceShot es efímero: ajustar aquí permite que lip-sync, si aplica,
  // use la misma duración final sin alterar todavía project.json.
  voiceShot.durationSeconds = renderDurationSeconds;
  if (voiceShot.dialogueLines.length === 1) {
    voiceShot.dialogueLines[0].startSeconds = 0;
    voiceShot.dialogueLines[0].endSeconds = renderDurationSeconds;
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
  if (!(await mediaDurationMatches(masterAudioPath, renderDurationSeconds))) {
    await fitAudioToSlot(
      prepared.voicePath,
      speedFactor,
      renderDurationSeconds,
      masterAudioPath
    );
  }

  const videoOnlyPath = path.join(videoDir, 'video-only.mp4');
  if (!(await mediaDurationMatches(videoOnlyPath, renderDurationSeconds))) {
    await extractVideoOnlySegmentWithTailHold(
      visual.videoPath,
      0,
      renderDurationSeconds,
      videoOnlyPath,
      project.input.aspectRatio
    );
  }

  const lipSyncPath = path.join(videoDir, 'lip-sync.mp4');
  let videoForMux = videoOnlyPath;

  if (lipSyncRequired) {
    if (!(await mediaDurationMatches(lipSyncPath, renderDurationSeconds))) {
      await applyAudioFirstLipSync(
        project,
        scene,
        voiceShot,
        videoOnlyPath,
        masterAudioPath,
        lipSyncPath
      );
    }
    videoForMux = lipSyncPath;
  }

  const outputPath = path.join(
    videoDir,
    lipSyncRequired ? 'final-real-lipsync.mp4' : 'final-real.mp4'
  );
  if (!(await mediaDurationMatches(outputPath, renderDurationSeconds))) {
    await muxSegmentAudio(
      videoForMux,
      masterAudioPath,
      renderDurationSeconds,
      outputPath,
      project.input.aspectRatio
    );
  }

  await assertCinematicSceneVideo(outputPath, renderDurationSeconds, {
    requireMotion: true,
    requireAudibleAudio: true
  });

  const outputDurationSeconds = await probeMediaDurationSeconds(outputPath);
  if (Math.abs(outputDurationSeconds - renderDurationSeconds) > OUTPUT_TOLERANCE_SECONDS) {
    throw new Error(
      'La salida single real dura ' + outputDurationSeconds.toFixed(3) +
      's; debía durar ' + renderDurationSeconds.toFixed(3) + 's.'
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
    outputDurationSeconds,
    targetDurationSeconds: renderDurationSeconds,
    scheduledDurationSeconds: shot.durationSeconds,
    durationAdjusted: timing.durationAdjusted,
    rescueSpeedUsed: timing.rescueSpeedUsed,
    emergencyNarrationRescueUsed: timing.emergencyNarrationRescueUsed,
    lipSyncRequired
  };
}

export type SingleRenderTimingPlan = {
  scheduledDurationSeconds: number;
  outputDurationSeconds: number;
  speedFactor: number;
  durationAdjusted: boolean;
  rescueSpeedUsed: boolean;
  emergencyNarrationRescueUsed: boolean;
};

const NORMAL_SINGLE_SPEED_LIMIT = 1.2;
const NARRATION_RESCUE_SPEED_LIMIT = 1.25;
const EMERGENCY_NARRATION_RESCUE_SPEED_LIMIT = 1.33;
const MAX_SINGLE_SHOT_SECONDS = 8;

export function planSingleRenderTiming(
  rawAudioDurationSeconds: number,
  scheduledDurationSeconds: number,
  options: {
    allowNarrationRescue?: boolean;
    allowEmergencyNarrationRescue?: boolean;
  } = {}
): SingleRenderTimingPlan {
  if (!Number.isFinite(rawAudioDurationSeconds) || rawAudioDurationSeconds <= 0) {
    throw new Error('Duración de audio inválida para planificar el render single.');
  }
  if (!Number.isFinite(scheduledDurationSeconds) || scheduledDurationSeconds <= 0) {
    throw new Error('Duración programada inválida para planificar el render single.');
  }
  if (!Number.isInteger(scheduledDurationSeconds) || scheduledDurationSeconds > MAX_SINGLE_SHOT_SECONDS) {
    throw new Error(
      'La duración programada single debe ser un entero de hasta ' +
      MAX_SINGLE_SHOT_SECONDS + 's.'
    );
  }

  const directSpeed = rawAudioDurationSeconds <= scheduledDurationSeconds
    ? 1
    : rawAudioDurationSeconds / scheduledDurationSeconds;

  if (directSpeed <= NORMAL_SINGLE_SPEED_LIMIT) {
    return {
      scheduledDurationSeconds,
      outputDurationSeconds: scheduledDurationSeconds,
      speedFactor: Math.max(1, directSpeed),
      durationAdjusted: false,
      rescueSpeedUsed: false,
      emergencyNarrationRescueUsed: false
    };
  }

  // FilmShotSchema exige segundos enteros y un máximo de 8s.
  // Primero intentamos ampliar a otro entero válido sin superar 1.2x.
  const durationNeededAtNormalSpeed = Math.ceil(
    rawAudioDurationSeconds / NORMAL_SINGLE_SPEED_LIMIT
  );
  const outputDurationSeconds = Math.min(
    MAX_SINGLE_SHOT_SECONDS,
    Math.max(scheduledDurationSeconds, durationNeededAtNormalSpeed)
  );
  const speedFactor = rawAudioDurationSeconds <= outputDurationSeconds
    ? 1
    : rawAudioDurationSeconds / outputDurationSeconds;

  if (speedFactor <= NORMAL_SINGLE_SPEED_LIMIT) {
    return {
      scheduledDurationSeconds,
      outputDurationSeconds,
      speedFactor: Math.max(1, speedFactor),
      durationAdjusted: outputDurationSeconds !== scheduledDurationSeconds,
      rescueSpeedUsed: false,
      emergencyNarrationRescueUsed: false
    };
  }

  // Rescate exclusivo para narración/off-camera: una aceleración mínima
  // adicional evita cortar texto o violar el schema 4-8s. Nunca se usa
  // en diálogo visible/lip-sync.
  if (
    options.allowNarrationRescue &&
    speedFactor <= NARRATION_RESCUE_SPEED_LIMIT
  ) {
    return {
      scheduledDurationSeconds,
      outputDurationSeconds,
      speedFactor,
      durationAdjusted: outputDurationSeconds !== scheduledDurationSeconds,
      rescueSpeedUsed: true,
      emergencyNarrationRescueUsed: false
    };
  }

  // Rescate excepcional exclusivo del narrador. Conserva todo el texto,
  // mantiene el schema en 8s y evita regenerar imagen/video por unas décimas.
  // 1.33x sigue usando atempo (preserva tono) y no se permite para diálogo visible.
  if (
    options.allowEmergencyNarrationRescue &&
    speedFactor <= EMERGENCY_NARRATION_RESCUE_SPEED_LIMIT
  ) {
    return {
      scheduledDurationSeconds,
      outputDurationSeconds,
      speedFactor,
      durationAdjusted: outputDurationSeconds !== scheduledDurationSeconds,
      rescueSpeedUsed: true,
      emergencyNarrationRescueUsed: true
    };
  }

  throw new Error(
    'La narración dura ' + rawAudioDurationSeconds.toFixed(3) +
    's. Con el máximo permitido de ' + outputDurationSeconds.toFixed(3) +
    's necesitaría ' + speedFactor.toFixed(3) +
    'x. El límite normal es 1.2x' +
    (options.allowEmergencyNarrationRescue
      ? ' y el rescate excepcional del narrador llega a 1.33x.'
      : options.allowNarrationRescue
        ? ' y el rescate seguro de narración llega a 1.25x.'
        : '; el diálogo visible no permite rescate por encima de 1.2x.')
  );
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

async function mediaDurationMatches(filePath: string, expectedSeconds: number) {
  if (!(await fileExists(filePath))) return false;
  try {
    const duration = await probeMediaDurationSeconds(filePath);
    return Math.abs(duration - expectedSeconds) <= OUTPUT_TOLERANCE_SECONDS;
  } catch {
    return false;
  }
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
