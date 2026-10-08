import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import {
  assetAbsolutePath,
  assetRelativePath,
  getProject,
  projectAssetDir,
  saveProject
} from '@/lib/storage/project-store';
import { generateSpeech } from '@/lib/providers/openai-media';
import {
  audioFileToDataUri,
  generateRunwayGrokLiteFromEnvironment,
  generateRunwayWan3AudioReferenceFromEnvironment,
  grokLiteImageToVideoCredits,
  imageFileToDataUri,
  wan3VideoCredits
} from '@/lib/providers/runway-router-v6';
import {
  appendSpend,
  estimateOperationCost,
  latestSpendForKey,
  readSpendLedger,
  voiceCostUnits
} from '@/lib/engine/spend-ledger';
import {
  concatenate,
  createSilenceAudio,
  extractLastFrame,
  normalizeGeneratedVideo,
  normalizeGeneratedVideoWithEmbeddedAudio,
  normalizeReferenceImage
} from '@/lib/media/ffmpeg';
import {
  fitAudioToSlot,
  probeMediaDurationSeconds
} from '@/lib/media/segmented-ffmpeg';
import {
  assertCinematicSceneVideo,
  probeVideo
} from '@/lib/media/probe';
import {
  renderedAssets,
  saveSceneCheckpoint,
  saveShotCheckpoint
} from '@/lib/engine/scene-checkpoints';
import { applyFifteenDaysCoreVoiceLocksV5 } from '@/lib/engine/fifteen-days-voice-lock-v5';
import {
  planScene6ClosingV6,
  validateScene6ClosingV6,
  SCENE6_ELENA_ID_V6,
  SCENE6_MAX_VIDEO_USD_V6,
  SCENE6_MAX_VOICE_USD_V6,
  SCENE6_SAFE_MAX_USD_V6
} from '@/lib/engine/scene6-closing-plan-v6';

const GROK_MODEL = 'grok_imagine_1_5_lite' as const;
const GROK_RATIO = 'auto_720p' as const;
const WAN_RATIO = '1280:720' as const;
const MAX_GROK_4S_CREDITS = 13;
const MAX_WAN_4S_CREDITS = 40;
const MAX_TOTAL_VIDEO_CREDITS = 66;

export type Scene6ClosingResultV6 = {
  projectId: string;
  sceneVideo: string;
  runwayCredits: number;
  runwayUsd: number;
  voiceUsdEstimated: number;
};

