import { createHash } from 'node:crypto';
import { access, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DialogueLine, FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import { assetAbsolutePath, assetRelativePath, projectAssetDir } from '@/lib/storage/project-store';
import { concatenate, createSyntheticSpeechAudio } from '@/lib/media/ffmpeg';
import {
  assertVideoStream,
  concatenateAudioSegments,
  extractVideoOnlySegment,
  extractVideoOnlySegmentWithTailHold,
  fitAudioToSlot,
  muxSegmentAudio,
  probeMediaDurationSeconds
} from '@/lib/media/segmented-ffmpeg';
import { hasMultipleDialogueSpeakers } from '@/lib/engine/speaker-resolution';
import { requiresLipSyncForSpeaker } from '@/lib/engine/lip-sync-policy-v4';
import { prepareAudioFirstVoice, applyAudioFirstLipSync } from '@/lib/engine/audio-first';
import { locateVoiceProfile } from '@/lib/engine/voice-casting-v4';
import { assertPaidGenerationAllowed, hasUsableCredential } from '@/lib/engine/production-safety';
import { planSegmentedRenderTiming } from '@/lib/engine/segmented-timing-v4';
import { assertCinematicSceneVideo, assertCinematicVideoTrack } from '@/lib/media/probe';

const TIMING_TOLERANCE_SECONDS = 0.025;
const OUTPUT_DURATION_TOLERANCE_SECONDS = 0.12;

export type SegmentedTurn = {
  id: string;
  index: number;
  speakerId: string;
  text: string;
  emotion?: string;
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

export type RealSegmentedRenderTurn = {
  index: number;
  speakerId: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  rawAudioDurationSeconds: number;
  speedFactor: number;
  requiresLipSync: boolean;
  voicePath: string;
  alignedAudioPath: string;
  renderedPath: string;
};

export type SegmentedRealRenderOptions = {
  turnSourceAssets?: Record<number, string>;
};

export type RealSegmentedRenderResult = {
  projectId: string;
  sceneId: string;
  shotId: string;
  sourceVideoAsset: string;
  sourceMode: 'single' | 'per-turn';
  turnSourceAssets?: Record<number, string>;
  sourceSha256Before: string;
  sourceSha256After: string;
  sourcePreserved: boolean;
  sourceDurationSeconds: number;
  outputPath: string;
  outputAsset: string;
  masterAudioPath: string;
  masterAudioAsset: string;
  outputDurationSeconds: number;
  scheduledDurationSeconds: number;
  durationAdjusted: boolean;
  durationDeltaSeconds: number;
  lipSyncTurns: number;
  turns: RealSegmentedRenderTurn[];
  externalCalls: true;
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
  const sourceVideoAsset = shot.baseVideoAsset || shot.videoAsset;
  if (!sourceVideoAsset) throw new Error('La toma multihablante no tiene videoAsset/baseVideoAsset fuente.');
  if (!hasMultipleDialogueSpeakers(shot)) {
    throw new Error('La toma no contiene varios hablantes estructurados; el renderer segmentado no aplica.');
  }
  if (shot.dialogueLines.length < 2) {
    throw new Error('La toma multihablante requiere al menos dos dialogueLines.');
  }

  const turns = normalizeTurns(project, shot.dialogueLines, shot.durationSeconds);
  validateContinuousTimeline(turns, shot.durationSeconds);

  return {
    projectId: project.id,
    sceneId: scene.id,
    sceneOrder: scene.order,
    shotId: shot.id,
    shotOrder: shot.order,
    shotDurationSeconds: shot.durationSeconds,
    sourceVideoAsset,
    sourceVideoPath: assetAbsolutePath(project.id, sourceVideoAsset),
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
  const sourceFingerprint = sourceSha256Before.slice(0, 12);
  const outputDir = path.join(
    projectAssetDir(project.id, 'video'),
    'segmented-v4-offline',
    `scene-${pad(scene.order)}-shot-${pad(shot.order)}-${shot.id}-src-${sourceFingerprint}`
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

  await assertVideoStream(outputPath, 'Salida recompuesta');
  await assertCinematicSceneVideo(outputPath, plan.shotDurationSeconds, {
    requireMotion: true,
    requireAudibleAudio: true
  });
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

export async function renderSegmentedShotReal(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot,
  options: SegmentedRealRenderOptions = {}
): Promise<RealSegmentedRenderResult> {
  const plan = buildSegmentedShotPlan(project, scene, shot);
  assertSegmentedRealReadiness(project, plan);
  assertPaidGenerationAllowed('renderizar toma multihablante real');

  const turnSourceAssets = options.turnSourceAssets || {};
  const useTurnSources =
    plan.turns.length > 0 &&
    plan.turns.every((turn) => Boolean(turnSourceAssets[turn.index]));

  const turnSourcePaths = new Map<number, string>();
  const sourceBeforeParts: string[] = [];
  let sourceDurationSeconds = 0;

  if (useTurnSources) {
    for (const turn of plan.turns) {
      const asset = turnSourceAssets[turn.index];
      const sourcePath = assetAbsolutePath(project.id, asset);
      await access(sourcePath);
      await assertVideoStream(sourcePath, 'MP4 fuente turno ' + turn.index);
      await assertCinematicVideoTrack(sourcePath, turn.durationSeconds);
      const duration = await probeMediaDurationSeconds(sourcePath);
      if (duration + OUTPUT_DURATION_TOLERANCE_SECONDS < turn.durationSeconds) {
        throw new Error(
          'La fuente visual del turno ' + turn.index + ' dura ' + duration.toFixed(3) +
          's y el turno exige ' + turn.durationSeconds.toFixed(3) + 's.'
        );
      }
      const sha = await sha256File(sourcePath);
      sourceBeforeParts.push(turn.index + ':' + sha);
      sourceDurationSeconds += duration;
      turnSourcePaths.set(turn.index, sourcePath);
    }
  } else {
    await access(plan.sourceVideoPath);
    await assertVideoStream(plan.sourceVideoPath, 'MP4 fuente');
    await assertCinematicVideoTrack(plan.sourceVideoPath, plan.shotDurationSeconds);
    sourceDurationSeconds = await probeMediaDurationSeconds(plan.sourceVideoPath);
    if (sourceDurationSeconds + OUTPUT_DURATION_TOLERANCE_SECONDS < plan.shotDurationSeconds) {
      throw new Error(
        'El MP4 fuente dura ' + sourceDurationSeconds.toFixed(3) +
        's y la toma exige ' + plan.shotDurationSeconds.toFixed(3) + 's.'
      );
    }
    sourceBeforeParts.push(await sha256File(plan.sourceVideoPath));
  }

  const sourceSha256Before = createHash('sha256')
    .update(sourceBeforeParts.join('|'))
    .digest('hex');
  const sourceFingerprint = sourceSha256Before.slice(0, 12);
  const folder =
    'scene-' + pad(scene.order) + '-shot-' + pad(shot.order) + '-' + shot.id +
    '-src-' + sourceFingerprint;
  const videoDir = path.join(projectAssetDir(project.id, 'video'), 'segmented-v4-real', folder);
  const audioDir = path.join(projectAssetDir(project.id, 'audio'), 'segmented-v4-real', folder);
  await Promise.all([
    mkdir(videoDir, { recursive: true }),
    mkdir(audioDir, { recursive: true })
  ]);

  const preparedTurns: Array<{
    turn: SegmentedTurn;
    turnShot: FilmShot;
    voicePath: string;
    rawAudioDurationSeconds: number;
    hash: string;
  }> = [];

  for (const turn of plan.turns) {
    const hash = createHash('sha256')
      .update(turn.speakerId + '\0' + turn.text)
      .digest('hex')
      .slice(0, 10);

    // Audio identity intentionally excludes the visual-source fingerprint.
    // Replacing a bad video must not trigger duplicate TTS spend.
    const turnShot = makeTurnShot(shot, turn, turn.durationSeconds, hash);
    const key =
      'seg-s' + pad(scene.order) + '-t' + pad(shot.order) +
      '-turn-' + pad(turn.index) + '-' + hash;
    const prepared = await prepareAudioFirstVoice(project, scene, turnShot, key);
    const rawAudioDurationSeconds = await probeMediaDurationSeconds(prepared.voicePath);
    preparedTurns.push({
      turn,
      turnShot,
      voicePath: prepared.voicePath,
      rawAudioDurationSeconds,
      hash
    });
  }

  const maxSpeed = boundedMaxSpeed(process.env.SEGMENTED_TTS_MAX_SPEED);
  const timing = planSegmentedRenderTiming(
    preparedTurns.map(({ turn, rawAudioDurationSeconds }) => ({
      id: turn.id,
      index: turn.index,
      slotDurationSeconds: turn.durationSeconds,
      audioDurationSeconds: rawAudioDurationSeconds
    })),
    plan.shotDurationSeconds,
    maxSpeed
  );
  const allocations = timing.allocations;
  const renderDurationSeconds = timing.outputDurationSeconds;

  const renderedTurns: string[] = [];
  const alignedAudios: string[] = [];
  const realTurns: RealSegmentedRenderTurn[] = [];

  for (let index = 0; index < preparedTurns.length; index += 1) {
    const prepared = preparedTurns[index];
    const allocation = allocations[index];
    const prefix = 'turn-' + pad(prepared.turn.index);
    const alignedAudioPath = path.join(audioDir, prefix + '-aligned.wav');
    const videoOnlyPath = path.join(videoDir, prefix + '-video.mp4');
    const lipSyncPath = path.join(videoDir, prefix + '-lipsync.mp4');
    const renderedPath = path.join(videoDir, prefix + '.mp4');

    if (!(await fileExists(alignedAudioPath))) {
      await fitAudioToSlot(
        prepared.voicePath,
        allocation.speedFactor,
        allocation.targetDurationSeconds,
        alignedAudioPath
      );
    }

    if (!(await fileExists(videoOnlyPath))) {
      const sourcePath = useTurnSources
        ? turnSourcePaths.get(prepared.turn.index)!
        : plan.sourceVideoPath;
      const sourceStartSeconds = useTurnSources ? 0 : allocation.startSeconds;
      if (useTurnSources) {
        await extractVideoOnlySegmentWithTailHold(
          sourcePath,
          sourceStartSeconds,
          allocation.targetDurationSeconds,
          videoOnlyPath,
          project.input.aspectRatio
        );
      } else {
        await extractVideoOnlySegment(
          sourcePath,
          sourceStartSeconds,
          allocation.targetDurationSeconds,
          videoOnlyPath,
          project.input.aspectRatio
        );
      }
    }

    let videoForMux = videoOnlyPath;
    if (prepared.turn.requiresLipSync) {
      if (!(await fileExists(lipSyncPath))) {
        const adjustedTurnShot = makeTurnShot(
          shot,
          prepared.turn,
          allocation.targetDurationSeconds,
          prepared.hash,
          sourceFingerprint
        );
        await applyAudioFirstLipSync(
          project,
          scene,
          adjustedTurnShot,
          videoOnlyPath,
          alignedAudioPath,
          lipSyncPath
        );
      }
      videoForMux = lipSyncPath;
    }

    if (!(await fileExists(renderedPath))) {
      await muxSegmentAudio(
        videoForMux,
        alignedAudioPath,
        allocation.targetDurationSeconds,
        renderedPath,
        project.input.aspectRatio
      );
    }

    renderedTurns.push(renderedPath);
    alignedAudios.push(alignedAudioPath);
    realTurns.push({
      index: prepared.turn.index,
      speakerId: prepared.turn.speakerId,
      startSeconds: allocation.startSeconds,
      endSeconds: allocation.endSeconds,
      durationSeconds: allocation.targetDurationSeconds,
      rawAudioDurationSeconds: prepared.rawAudioDurationSeconds,
      speedFactor: allocation.speedFactor,
      requiresLipSync: prepared.turn.requiresLipSync,
      voicePath: prepared.voicePath,
      alignedAudioPath,
      renderedPath
    });
  }

  const masterAudioPath = path.join(audioDir, 'master-audio.wav');
  await concatenateAudioSegments(alignedAudios, masterAudioPath);

  const outputPath = path.join(videoDir, 'recomposed-real.mp4');
  await concatenate(renderedTurns, outputPath);

  await assertVideoStream(outputPath, 'Salida recompuesta');
  await assertCinematicSceneVideo(outputPath, renderDurationSeconds, {
    requireMotion: true,
    requireAudibleAudio: true
  });
  const outputDurationSeconds = await probeMediaDurationSeconds(outputPath);
  const durationDeltaSeconds = Math.abs(outputDurationSeconds - renderDurationSeconds);
  if (durationDeltaSeconds > OUTPUT_DURATION_TOLERANCE_SECONDS) {
    throw new Error(
      'La recomposición real dura ' + outputDurationSeconds.toFixed(3) +
      's; debía durar ' + renderDurationSeconds.toFixed(3) +
      's (delta ' + durationDeltaSeconds.toFixed(3) + 's).'
    );
  }

  const sourceAfterParts: string[] = [];
  if (useTurnSources) {
    for (const turn of plan.turns) {
      sourceAfterParts.push(
        turn.index + ':' + await sha256File(turnSourcePaths.get(turn.index)!)
      );
    }
  } else {
    sourceAfterParts.push(await sha256File(plan.sourceVideoPath));
  }
  const sourceSha256After = createHash('sha256')
    .update(sourceAfterParts.join('|'))
    .digest('hex');
  const sourcePreserved = sourceSha256Before === sourceSha256After;
  if (!sourcePreserved) {
    throw new Error(
      'Protección de media: el SHA256 de las fuentes visuales cambió durante el render segmentado real.'
    );
  }

  return {
    projectId: project.id,
    sceneId: scene.id,
    shotId: shot.id,
    sourceVideoAsset: plan.sourceVideoAsset,
    sourceMode: useTurnSources ? 'per-turn' : 'single',
    turnSourceAssets: useTurnSources ? { ...turnSourceAssets } : undefined,
    sourceSha256Before,
    sourceSha256After,
    sourcePreserved,
    sourceDurationSeconds,
    outputPath,
    outputAsset: assetRelativePath(project.id, outputPath),
    masterAudioPath,
    masterAudioAsset: assetRelativePath(project.id, masterAudioPath),
    outputDurationSeconds,
    scheduledDurationSeconds: plan.shotDurationSeconds,
    durationAdjusted: timing.durationAdjusted,
    durationDeltaSeconds,
    lipSyncTurns: realTurns.filter((turn) => turn.requiresLipSync).length,
    turns: realTurns,
    externalCalls: true
  };
}

function normalizeTurns(project: FilmProject, lines: DialogueLine[], shotDurationSeconds: number): SegmentedTurn[] {
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
      emotion: line.emotion,
      startSeconds,
      endSeconds,
      durationSeconds: endSeconds - startSeconds,
      requiresLipSync: requiresLipSyncForSpeaker(project, line.speakerId)
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

function makeTurnShot(
  parent: FilmShot,
  turn: SegmentedTurn,
  durationSeconds: number,
  hash: string,
  sourceFingerprint?: string
): FilmShot {
  return {
    ...parent,
    id:
      parent.id + ':turn:' + turn.index + ':' + hash +
      (sourceFingerprint ? ':src:' + sourceFingerprint : ''),
    durationSeconds,
    spokenText: turn.text,
    speakerId: turn.speakerId,
    dialogueLines: [{
      id: turn.id,
      speakerId: turn.speakerId,
      text: turn.text,
      emotion: turn.emotion,
      startSeconds: 0,
      endSeconds: durationSeconds
    }],
    voiceAsset: undefined,
    alignmentAsset: undefined,
    lipSyncAsset: undefined,
    videoAsset: undefined,
    baseVideoAsset: undefined
  };
}

function assertSegmentedRealReadiness(project: FilmProject, plan: SegmentedShotPlan) {
  const blockers: string[] = [];

  for (const turn of plan.turns) {
    const located = locateVoiceProfile(project, turn.speakerId);
    const label = located?.label || turn.speakerId;

    if (!located) {
      blockers.push(label + ': no existe un perfil vocal persistente.');
      continue;
    }

    const profile = located.profile;
    const provider = profile.voiceProvider || 'elevenlabs';

    if (provider === 'elevenlabs') {
      const voiceId = profile.voiceId ||
        (turn.speakerId === 'narrator' ? process.env.ELEVENLABS_NARRATOR_VOICE_ID : undefined);
      if (!voiceId?.trim()) blockers.push(label + ': falta voiceId persistente de ElevenLabs.');
      if (!hasUsableCredential('ELEVENLABS_API_KEY')) blockers.push(label + ': falta ELEVENLABS_API_KEY.');
    } else if (provider === 'openai') {
      if (!hasUsableCredential('OPENAI_API_KEY')) blockers.push(label + ': falta OPENAI_API_KEY.');
    } else {
      blockers.push(label + ': proveedor vocal ' + provider + ' no es válido para render real.');
    }

    if (turn.requiresLipSync) {
      if (process.env.ENABLE_LIPSYNC === 'false') blockers.push(label + ': ENABLE_LIPSYNC=false.');
      if (!hasUsableCredential('FAL_KEY')) blockers.push(label + ': falta FAL_KEY.');
    }
  }

  if (blockers.length) {
    throw new Error('Preflight segmentado real bloqueado: ' + [...new Set(blockers)].join(' | '));
  }
}

function boundedMaxSpeed(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1.2;
  return Math.max(1, Math.min(1.2, parsed));
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
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
