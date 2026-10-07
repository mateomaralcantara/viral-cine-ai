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
import {
  generateImageWithReferences,
  generateSpeech
} from '@/lib/providers/openai-media';
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
import {
  applyFifteenDaysCoreVoiceLocksV5
} from '@/lib/engine/fifteen-days-voice-lock-v5';
import {
  planScene5ReunionV6,
  validateScene5ReunionV6,
  SCENE5_ELENA_ID_V6,
  SCENE5_SOFIA_ID_V6,
  SCENE5_MATEO_ID_V6,
  SCENE5_MAX_VIDEO_USD_V6,
  SCENE5_MAX_VOICE_USD_V6,
  SCENE5_MAX_REFERENCE_IMAGE_USD_V6,
  SCENE5_SAFE_MAX_USD_V6
} from '@/lib/engine/scene5-reunion-plan-v6';

const GROK_MODEL = 'grok_imagine_1_5_lite' as const;
const GROK_RATIO = 'auto_720p' as const;
const WAN_RATIO = '1280:720' as const;
const MAX_GROK_7S_CREDITS = 22;
const MAX_WAN_4S_CREDITS = 40;
const MAX_TOTAL_VIDEO_CREDITS = 204;

export type Scene5ReunionResultV6 = {
  projectId: string;
  sceneVideo: string;
  runwayCredits: number;
  runwayUsd: number;
  referenceImageUsd: number;
  voiceUsdEstimated: number;
};