export async function produceScene6ClosingV6(
  projectId: string
): Promise<Scene6ClosingResultV6> {
  delete process.env.FAL_KEY;
  process.env.ENABLE_LIPSYNC = 'false';
  process.env.ALLOW_PAID_PROVIDER_FALLBACK = 'false';

  let project = await getProject(projectId);
  assertProjectReady(project);

  applyFifteenDaysCoreVoiceLocksV5(project);

  let scene6 = sceneByOrder(project, 6);
  if (!scene6.shots.length) {
    planScene6ClosingV6(project);
    scene6 = sceneByOrder(project, 6);
  }
  validateScene6ClosingV6(project);
  project = await saveProject(project);

  const finalScenePath = path.join(
    projectAssetDir(project.id, 'video'),
    'scene-006-home-promise-v6.mp4'
  );

  if (
    scene6.videoAsset?.endsWith('scene-006-home-promise-v6.mp4') &&
    await exists(finalScenePath)
  ) {
    await assertCinematicSceneVideo(finalScenePath, 12, {
      requireMotion: true,
      requireAudibleAudio: true
    });
    return {
      projectId: project.id,
      sceneVideo: finalScenePath,
      runwayCredits: 0,
      runwayUsd: 0,
      voiceUsdEstimated: 0
    };
  }

  const silentCredits =
    grokLiteImageToVideoCredits(4, GROK_RATIO) * 2;
  const dialogueCredits =
    wan3VideoCredits(4, WAN_RATIO);
  const expectedVideoCredits = silentCredits + dialogueCredits;
  const expectedVideoUsd = expectedVideoCredits * 0.01;

  const t2 = shotByOrder(scene6, 2);
  const voiceEstimate = estimateOperationCost(
    'voice',
    voiceCostUnits(t2.spokenText)
  );

  if (expectedVideoCredits !== MAX_TOTAL_VIDEO_CREDITS) {
    throw new Error(
      'SAFE COST GATE E6: video esperado cambió a ' +
        expectedVideoCredits +
        ' créditos.'
    );
  }
  if (Math.abs(expectedVideoUsd - SCENE6_MAX_VIDEO_USD_V6) > 0.0001) {
    throw new Error(
      'SAFE COST GATE E6: video esperado cambió a US$' +
        expectedVideoUsd.toFixed(2) +
        '.'
    );
  }
  if (voiceEstimate > SCENE6_MAX_VOICE_USD_V6) {
    throw new Error(
      'SAFE COST GATE E6: voz estimada US$' +
        voiceEstimate.toFixed(4) +
        ' supera US$' +
        SCENE6_MAX_VOICE_USD_V6.toFixed(2) +
        '.'
    );
  }
  if (
    expectedVideoUsd + voiceEstimate >
    SCENE6_SAFE_MAX_USD_V6 + 0.0001
  ) {
    throw new Error(
      'SAFE COST GATE E6: total estimado supera US$' +
        SCENE6_SAFE_MAX_USD_V6.toFixed(2) +
        '.'
    );
  }

  const elenaRef = await characterReference(
    project,
    SCENE6_ELENA_ID_V6,
    'elena-d-restored'
  );

  const scene5 = sceneByOrder(project, 5);
  if (
    scene5.status !== 'ready' ||
    !scene5.qualityOverrideApproved ||
    !scene5.videoAsset?.endsWith(
      'scene-005-wan3-reunion-v6-mateo-true-child.mp4'
    )
  ) {
    throw new Error(
      'Escena 5 debe seguir aprobada y congelada antes de producir Escena 6.'
    );
  }
  const scene5Video = assetAbsolutePath(
    project.id,
    scene5.videoAsset
  );
  await access(scene5Video);

  scene6.status = 'rendering';
  scene6.error = undefined;
  project.status = 'producing';
  project.error = undefined;
  project.productionLog.push(
    new Date().toISOString() +
      ' ViralCine 6 Safe: Escena 6 inicia producción; T1/T3 Grok Lite silenciosas, T2 Elena marin + WAN 3.0; Fal.ai prohibido.'
  );
  project = await saveProject(project);

  const dirs = {
    images: path.join(
      projectAssetDir(project.id, 'images'),
      'scene6-v6'
    ),
    audio: path.join(
      projectAssetDir(project.id, 'audio'),
      'scene6-v6'
    ),
    video: path.join(
      projectAssetDir(project.id, 'video'),
      'scene6-v6'
    )
  };
  await Promise.all([
    mkdir(dirs.images, { recursive: true }),
    mkdir(dirs.audio, { recursive: true }),
    mkdir(dirs.video, { recursive: true })
  ]);

  const silence4 = path.join(dirs.audio, 'silence-4s.mp3');
  if (!(await exists(silence4))) {
    await createSilenceAudio(4, silence4);
  }

  const t1Reference = path.join(
    dirs.images,
    'scene-006-shot-01-from-scene5.jpg'
  );
  if (!(await exists(t1Reference))) {
    await extractLastFrame(
      scene5Video,
      t1Reference,
      project.input.aspectRatio
    );
  }

  let totalRunwayCredits = 0;

  // T1 — Sofía silenciosa.
  project = await getProject(project.id);
  scene6 = sceneByOrder(project, 6);
  const shot1 = shotByOrder(scene6, 1);
  const t1Raw = path.join(
    dirs.video,
    'scene-006-shot-01-grok-lite-raw.mp4'
  );
  const t1Final = path.join(
    dirs.video,
    'scene-006-shot-01.mp4'
  );

  const t1Credits = grokLiteImageToVideoCredits(
    shot1.durationSeconds,
    GROK_RATIO
  );
  if (t1Credits !== MAX_GROK_4S_CREDITS) {
    throw new Error(
      'SAFE COST GATE E6/T1: Grok Lite cambió a ' +
        t1Credits +
        ' créditos.'
    );
  }

  let t1Charged = 0;
  if (!(await exists(t1Raw))) {
    const spendKey = 'v6safe:e6:t1:grok-lite:1';
    await assertRetryAvailable(
      project.id,
      spendKey,
      'E6/T1 Grok Lite'
    );
    await assertScene6CumulativeBudget(
      project.id,
      t1Credits * 0.01,
      'E6/T1 Grok Lite'
    );

    await appendSpend(project.id, {
      operation: 'video',
      provider: 'runway-direct',
      model: GROK_MODEL,
      state: 'submitted',
      estimatedUsd: t1Credits * 0.01,
      sceneId: scene6.id,
      shotId: shot1.id,
      idempotencyKey: spendKey
    });

    try {
      const generated = await withPaidGate(async () =>
        generateRunwayGrokLiteFromEnvironment(
          {
            model: GROK_MODEL,
            promptImage: await imageFileToDataUri(t1Reference),
            promptText: buildSilentPrompt(shot1),
            ratio: GROK_RATIO,
            duration: shot1.durationSeconds
          },
          t1Raw
        )
      );

      if (generated.credits !== t1Credits) {
        throw new Error(
          'Runway devolvió ' +
            generated.credits +
            ' créditos en E6/T1; esperábamos ' +
            t1Credits +
            '.'
        );
      }

      t1Charged = generated.credits;
      totalRunwayCredits += t1Charged;
      await appendSpend(project.id, {
        operation: 'video',
        provider: 'runway-direct',
        model: generated.model,
        state: 'succeeded',
        estimatedUsd: t1Credits * 0.01,
        actualUsd: t1Charged * 0.01,
        sceneId: scene6.id,
        shotId: shot1.id,
        idempotencyKey: spendKey,
        providerRequestId: generated.taskId,
        outputAsset: assetRelativePath(project.id, t1Raw)
      });
    } catch (error) {
      await recordRunwayFailure(
        project.id,
        scene6,
        shot1,
        spendKey,
        GROK_MODEL,
        t1Credits * 0.01,
        error
      );
      throw error;
    }
  }

  await normalizeGeneratedVideo(
    t1Raw,
    silence4,
    shot1.durationSeconds,
    t1Final,
    project.input.aspectRatio
  );
  await assertCinematicSceneVideo(t1Final, 4, {
    requireMotion: true
  });
  await persistShot(
    project.id,
    1,
    t1Reference,
    silence4,
    t1Raw,
    t1Final,
    'Runway Direct / grok_imagine_1_5_lite',
    t1Charged
  );

  // T2 — Elena habla.
  project = await getProject(project.id);
  scene6 = sceneByOrder(project, 6);
  const shot2 = shotByOrder(scene6, 2);

  const t2Continuity = path.join(
    dirs.images,
    'scene-006-shot-02-continuity.jpg'
  );
  if (!(await exists(t2Continuity))) {
    await extractLastFrame(
      t1Final,
      t2Continuity,
      project.input.aspectRatio
    );
  }

  const elenaWanRef = path.join(
    dirs.images,
    'scene-006-elena-wan-safe-9x16.png'
  );
  if (!(await exists(elenaWanRef))) {
    await normalizeReferenceImage(
      elenaRef,
      elenaWanRef,
      '9:16'
    );
  }

  const t2Audio = await ensureElenaVoice(
    project,
    scene6,
    shot2,
    dirs.audio
  );

  const t2Raw = path.join(
    dirs.video,
    'scene-006-shot-02-wan3-raw.mp4'
  );
  const t2Final = path.join(
    dirs.video,
    'scene-006-shot-02-wan3-final.mp4'
  );

  const t2Credits = wan3VideoCredits(
    shot2.durationSeconds,
    WAN_RATIO
  );
  if (t2Credits !== MAX_WAN_4S_CREDITS) {
    throw new Error(
      'SAFE COST GATE E6/T2: WAN cambió a ' +
        t2Credits +
        ' créditos.'
    );
  }

  let t2Charged = 0;
  if (!(await exists(t2Raw))) {
    const spendKey =
      'v6safe:e6:t2:wan3-audio-reference:1';
    await assertRetryAvailable(
      project.id,
      spendKey,
      'E6/T2 WAN 3.0'
    );
    await assertScene6CumulativeBudget(
      project.id,
      t2Credits * 0.01,
      'E6/T2 WAN 3.0'
    );

    await appendSpend(project.id, {
      operation: 'video',
      provider: 'runway-direct',
      model: 'wan3',
      state: 'submitted',
      estimatedUsd: t2Credits * 0.01,
      sceneId: scene6.id,
      shotId: shot2.id,
      characterId: shot2.speakerId,
      idempotencyKey: spendKey
    });

    try {
      const generated = await withPaidGate(async () =>
        generateRunwayWan3AudioReferenceFromEnvironment(
          {
            model: 'wan3',
            promptText: buildDialoguePrompt(shot2),
            audio: true,
            duration: shot2.durationSeconds,
            ratio: WAN_RATIO,
            references: [
              { uri: await imageFileToDataUri(t2Continuity) },
              { uri: await imageFileToDataUri(elenaWanRef) }
            ],
            referenceAudio: [
              {
                type: 'audio',
                uri: await audioFileToDataUri(t2Audio)
              }
            ]
          },
          t2Raw
        )
      );

      if (generated.credits !== t2Credits) {
        throw new Error(
          'Runway devolvió ' +
            generated.credits +
            ' créditos en E6/T2; esperábamos ' +
            t2Credits +
            '.'
        );
      }

      t2Charged = generated.credits;
      totalRunwayCredits += t2Charged;
      await appendSpend(project.id, {
        operation: 'video',
        provider: 'runway-direct',
        model: generated.model,
        state: 'succeeded',
        estimatedUsd: t2Credits * 0.01,
        actualUsd: t2Charged * 0.01,
        sceneId: scene6.id,
        shotId: shot2.id,
        characterId: shot2.speakerId,
        idempotencyKey: spendKey,
        providerRequestId: generated.taskId,
        outputAsset: assetRelativePath(project.id, t2Raw)
      });
    } catch (error) {
      await recordRunwayFailure(
        project.id,
        scene6,
        shot2,
        spendKey,
        'wan3',
        t2Credits * 0.01,
        error
      );
      throw error;
    }
  }

  const t2Probe = await probeVideo(t2Raw);
  if (!t2Probe.hasVideo || !t2Probe.hasAudio) {
    throw new Error(
      'E6/T2 WAN incompleta: video=' +
        t2Probe.hasVideo +
        ', audio=' +
        t2Probe.hasAudio +
        '.'
    );
  }

  await normalizeGeneratedVideoWithEmbeddedAudio(
    t2Raw,
    shot2.durationSeconds,
    t2Final,
    project.input.aspectRatio
  );
  await assertCinematicSceneVideo(t2Final, 4, {
    requireMotion: true,
    requireAudibleAudio: true
  });
  await persistShot(
    project.id,
    2,
    t2Continuity,
    t2Audio,
    t2Raw,
    t2Final,
    'Runway Direct / WAN 3.0 audio-reference',
    t2Charged
  );

  // T3 — abrazo silencioso.
  project = await getProject(project.id);
  scene6 = sceneByOrder(project, 6);
  const shot3 = shotByOrder(scene6, 3);

  // Para el abrazo final reutilizamos el frame familiar aprobado
  // de Escena 5: conserva a Elena, Sofía y Mateo sin crear imagen nueva.
  const t3Continuity = t1Reference;

  const t3Raw = path.join(
    dirs.video,
    'scene-006-shot-03-grok-lite-raw.mp4'
  );
  const t3Final = path.join(
    dirs.video,
    'scene-006-shot-03.mp4'
  );

  const t3Credits = grokLiteImageToVideoCredits(
    shot3.durationSeconds,
    GROK_RATIO
  );
  if (t3Credits !== MAX_GROK_4S_CREDITS) {
    throw new Error(
      'SAFE COST GATE E6/T3: Grok Lite cambió a ' +
        t3Credits +
        ' créditos.'
    );
  }

  let t3Charged = 0;
  if (!(await exists(t3Raw))) {
    const spendKey = 'v6safe:e6:t3:grok-lite:1';
    await assertRetryAvailable(
      project.id,
      spendKey,
      'E6/T3 Grok Lite'
    );
    await assertScene6CumulativeBudget(
      project.id,
      t3Credits * 0.01,
      'E6/T3 Grok Lite'
    );

    await appendSpend(project.id, {
      operation: 'video',
      provider: 'runway-direct',
      model: GROK_MODEL,
      state: 'submitted',
      estimatedUsd: t3Credits * 0.01,
      sceneId: scene6.id,
      shotId: shot3.id,
      idempotencyKey: spendKey
    });

    try {
      const generated = await withPaidGate(async () =>
        generateRunwayGrokLiteFromEnvironment(
          {
            model: GROK_MODEL,
            promptImage: await imageFileToDataUri(t3Continuity),
            promptText: buildSilentPrompt(shot3),
            ratio: GROK_RATIO,
            duration: shot3.durationSeconds
          },
          t3Raw
        )
      );

      if (generated.credits !== t3Credits) {
        throw new Error(
          'Runway devolvió ' +
            generated.credits +
            ' créditos en E6/T3; esperábamos ' +
            t3Credits +
            '.'
        );
      }

      t3Charged = generated.credits;
      totalRunwayCredits += t3Charged;
      await appendSpend(project.id, {
        operation: 'video',
        provider: 'runway-direct',
        model: generated.model,
        state: 'succeeded',
        estimatedUsd: t3Credits * 0.01,
        actualUsd: t3Charged * 0.01,
        sceneId: scene6.id,
        shotId: shot3.id,
        idempotencyKey: spendKey,
        providerRequestId: generated.taskId,
        outputAsset: assetRelativePath(project.id, t3Raw)
      });
    } catch (error) {
      await recordRunwayFailure(
        project.id,
        scene6,
        shot3,
        spendKey,
        GROK_MODEL,
        t3Credits * 0.01,
        error
      );
      throw error;
    }
  }

  await normalizeGeneratedVideo(
    t3Raw,
    silence4,
    shot3.durationSeconds,
    t3Final,
    project.input.aspectRatio
  );
  await assertCinematicSceneVideo(t3Final, 4, {
    requireMotion: true
  });
  await persistShot(
    project.id,
    3,
    t3Continuity,
    silence4,
    t3Raw,
    t3Final,
    'Runway Direct / grok_imagine_1_5_lite',
    t3Charged
  );

  project = await getProject(project.id);
  scene6 = sceneByOrder(project, 6);
  const clips = [...scene6.shots]
    .sort((a, b) => a.order - b.order)
    .map((shot) => {
      if (!shot.videoAsset) {
        throw new Error(
          'E6/T' + shot.order +
          ' no tiene video final.'
        );
      }
      return assetAbsolutePath(project.id, shot.videoAsset);
    });

  await concatenate(clips, finalScenePath);
  await assertCinematicSceneVideo(finalScenePath, 12, {
    requireMotion: true,
    requireAudibleAudio: true
  });

  scene6.imageAsset = assetRelativePath(
    project.id,
    t1Reference
  );
  scene6.videoAsset = assetRelativePath(
    project.id,
    finalScenePath
  );
  scene6.status = 'review-required';
  scene6.error =
    'Cierre “Esta es nuestra casa” listo. Revisión humana requerida antes de aprobar/congelar.';
  scene6.productionStrategy = 'real-cinema-v2';

  project.status = 'quality-review';
  project.error = undefined;
  project.progress = {
    phase: 'quality-review',
    percent: 96,
    message:
      'Escena 6 “Esta es nuestra casa” generada con Runway/WAN-only. Revisión humana requerida.',
    currentScene: 6,
    totalScenes: 6,
    updatedAt: new Date().toISOString()
  };
  project.productionLog.push(
    new Date().toISOString() +
      ' ViralCine 6 Safe: Escena 6 recompuesta en 12s; Sofía silenciosa; Elena marin + WAN; T1/T3 Grok Lite; Fal.ai NO.'
  );

  await saveSceneCheckpoint(
    project,
    scene6,
    renderedAssets(
      project.id,
      scene6.mode,
      t1Reference,
      t2Audio,
      finalScenePath
    )
  );
  await saveProject(project);

  return {
    projectId: project.id,
    sceneVideo: finalScenePath,
    runwayCredits: totalRunwayCredits,
    runwayUsd: totalRunwayCredits * 0.01,
    voiceUsdEstimated: voiceEstimate
  };
}

async function ensureElenaVoice(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot,
  audioDir: string
) {
  if (
    shot.speakerId !== SCENE6_ELENA_ID_V6 ||
    shot.spokenText !==
      '¿Ves? Te lo prometí… esta es nuestra casa.'
  ) {
    throw new Error(
      'E6/T2 no coincide con el diálogo final aprobado de Elena.'
    );
  }

  const character = project.plan?.characters.find(
    (item) => item.id === SCENE6_ELENA_ID_V6
  );
  if (
    !character ||
    character.voiceProvider !== 'openai' ||
    character.voiceId !== 'marin'
  ) {
    throw new Error(
      'Elena debe conservar Voice Lock OpenAI marin.'
    );
  }

  const rawVoice = path.join(
    audioDir,
    'scene-006-shot-02-elena-marin-raw.mp3'
  );
  const masterVoice = path.join(
    audioDir,
    'scene-006-shot-02-elena-master.wav'
  );

  if (!(await exists(rawVoice))) {
    const estimate = estimateOperationCost(
      'voice',
      voiceCostUnits(shot.spokenText)
    );
    if (estimate > SCENE6_MAX_VOICE_USD_V6) {
      throw new Error(
        'SAFE COST GATE voz E6/T2: US$' +
          estimate.toFixed(4)
      );
    }

    const spendKey =
      'v6safe:e6:t2:voice:marin:1';
    await assertRetryAvailable(
      project.id,
      spendKey,
      'voz E6/T2'
    );
    await assertScene6CumulativeBudget(
      project.id,
      estimate,
      'voz E6/T2'
    );

    await appendSpend(project.id, {
      operation: 'voice',
      provider: 'openai',
      model:
        process.env.OPENAI_TTS_MODEL ||
        'gpt-4o-mini-tts',
      state: 'submitted',
      estimatedUsd: estimate,
      sceneId: scene.id,
      shotId: shot.id,
      characterId: character.id,
      idempotencyKey: spendKey
    });

    try {
      await withPaidGate(async () =>
        generateSpeech(
          shot.spokenText,
          character.voiceInstructions,
          rawVoice,
          'marin'
        )
      );

      await appendSpend(project.id, {
        operation: 'voice',
        provider: 'openai',
        model:
          process.env.OPENAI_TTS_MODEL ||
          'gpt-4o-mini-tts',
        state: 'succeeded',
        estimatedUsd: estimate,
        actualUsd: estimate,
        sceneId: scene.id,
        shotId: shot.id,
        characterId: character.id,
        idempotencyKey: spendKey,
        outputAsset: assetRelativePath(
          project.id,
          rawVoice
        )
      });
    } catch (error) {
      await appendSpend(project.id, {
        operation: 'voice',
        provider: 'openai',
        model:
          process.env.OPENAI_TTS_MODEL ||
          'gpt-4o-mini-tts',
        state: 'failed-unknown',
        estimatedUsd: estimate,
        sceneId: scene.id,
        shotId: shot.id,
        characterId: character.id,
        idempotencyKey: spendKey,
        error: errorText(error)
      });
      throw error;
    }
  }

  const duration = await probeMediaDurationSeconds(rawVoice);
  const speedFactor = Math.max(
    1,
    duration / shot.durationSeconds
  );
  if (speedFactor > 1.2) {
    throw new Error(
      'E6/T2: voz ' +
        duration.toFixed(3) +
        's exige ' +
        speedFactor.toFixed(3) +
        'x; máximo visible 1.2x. WAN NO fue llamado.'
    );
  }

  await fitAudioToSlot(
    rawVoice,
    speedFactor,
    shot.durationSeconds,
    masterVoice
  );
  return masterVoice;
}