export async function produceScene5ReunionV6(
  projectId: string
): Promise<Scene5ReunionResultV6> {
  delete process.env.FAL_KEY;
  process.env.ENABLE_LIPSYNC = 'false';
  process.env.ALLOW_PAID_PROVIDER_FALLBACK = 'false';

  let project = await getProject(projectId);
  assertProjectReady(project);

  applyFifteenDaysCoreVoiceLocksV5(project);

  let scene5 = sceneByOrder(project, 5);
  if (!scene5.shots.length) {
    planScene5ReunionV6(project);
    scene5 = sceneByOrder(project, 5);
  }
  validateScene5ReunionV6(project);
  project = await saveProject(project);

  const finalScenePath = path.join(
    projectAssetDir(project.id, 'video'),
    'scene-005-wan3-reunion-v6.mp4'
  );

  if (
    scene5.videoAsset?.endsWith('scene-005-wan3-reunion-v6.mp4') &&
    await exists(finalScenePath)
  ) {
    await assertCinematicSceneVideo(
      finalScenePath,
      30,
      { requireMotion: true, requireAudibleAudio: true }
    );

    return {
      projectId: project.id,
      sceneVideo: finalScenePath,
      runwayCredits: 0,
      runwayUsd: 0,
      referenceImageUsd: 0,
      voiceUsdEstimated: 0
    };
  }

  const silentCredits =
    grokLiteImageToVideoCredits(7, GROK_RATIO) * 2;
  const dialogueCredits =
    wan3VideoCredits(4, WAN_RATIO) * 4;
  const expectedVideoCredits = silentCredits + dialogueCredits;
  const expectedVideoUsd = expectedVideoCredits * 0.01;

  const voiceEstimate = scene5.shots
    .filter((shot) => shot.spokenText.trim())
    .reduce(
      (sum, shot) =>
        sum +
        estimateOperationCost(
          'voice',
          voiceCostUnits(shot.spokenText)
        ),
      0
    );

  const referenceEstimate = estimateOperationCost('image', 1);

  if (expectedVideoCredits !== MAX_TOTAL_VIDEO_CREDITS) {
    throw new Error(
      'SAFE COST GATE E5: video esperado cambió a ' +
        expectedVideoCredits +
        ' créditos.'
    );
  }
  if (Math.abs(expectedVideoUsd - SCENE5_MAX_VIDEO_USD_V6) > 0.0001) {
    throw new Error(
      'SAFE COST GATE E5: video esperado cambió a US$' +
        expectedVideoUsd.toFixed(2) +
        '.'
    );
  }
  if (voiceEstimate > SCENE5_MAX_VOICE_USD_V6) {
    throw new Error(
      'SAFE COST GATE E5: voces estimadas US$' +
        voiceEstimate.toFixed(4) +
        ' superan US$' +
        SCENE5_MAX_VOICE_USD_V6.toFixed(2) +
        '.'
    );
  }
  if (referenceEstimate > SCENE5_MAX_REFERENCE_IMAGE_USD_V6) {
    throw new Error(
      'SAFE COST GATE E5: referencia estimada US$' +
        referenceEstimate.toFixed(4) +
        ' supera US$' +
        SCENE5_MAX_REFERENCE_IMAGE_USD_V6.toFixed(2) +
        '.'
    );
  }
  if (
    expectedVideoUsd +
      voiceEstimate +
      referenceEstimate >
    SCENE5_SAFE_MAX_USD_V6 + 0.0001
  ) {
    throw new Error(
      'SAFE COST GATE E5: el total estimado supera US$' +
        SCENE5_SAFE_MAX_USD_V6.toFixed(2) +
        '.'
    );
  }

  const refs = {
    elena: await characterReference(
      project,
      SCENE5_ELENA_ID_V6,
      'elena-d-restored'
    ),
    sofia: await characterReference(
      project,
      SCENE5_SOFIA_ID_V6,
      'sofia-main'
    ),
    mateo: await characterReference(
      project,
      SCENE5_MATEO_ID_V6,
      'mateo-main'
    )
  };

  scene5.status = 'rendering';
  scene5.error = undefined;
  project.status = 'producing';
  project.error = undefined;
  project.productionLog.push(
    new Date().toISOString() +
      ' ViralCine 6 Safe: Escena 5 inicia producción Runway/WAN-only; Mateo ash aprobado por revisión humana; Fal.ai prohibido.'
  );
  project = await saveProject(project);

  const dirs = {
    images: path.join(
      projectAssetDir(project.id, 'images'),
      'scene5-v6'
    ),
    audio: path.join(
      projectAssetDir(project.id, 'audio'),
      'scene5-v6'
    ),
    video: path.join(
      projectAssetDir(project.id, 'video'),
      'scene5-v6'
    )
  };
  await Promise.all([
    mkdir(dirs.images, { recursive: true }),
    mkdir(dirs.audio, { recursive: true }),
    mkdir(dirs.video, { recursive: true })
  ]);

  const familyReference = path.join(
    dirs.images,
    'scene-005-shot-01-family-reference.png'
  );

  let referenceImageUsd = 0;
  if (!(await exists(familyReference))) {
    const spendKey = 'v6safe:e5:family-reference:openai:1';
    await assertRetryAvailable(
      project.id,
      spendKey,
      'referencia familiar E5/T1'
    );

    await appendSpend(project.id, {
      operation: 'image',
      provider: 'openai',
      model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
      state: 'submitted',
      estimatedUsd: referenceEstimate,
      sceneId: scene5.id,
      shotId: scene5.shots[0]?.id,
      idempotencyKey: spendKey
    });

    try {
      await withPaidGate(() =>
        generateImageWithReferences(
          [refs.elena, refs.sofia, refs.mateo],
          [
            'Crear un fotograma cinematográfico realista 16:9 para 15 DÍAS.',
            'Usar exactamente las identidades de las tres referencias: Elena adulta, Sofía niña de 10 años y Mateo niño de 7 años.',
            'Interior de una casa sencilla, limpia y estable; sin lujo ni mansión.',
            'Elena está dentro abriendo la puerta principal. Sofía y Mateo están al otro lado con pequeñas bolsas cotidianas.',
            'Conservar edad, rostro, tono de piel, cabello y proporciones de cada persona.',
            'Sofía y Mateo deben conservar proporciones infantiles naturales; nada de apariencia adolescente o adulta.',
            'Momento emocional contenido, luz natural cálida, textura de piel real, cámara a altura humana.',
            'Nadie habla. Bocas relajadas.',
            'Sin texto, subtítulos, logos, marcas de agua ni objetos deformes.'
          ].join(' '),
          familyReference
        )
      );

      await appendSpend(project.id, {
        operation: 'image',
        provider: 'openai',
        model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
        state: 'succeeded',
        estimatedUsd: referenceEstimate,
        actualUsd: referenceEstimate,
        sceneId: scene5.id,
        shotId: scene5.shots[0]?.id,
        idempotencyKey: spendKey,
        outputAsset: assetRelativePath(project.id, familyReference)
      });
      referenceImageUsd = referenceEstimate;
    } catch (error) {
      await appendSpend(project.id, {
        operation: 'image',
        provider: 'openai',
        model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
        state: 'failed-unknown',
        estimatedUsd: referenceEstimate,
        sceneId: scene5.id,
        shotId: scene5.shots[0]?.id,
        idempotencyKey: spendKey,
        error: errorText(error)
      });
      throw error;
    }
  }

  const silence7 = path.join(
    dirs.audio,
    'silence-7s.mp3'
  );
  if (!(await exists(silence7))) {
    await createSilenceAudio(7, silence7);
  }

  let totalRunwayCredits = 0;
  let previousVideo = '';

  for (const order of [1, 2]) {
    project = await getProject(project.id);
    const currentScene = sceneByOrder(project, 5);
    const shot = shotByOrder(currentScene, order);

    const rawPath = path.join(
      dirs.video,
      'scene-005-shot-' +
        String(order).padStart(2, '0') +
        '-grok-lite-raw.mp4'
    );
    const finalPath = path.join(
      dirs.video,
      'scene-005-shot-' +
        String(order).padStart(2, '0') +
        '.mp4'
    );

    let refPath = familyReference;
    if (order === 2) {
      if (!previousVideo) {
        const t1 = shotByOrder(currentScene, 1);
        if (!t1.videoAsset) {
          throw new Error('E5/T1 no está disponible para continuidad de T2.');
        }
        previousVideo = assetAbsolutePath(project.id, t1.videoAsset);
      }
      refPath = path.join(
        dirs.images,
        'scene-005-shot-02-continuity.jpg'
      );
      if (!(await exists(refPath))) {
        await extractLastFrame(
          previousVideo,
          refPath,
          project.input.aspectRatio
        );
      }
    }

    const credits = grokLiteImageToVideoCredits(
      shot.durationSeconds,
      GROK_RATIO
    );
    if (credits !== MAX_GROK_7S_CREDITS) {
      throw new Error(
        'SAFE COST GATE E5/T' +
          order +
          ': Grok Lite cambió a ' +
          credits +
          ' créditos.'
      );
    }

    let charged = 0;
    if (!(await exists(rawPath))) {
      const spendKey =
        'v6safe:e5:t' + order + ':grok-lite:1';
      await assertRetryAvailable(
        project.id,
        spendKey,
        'E5/T' + order + ' Grok Lite'
      );

      await appendSpend(project.id, {
        operation: 'video',
        provider: 'runway-direct',
        model: GROK_MODEL,
        state: 'submitted',
        estimatedUsd: credits * 0.01,
        sceneId: currentScene.id,
        shotId: shot.id,
        idempotencyKey: spendKey
      });

      try {
        const generated =
          await generateRunwayGrokLiteFromEnvironment(
            {
              model: GROK_MODEL,
              promptImage: await imageFileToDataUri(refPath),
              promptText: buildSilentPrompt(shot),
              ratio: GROK_RATIO,
              duration: shot.durationSeconds
            },
            rawPath
          );

        if (generated.credits !== credits) {
          throw new Error(
            'Runway devolvió ' +
              generated.credits +
              ' créditos en E5/T' +
              order +
              '; esperábamos ' +
              credits +
              '.'
          );
        }

        charged = generated.credits;
        totalRunwayCredits += charged;

        await appendSpend(project.id, {
          operation: 'video',
          provider: 'runway-direct',
          model: generated.model,
          state: 'succeeded',
          estimatedUsd: credits * 0.01,
          actualUsd: charged * 0.01,
          sceneId: currentScene.id,
          shotId: shot.id,
          idempotencyKey: spendKey,
          providerRequestId: generated.taskId,
          outputAsset: assetRelativePath(project.id, rawPath)
        });
      } catch (error) {
        const message = errorText(error);
        await appendSpend(project.id, {
          operation: 'video',
          provider: 'runway-direct',
          model: GROK_MODEL,
          state: 'failed-unknown',
          estimatedUsd: credits * 0.01,
          sceneId: currentScene.id,
          shotId: shot.id,
          idempotencyKey: spendKey,
          providerRequestId:
            message.match(/taskId=([0-9a-f-]{36})/i)?.[1],
          error: message
        });
        throw error;
      }
    }

    await normalizeGeneratedVideo(
      rawPath,
      silence7,
      shot.durationSeconds,
      finalPath,
      project.input.aspectRatio
    );
    await assertCinematicSceneVideo(
      finalPath,
      shot.durationSeconds,
      { requireMotion: true }
    );

    project = await getProject(project.id);
    const saveScene = sceneByOrder(project, 5);
    const saveShot = shotByOrder(saveScene, order);

    saveShot.imageAsset = assetRelativePath(project.id, refPath);
    saveShot.voiceAsset = assetRelativePath(project.id, silence7);
    saveShot.baseVideoAsset = assetRelativePath(project.id, rawPath);
    saveShot.videoAsset = assetRelativePath(project.id, finalPath);
    saveShot.lipSyncAsset = undefined;
    saveShot.status = 'ready';
    saveShot.error = undefined;
    saveShot.lastProvider =
      'Runway Direct / grok_imagine_1_5_lite';
    saveShot.lastGenerationState = 'succeeded';
    saveShot.generationCount =
      (saveShot.generationCount || 0) +
      (charged > 0 ? 1 : 0);
    saveShot.estimatedSpendUsd =
      (saveShot.estimatedSpendUsd || 0) +
      charged * 0.01;
    saveShot.pipelineVersion = '6.0-scene5-reunion';

    await saveShotCheckpoint(
      project,
      saveScene,
      saveShot,
      renderedAssets(
        project.id,
        saveShot.mode,
        refPath,
        silence7,
        finalPath
      )
    );

    project.productionLog.push(
      new Date().toISOString() +
        ' ViralCine 6 Safe: E5/T' +
        order +
        ' lista con Grok Lite, silenciosa, Fal.ai NO.'
    );
    project = await saveProject(project);
    previousVideo = finalPath;
  }

  for (const order of [3, 4, 5, 6]) {
    project = await getProject(project.id);
    const currentScene = sceneByOrder(project, 5);
    const shot = shotByOrder(currentScene, order);

    if (!previousVideo) {
      const prior = shotByOrder(currentScene, order - 1);
      if (!prior.videoAsset) {
        throw new Error(
          'E5/T' + (order - 1) +
          ' no está lista para continuidad.'
        );
      }
      previousVideo = assetAbsolutePath(
        project.id,
        prior.videoAsset
      );
    }

    const continuityRef = path.join(
      dirs.images,
      'scene-005-shot-' +
        String(order).padStart(2, '0') +
        '-continuity.jpg'
    );
    if (!(await exists(continuityRef))) {
      await extractLastFrame(
        previousVideo,
        continuityRef,
        project.input.aspectRatio
      );
    }

    const speakerSourceRef =
      shot.speakerId === SCENE5_MATEO_ID_V6
        ? refs.mateo
        : refs.elena;

    const speakerRef = path.join(
      dirs.images,
      'scene-005-speaker-' +
        (shot.speakerId === SCENE5_MATEO_ID_V6
          ? 'mateo'
          : 'elena') +
        '-wan-safe-9x16.png'
    );

    if (!(await exists(speakerRef))) {
      await normalizeReferenceImage(
        speakerSourceRef,
        speakerRef,
        '9:16'
      );
    }

    const audio = await ensureDialogueVoice(
      project,
      currentScene,
      shot,
      dirs.audio
    );

    const rawWan = path.join(
      dirs.video,
      'scene-005-shot-' +
        String(order).padStart(2, '0') +
        '-wan3-raw.mp4'
    );
    const finalWan = path.join(
      dirs.video,
      'scene-005-shot-' +
        String(order).padStart(2, '0') +
        '-wan3-final.mp4'
    );

    const credits = wan3VideoCredits(
      shot.durationSeconds,
      WAN_RATIO
    );
    if (credits !== MAX_WAN_4S_CREDITS) {
      throw new Error(
        'SAFE COST GATE E5/T' +
          order +
          ': WAN cambió a ' +
          credits +
          ' créditos.'
      );
    }

    let charged = 0;
    if (!(await exists(rawWan))) {
      const spendKey =
        'v6safe:e5:t' +
        order +
        ':wan3-audio-reference:1';

      await assertRetryAvailable(
        project.id,
        spendKey,
        'E5/T' + order + ' WAN 3.0'
      );

      await appendSpend(project.id, {
        operation: 'video',
        provider: 'runway-direct',
        model: 'wan3',
        state: 'submitted',
        estimatedUsd: credits * 0.01,
        sceneId: currentScene.id,
        shotId: shot.id,
        characterId: shot.speakerId,
        idempotencyKey: spendKey
      });

      try {
        const generated =
          await generateRunwayWan3AudioReferenceFromEnvironment(
            {
              model: 'wan3',
              promptText: buildDialoguePrompt(shot),
              audio: true,
              duration: shot.durationSeconds,
              ratio: WAN_RATIO,
              references: [
                { uri: await imageFileToDataUri(continuityRef) },
                { uri: await imageFileToDataUri(speakerRef) }
              ],
              referenceAudio: [
                {
                  type: 'audio',
                  uri: await audioFileToDataUri(audio)
                }
              ]
            },
            rawWan
          );

        if (generated.credits !== credits) {
          throw new Error(
            'Runway devolvió ' +
              generated.credits +
              ' créditos en E5/T' +
              order +
              '; esperábamos ' +
              credits +
              '.'
          );
        }

        charged = generated.credits;
        totalRunwayCredits += charged;

        await appendSpend(project.id, {
          operation: 'video',
          provider: 'runway-direct',
          model: generated.model,
          state: 'succeeded',
          estimatedUsd: credits * 0.01,
          actualUsd: charged * 0.01,
          sceneId: currentScene.id,
          shotId: shot.id,
          characterId: shot.speakerId,
          idempotencyKey: spendKey,
          providerRequestId: generated.taskId,
          outputAsset: assetRelativePath(project.id, rawWan)
        });
      } catch (error) {
        const message = errorText(error);
        const taskId =
          message.match(/taskId=([0-9a-f-]{36})/i)?.[1];
        const rejectedBeforeTask =
          !taskId &&
          /Runway HTTP 400/i.test(message) &&
          /Validation of body failed/i.test(message);

        await appendSpend(project.id, {
          operation: 'video',
          provider: 'runway-direct',
          model: 'wan3',
          state: rejectedBeforeTask
            ? 'failed-no-charge'
            : 'failed-unknown',
          estimatedUsd: credits * 0.01,
          actualUsd: rejectedBeforeTask ? 0 : undefined,
          sceneId: currentScene.id,
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
        throw error;
      }
    }

    const rawProbe = await probeVideo(rawWan);
    if (!rawProbe.hasVideo || !rawProbe.hasAudio) {
      throw new Error(
        'E5/T' +
          order +
          ' WAN incompleta: video=' +
          rawProbe.hasVideo +
          ', audio=' +
          rawProbe.hasAudio +
          '.'
      );
    }

    await normalizeGeneratedVideoWithEmbeddedAudio(
      rawWan,
      shot.durationSeconds,
      finalWan,
      project.input.aspectRatio
    );
    await assertCinematicSceneVideo(
      finalWan,
      shot.durationSeconds,
      {
        requireMotion: true,
        requireAudibleAudio: true
      }
    );

    project = await getProject(project.id);
    const saveScene = sceneByOrder(project, 5);
    const saveShot = shotByOrder(saveScene, order);

    saveShot.imageAsset = assetRelativePath(
      project.id,
      continuityRef
    );
    saveShot.voiceAsset = assetRelativePath(
      project.id,
      audio
    );
    saveShot.baseVideoAsset = assetRelativePath(
      project.id,
      rawWan
    );
    saveShot.lipSyncAsset = assetRelativePath(
      project.id,
      rawWan
    );
    saveShot.videoAsset = assetRelativePath(
      project.id,
      finalWan
    );
    saveShot.status = 'ready';
    saveShot.error = undefined;
    saveShot.lastProvider =
      'Runway Direct / WAN 3.0 audio-reference';
    saveShot.lastGenerationState = 'succeeded';
    saveShot.generationCount =
      (saveShot.generationCount || 0) +
      (charged > 0 ? 1 : 0);
    saveShot.estimatedSpendUsd =
      (saveShot.estimatedSpendUsd || 0) +
      charged * 0.01;
    saveShot.pipelineVersion = '6.0-scene5-reunion';

    await saveShotCheckpoint(
      project,
      saveScene,
      saveShot,
      renderedAssets(
        project.id,
        saveShot.mode,
        continuityRef,
        audio,
        finalWan
      )
    );

    project.productionLog.push(
      new Date().toISOString() +
        ' ViralCine 6 Safe: E5/T' +
        order +
        ' lista con WAN 3.0 audio-reference; speaker=' +
        (saveShot.speakerId || 'unknown') +
        '; Fal.ai NO.'
    );
    project = await saveProject(project);
    previousVideo = finalWan;
  }

  project = await getProject(project.id);
  const finalScene = sceneByOrder(project, 5);
  const clips = [...finalScene.shots]
    .sort((a, b) => a.order - b.order)
    .map((shot) => {
      if (!shot.videoAsset) {
        throw new Error(
          'E5/T' + shot.order +
          ' no tiene video final.'
        );
      }
      return assetAbsolutePath(project.id, shot.videoAsset);
    });

  await concatenate(clips, finalScenePath);
  await assertCinematicSceneVideo(
    finalScenePath,
    30,
    {
      requireMotion: true,
      requireAudibleAudio: true
    }
  );

  finalScene.imageAsset = assetRelativePath(
    project.id,
    familyReference
  );
  finalScene.videoAsset = assetRelativePath(
    project.id,
    finalScenePath
  );
  finalScene.status = 'review-required';
  finalScene.error =
    'Reencuentro familiar listo: T1-T2 silenciosas Runway/Grok Lite; T3-T6 WAN 3.0 audio-reference. Revisión humana requerida.';
  finalScene.productionStrategy = 'real-cinema-v2';

  project.status = 'quality-review';
  project.error = undefined;
  project.progress = {
    phase: 'quality-review',
    percent: 83,
    message:
      'Escena 5 “De verdad” generada con Runway/WAN-only. Revisión humana requerida.',
    currentScene: 5,
    totalScenes: 6,
    updatedAt: new Date().toISOString()
  };

  project.productionLog.push(
    new Date().toISOString() +
      ' ViralCine 6 Safe: Escena 5 recompuesta en 30s; Fal.ai prohibido/no usado; Mateo ash aprobado y usado.'
  );

  const representativeDialogue = shotByOrder(finalScene, 3);
  if (!representativeDialogue.voiceAsset) {
    throw new Error(
      'Escena 5 no tiene voz representativa en T3.'
    );
  }

  await saveSceneCheckpoint(
    project,
    finalScene,
    renderedAssets(
      project.id,
      finalScene.mode,
      familyReference,
      assetAbsolutePath(
        project.id,
        representativeDialogue.voiceAsset
      ),
      finalScenePath
    )
  );

  await saveProject(project);

  return {
    projectId: project.id,
    sceneVideo: finalScenePath,
    runwayCredits: totalRunwayCredits,
    runwayUsd: totalRunwayCredits * 0.01,
    referenceImageUsd,
    voiceUsdEstimated: voiceEstimate
  };
}

async function ensureDialogueVoice(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot,
  audioDir: string
) {
  if (!shot.speakerId || !shot.spokenText.trim()) {
    throw new Error(
      'E5/T' + shot.order +
      ' no tiene speaker/texto válido.'
    );
  }

  const character = project.plan?.characters.find(
    (item) => item.id === shot.speakerId
  );
  if (!character) {
    throw new Error(
      'No existe personaje para speaker ' +
        shot.speakerId +
        '.'
    );
  }
  if (character.voiceProvider !== 'openai' || !character.voiceId) {
    throw new Error(
      character.name +
        ' no tiene Voice Lock OpenAI listo.'
    );
  }

  if (
    shot.speakerId === SCENE5_MATEO_ID_V6 &&
    character.voiceId !== 'ash'
  ) {
    throw new Error(
      'Mateo debe conservar la voz aprobada OpenAI ash.'
    );
  }
  if (
    shot.speakerId === SCENE5_ELENA_ID_V6 &&
    character.voiceId !== 'marin'
  ) {
    throw new Error(
      'Elena debe conservar OpenAI marin.'
    );
  }

  const rawVoice = path.join(
    audioDir,
    'scene-005-shot-' +
      String(shot.order).padStart(2, '0') +
      '-' +
      (shot.speakerId === SCENE5_MATEO_ID_V6
        ? 'mateo'
        : 'elena') +
      '-raw.mp3'
  );
  const masterVoice = path.join(
    audioDir,
    'scene-005-shot-' +
      String(shot.order).padStart(2, '0') +
      '-master.wav'
  );

  if (!(await exists(rawVoice))) {
    const estimate = estimateOperationCost(
      'voice',
      voiceCostUnits(shot.spokenText)
    );
    if (estimate > SCENE5_MAX_VOICE_USD_V6) {
      throw new Error(
        'SAFE COST GATE voz E5/T' +
          shot.order +
          ': US$' +
          estimate.toFixed(4)
      );
    }

    const spendKey =
      'v6safe:e5:t' +
      shot.order +
      ':voice:' +
      character.voiceId +
      ':1';

    await assertRetryAvailable(
      project.id,
      spendKey,
      'voz E5/T' + shot.order
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
      await withPaidGate(() =>
        generateSpeech(
          shot.spokenText,
          character.voiceInstructions,
          rawVoice,
          character.voiceId
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
      'E5/T' +
        shot.order +
        ': voz ' +
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
    'Los niños deben verse inequívocamente como niños de sus edades definidas; nada de rasgos adolescentes o adultos.',
    'Nadie habla. Bocas relajadas y sin movimientos de habla.',
    'Una sola acción física dominante; prohibidos loops, repetición del abrazo, morphing facial, manos duplicadas o personas extra.',
    'Cámara: ' + shot.camera,
    'Sin texto, subtítulos, logos ni marcas de agua.'
  ].join(' ').slice(0, 1900);
}

function buildDialoguePrompt(shot: FilmShot) {
  const speaker =
    shot.speakerId === SCENE5_MATEO_ID_V6
      ? 'Mateo, niño latino de 7 años'
      : 'Elena, mujer latina adulta de 36 años';

  return [
    '[Image 1] fija la continuidad del espacio, iluminación, vestuario, eje y composición del plano inmediatamente anterior.',
    '[Image 2] fija de manera estricta la identidad facial, edad, piel, cabello y proporciones de ' + speaker + '.',
    shot.visualPrompt,
    speaker + ' es la única persona que habla.',
    'El audio de referencia contiene exactamente su frase.',
    'Sincronizar con precisión labios, mandíbula y expresión facial con cada fonema y pausa.',
    'La boca del hablante permanece visible durante toda la frase.',
    'No alterar identidad, edad ni género del hablante.',
    'Los demás personajes, si aparecen, permanecen en silencio y no mueven los labios como si hablaran.',
    'Una sola toma cinematográfica continua de ' + shot.durationSeconds + ' segundos.',
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
      'Las APIs generales deben iniciar bloqueadas. La ruta E5 abre únicamente cada llamada autorizada.'
    );
  }

  const scene4 = sceneByOrder(project, 4);
  if (
    scene4.status !== 'ready' ||
    !scene4.videoAsset ||
    !scene4.qualityOverrideApproved
  ) {
    throw new Error(
      'Escena 4 debe estar aprobada/congelada antes de producir Escena 5.'
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
    restoreEnv(
      'ALLOW_EXTERNAL_API_CALLS',
      oldExternal
    );
    restoreEnv(
      'ALLOW_PAID_GENERATION',
      oldPaid
    );
    restoreEnv(
      'ALLOW_PAID_PROVIDER_FALLBACK',
      oldFallback
    );
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
    throw new Error(
      'No existe Escena ' + order + '.'
    );
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
    throw new Error(
      'No existe E5/T' + order + '.'
    );
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
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : String(error);
}