async function persistShot(
  projectId: string,
  order: number,
  image: string,
  voice: string,
  raw: string,
  final: string,
  provider: string,
  chargedCredits: number
) {
  const project = await getProject(projectId);
  const scene = sceneByOrder(project, 6);
  const shot = shotByOrder(scene, order);

  shot.imageAsset = assetRelativePath(project.id, image);
  shot.voiceAsset = assetRelativePath(project.id, voice);
  shot.baseVideoAsset = assetRelativePath(project.id, raw);
  shot.videoAsset = assetRelativePath(project.id, final);
  shot.lipSyncAsset =
    order === 2
      ? assetRelativePath(project.id, raw)
      : undefined;
  shot.status = 'ready';
  shot.error = undefined;
  shot.lastProvider = provider;
  shot.lastGenerationState = 'succeeded';
  shot.generationCount =
    (shot.generationCount || 0) +
    (chargedCredits > 0 ? 1 : 0);
  shot.estimatedSpendUsd =
    (shot.estimatedSpendUsd || 0) +
    chargedCredits * 0.01;
  shot.pipelineVersion = '6.0-scene6-home-promise';

  await saveShotCheckpoint(
    project,
    scene,
    shot,
    renderedAssets(
      project.id,
      shot.mode,
      image,
      voice,
      final
    )
  );
  project.productionLog.push(
    new Date().toISOString() +
      ' ViralCine 6 Safe: E6/T' +
      order +
      ' lista con ' +
      provider +
      '; Fal.ai NO.'
  );
  await saveProject(project);
}

async function recordRunwayFailure(
  projectId: string,
  scene: FilmScene,
  shot: FilmShot,
  spendKey: string,
  model: string,
  estimatedUsd: number,
  error: unknown
) {
  const message = errorText(error);
  const taskId =
    message.match(/taskId=([0-9a-f-]{36})/i)?.[1];
  const rejectedBeforeTask =
    !taskId &&
    /Runway HTTP 400/i.test(message) &&
    /Validation of body failed/i.test(message);

  await appendSpend(projectId, {
    operation: 'video',
    provider: 'runway-direct',
    model,
    state: rejectedBeforeTask
      ? 'failed-no-charge'
      : 'failed-unknown',
    estimatedUsd,
    actualUsd: rejectedBeforeTask ? 0 : undefined,
    sceneId: scene.id,
    shotId: shot.id,
    characterId: shot.speakerId,
    idempotencyKey: spendKey,
    providerRequestId: taskId,
    error:
      (rejectedBeforeTask
        ? '[runway-request-rejected-no-task] '
        : '') +
      message
  });
}

async function characterReference(
  project: FilmProject,
  characterId: string,
  stateId: string
) {
  const character = project.plan?.characters.find(
    (item) => item.id === characterId
  );
  const bible = project.plan?.realMotion?.characterBible.find(
    (item) => item.characterId === characterId
  );
  const state = bible?.states.find(
    (item) => item.id === stateId
  );

  const candidates = [
    state?.referenceAsset,
    bible?.bodyReferenceAsset,
    bible?.masterReferenceAsset,
    character?.referenceAsset
  ].filter((value): value is string => Boolean(value));

  for (const asset of candidates) {
    const full = assetAbsolutePath(project.id, asset);
    if (await exists(full)) return full;
  }
  throw new Error(
    'No existe referencia visual utilizable para ' +
      (character?.name || characterId) +
      ' / ' +
      stateId +
      '.'
  );
}

function buildSilentPrompt(shot: FilmShot) {
  return [
    shot.visualPrompt,
    'Conservar exactamente las identidades, edades, proporciones, vestuario y geografía del fotograma de referencia.',
    'Sofía y Mateo deben verse inequívocamente como niños de sus edades definidas.',
    'Nadie habla. Bocas relajadas y sin movimientos de habla.',
    'Una sola acción física dominante; prohibidos loops, morphing facial, manos duplicadas o personas extra.',
    'Cámara: ' + shot.camera,
    'Sin texto, subtítulos, logos ni marcas de agua.'
  ].join(' ').slice(0, 1900);
}

function buildDialoguePrompt(shot: FilmShot) {
  return [
    '[Image 1] fija continuidad del espacio, iluminación, vestuario, eje y composición del plano inmediatamente anterior.',
    '[Image 2] fija estrictamente la identidad facial, edad, piel, cabello y proporciones de Elena.',
    shot.visualPrompt,
    'Elena es la única persona que habla.',
    'El audio de referencia contiene exactamente: “¿Ves? Te lo prometí… esta es nuestra casa.”',
    'Sincronizar con precisión labios, mandíbula y expresión facial con cada fonema y pausa.',
    'La boca de Elena permanece visible durante toda la frase.',
    'No alterar identidad, edad ni género.',
    'Sofía, si aparece, permanece en silencio y no mueve los labios como si hablara.',
    'Una sola toma cinematográfica continua de 4 segundos.',
    'Cámara: ' + shot.camera,
    'Sin texto, subtítulos, logos, marcas de agua, música ni diálogo adicional.'
  ].join(' ').slice(0, 2300);
}

function assertProjectReady(project: FilmProject) {
  if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
    throw new Error(
      'Este productor solo está autorizado para 15 DÍAS.'
    );
  }
  if (!project.plan || project.plan.scenes.length !== 6) {
    throw new Error(
      'Este productor exige 15 DÍAS short de 6 escenas.'
    );
  }
  if (
    process.env.ALLOW_EXTERNAL_API_CALLS === 'true' ||
    process.env.ALLOW_PAID_GENERATION === 'true' ||
    process.env.ALLOW_PAID_PROVIDER_FALLBACK === 'true'
  ) {
    throw new Error(
      'Las APIs generales deben iniciar bloqueadas. La ruta E6 abre únicamente cada llamada autorizada.'
    );
  }
}

async function assertRetryAvailable(
  projectId: string,
  spendKey: string,
  label: string
) {
  const previous = await latestSpendForKey(
    projectId,
    spendKey
  );
  if (!previous) return;
  if (
    previous.state === 'reserved' ||
    previous.state === 'failed-no-charge'
  ) {
    return;
  }
  throw new Error(
    'SAFE RETRY BLOCK ' +
      label +
      ': estado previo=' +
      previous.state +
      '. No se reintentará automáticamente.'
  );
}

async function assertScene6CumulativeBudget(
  projectId: string,
  nextUsd: number,
  label: string
) {
  const ledger = await readSpendLedger(projectId);
  const actual = ledger
    .filter(
      (entry) =>
        entry.sceneId === 'scene-15d-short-06' &&
        entry.state === 'succeeded'
    )
    .reduce(
      (sum, entry) =>
        sum +
        (typeof entry.actualUsd === 'number'
          ? entry.actualUsd
          : 0),
      0
    );

  if (actual + nextUsd > SCENE6_SAFE_MAX_USD_V6 + 0.0001) {
    throw new Error(
      'SAFE CUMULATIVE COST GATE E6: ya hay US$' +
        actual.toFixed(4) +
        ' confirmados; ' +
        label +
        ' añadiría US$' +
        nextUsd.toFixed(4) +
        ' y superaría el máximo US$' +
        SCENE6_SAFE_MAX_USD_V6.toFixed(2) +
        '.'
    );
  }
}

async function withPaidGate<T>(
  run: () => Promise<T>
) {
  const oldExternal =
    process.env.ALLOW_EXTERNAL_API_CALLS;
  const oldPaid =
    process.env.ALLOW_PAID_GENERATION;
  const oldFallback =
    process.env.ALLOW_PAID_PROVIDER_FALLBACK;
  const oldProduction =
    process.env.PRODUCTION_MODE;

  process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
  process.env.ALLOW_PAID_GENERATION = 'true';
  process.env.ALLOW_PAID_PROVIDER_FALLBACK = 'false';
  process.env.PRODUCTION_MODE = 'real';

  try {
    return await run();
  } finally {
    restoreEnv('ALLOW_EXTERNAL_API_CALLS', oldExternal);
    restoreEnv('ALLOW_PAID_GENERATION', oldPaid);
    restoreEnv('ALLOW_PAID_PROVIDER_FALLBACK', oldFallback);
    restoreEnv('PRODUCTION_MODE', oldProduction);
  }
}

function sceneByOrder(
  project: FilmProject,
  order: number
): FilmScene {
  const scene = project.plan?.scenes.find(
    (item) => item.order === order
  );
  if (!scene) {
    throw new Error('No existe Escena ' + order + '.');
  }
  return scene;
}

function shotByOrder(
  scene: FilmScene,
  order: number
): FilmShot {
  const shot = scene.shots.find(
    (item) => item.order === order
  );
  if (!shot) {
    throw new Error('No existe E6/T' + order + '.');
  }
  return shot;
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function restoreEnv(
  name: string,
  value: string | undefined
) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : String(error);
}
