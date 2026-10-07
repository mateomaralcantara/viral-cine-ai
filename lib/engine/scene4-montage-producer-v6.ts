import { access } from 'node:fs/promises';
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
  concatenate,
  createSilenceAudio,
  extractLastFrame,
  normalizeGeneratedVideo
} from '@/lib/media/ffmpeg';
import {
  assertCinematicSceneVideo
} from '@/lib/media/probe';
import { generateSpeech } from '@/lib/providers/openai-media';
import {
  generateRunwayGrokLiteFromEnvironment,
  grokLiteImageToVideoCredits,
  imageFileToDataUri
} from '@/lib/providers/runway-router-v6';
import {
  appendSpend,
  estimateOperationCost,
  latestSpendForKey,
  voiceCostUnits
} from '@/lib/engine/spend-ledger';
import {
  renderedAssets,
  saveSceneCheckpoint,
  saveShotCheckpoint
} from '@/lib/engine/scene-checkpoints';
import {
  planScene4MontageV6,
  validateScene4MontageV6,
  SCENE4_NARRATION_V6
} from '@/lib/engine/scene4-montage-plan-v6';
import { applyFifteenDaysCoreVoiceLocksV5 } from '@/lib/engine/fifteen-days-voice-lock-v5';

const MODEL = 'grok_imagine_1_5_lite' as const;
const RATIO = 'auto_720p' as const;
const MAX_CREDITS_PER_SHOT = 19;
const MAX_SCENE_VIDEO_CREDITS = 95;
const MAX_VOICE_USD = 0.01;

export type Scene4MontageResultV6 = {
  projectId: string;
  sceneVideo: string;
  runwayCredits: number;
  runwayUsd: number;
};

export async function produceScene4MontageV6(
  projectId: string
): Promise<Scene4MontageResultV6> {
  let project = await getProject(projectId);
  assertProjectReady(project);

  applyFifteenDaysCoreVoiceLocksV5(project);
  planScene4MontageV6(project);
  validateScene4MontageV6(project);
  project = await saveProject(project);

  const scene3 = sceneByOrder(project, 3);
  const scene4 = sceneByOrder(project, 4);

  if (!scene3.videoAsset) {
    throw new Error('Escena 3 aprobada no tiene video final.');
  }

  let previousVideo = assetAbsolutePath(project.id, scene3.videoAsset);
  await access(previousVideo);

  scene4.status = 'rendering';
  scene4.error = undefined;
  project.status = 'producing';
  project.error = undefined;
  project.productionLog.push(
    new Date().toISOString() +
      ' ViralCine 6 Safe: Escena 4 inicia montaje 5x6s con Grok Lite, personajes en silencio y una sola narración en off.'
  );
  project = await saveProject(project);

  const narrationPath = await ensureSceneNarration(project.id);
  const silencePath = path.join(
    projectAssetDir(project.id, 'audio'),
    'scene-004-silence-6s.mp3'
  );

  if (!(await exists(silencePath))) {
    await createSilenceAudio(6, silencePath);
  }

  let totalCredits = 0;

  for (const order of [1, 2, 3, 4, 5]) {
    project = await getProject(project.id);
    const currentScene = sceneByOrder(project, 4);
    const shot = shotByOrder(currentScene, order);

    if (shot.status === 'ready' && shot.videoAsset) {
      const current = assetAbsolutePath(project.id, shot.videoAsset);
      if (await exists(current)) {
        previousVideo = current;
        console.log(
          'E4/T' + order + ': checkpoint existente; se reutiliza sin gasto.'
        );
        continue;
      }
    }

    const key =
      'scene-004-shot-' + String(order).padStart(2, '0');
    const refPath = path.join(
      projectAssetDir(project.id, 'images'),
      key + '-continuity-ref.jpg'
    );

    if (!(await exists(refPath))) {
      await extractLastFrame(
        previousVideo,
        refPath,
        project.input.aspectRatio
      );
    }

    const rawPath = path.join(
      projectAssetDir(project.id, 'video'),
      key + '-grok-lite-raw.mp4'
    );
    const finalPath = path.join(
      projectAssetDir(project.id, 'video'),
      key + '.mp4'
    );

    const directCredits = grokLiteImageToVideoCredits(
      shot.durationSeconds,
      RATIO
    );

    if (directCredits !== MAX_CREDITS_PER_SHOT) {
      throw new Error(
        'SAFE COST GATE E4/T' +
          order +
          ': costo inesperado ' +
          directCredits +
          ' créditos.'
      );
    }

    const spendKey =
      'v6safe:e4:t' + order + ':grok-lite:1';
    const previousSpend = await latestSpendForKey(
      project.id,
      spendKey
    );

    let chargedCredits = 0;

    if (
      previousSpend?.state === 'succeeded' &&
      await exists(rawPath)
    ) {
      console.log(
        'E4/T' +
          order +
          ': Runway ya figura succeeded y raw existe; se reconcilia/reutiliza sin nueva llamada.'
      );
      chargedCredits = 0;
    } else {
      if (
        previousSpend &&
        ['submitted', 'succeeded', 'failed-unknown', 'reconciled'].includes(
          previousSpend.state
        )
      ) {
        throw new Error(
          'SAFE RETRY BLOCK E4/T' +
            order +
            ': estado previo=' +
            previousSpend.state +
            '. No se reintentará automáticamente.'
        );
      }

      if (totalCredits + directCredits > MAX_SCENE_VIDEO_CREDITS) {
        throw new Error(
          'SAFE COST GATE: esta ejecución superaría ' +
            MAX_SCENE_VIDEO_CREDITS +
            ' créditos.'
        );
      }

      console.log(
        '\n--- E4/T' +
          order +
          ' · ' +
          shot.title +
          ' ---'
      );
      console.log('Modelo: ' + MODEL);
      console.log('Duración: 6s');
      console.log(
        'Máximo: ' +
          directCredits +
          ' créditos = US$' +
          (directCredits * 0.01).toFixed(2)
      );

      await appendSpend(project.id, {
        operation: 'video',
        provider: 'runway-direct',
        model: MODEL,
        state: 'submitted',
        estimatedUsd: directCredits * 0.01,
        sceneId: currentScene.id,
        shotId: shot.id,
        idempotencyKey: spendKey
      });

      let generated;
      try {
        generated = await generateRunwayGrokLiteFromEnvironment(
          {
            model: MODEL,
            promptImage: await imageFileToDataUri(refPath),
            promptText: buildShotPrompt(shot),
            ratio: RATIO,
            duration: shot.durationSeconds
          },
          rawPath
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        const taskId =
          message.match(/taskId=([0-9a-f-]{36})/i)?.[1];

        await appendSpend(project.id, {
          operation: 'video',
          provider: 'runway-direct',
          model: MODEL,
          state: 'failed-unknown',
          estimatedUsd: directCredits * 0.01,
          sceneId: currentScene.id,
          shotId: shot.id,
          idempotencyKey: spendKey,
          providerRequestId: taskId,
          error: message
        });

        throw error;
      }

      if (generated.credits > MAX_CREDITS_PER_SHOT) {
        throw new Error(
          'Runway reportó ' +
            generated.credits +
            ' créditos para E4/T' +
            order +
            '; supera el máximo esperado.'
        );
      }

      chargedCredits = generated.credits;
      totalCredits += chargedCredits;

      await appendSpend(project.id, {
        operation: 'video',
        provider: 'runway-direct',
        model: generated.model,
        state: 'succeeded',
        estimatedUsd: directCredits * 0.01,
        actualUsd: chargedCredits * 0.01,
        sceneId: currentScene.id,
        shotId: shot.id,
        idempotencyKey: spendKey,
        providerRequestId: generated.taskId,
        outputAsset: assetRelativePath(project.id, rawPath)
      });
    }

    await normalizeGeneratedVideo(
      rawPath,
      silencePath,
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
    const saveScene = sceneByOrder(project, 4);
    const saveShot = shotByOrder(saveScene, order);

    saveShot.imageAsset = assetRelativePath(project.id, refPath);
    saveShot.voiceAsset = assetRelativePath(project.id, silencePath);
    saveShot.baseVideoAsset = assetRelativePath(project.id, rawPath);
    saveShot.videoAsset = assetRelativePath(project.id, finalPath);
    saveShot.lipSyncAsset = undefined;
    saveShot.status = 'ready';
    saveShot.error = undefined;
    saveShot.lastProvider =
      'Runway Direct / grok_imagine_1_5_lite';
    saveShot.lastGenerationState = 'succeeded';
    saveShot.generationCount =
      (saveShot.generationCount || 0) + (chargedCredits > 0 ? 1 : 0);
    saveShot.estimatedSpendUsd =
      (saveShot.estimatedSpendUsd || 0) +
      chargedCredits * 0.01;
    saveShot.pipelineVersion =
      '6.0-scene4-silent-montage';

    const shotAssets = renderedAssets(
      project.id,
      saveShot.mode,
      refPath,
      silencePath,
      finalPath
    );

    await saveShotCheckpoint(
      project,
      saveScene,
      saveShot,
      shotAssets
    );

    project.productionLog.push(
      new Date().toISOString() +
        ' ViralCine 6 Safe: E4/T' +
        order +
        ' lista · Grok Lite · diálogo visible NO · lip-sync NO.'
    );

    project = await saveProject(project);
    previousVideo = finalPath;
  }

  project = await getProject(project.id);
  const finalScene = sceneByOrder(project, 4);

  const clips = [...finalScene.shots]
    .sort((a, b) => a.order - b.order)
    .map((shot) => {
      if (!shot.videoAsset) {
        throw new Error(
          'E4/T' + shot.order + ' no tiene video final.'
        );
      }
      return assetAbsolutePath(project.id, shot.videoAsset);
    });

  const silentScene = path.join(
    projectAssetDir(project.id, 'video'),
    'scene-004-silent.mp4'
  );
  const sceneVideo = path.join(
    projectAssetDir(project.id, 'video'),
    'scene-004.mp4'
  );

  await concatenate(clips, silentScene);

  await normalizeGeneratedVideo(
    silentScene,
    narrationPath,
    30,
    sceneVideo,
    project.input.aspectRatio
  );

  await assertCinematicSceneVideo(
    sceneVideo,
    30,
    { requireMotion: true, requireAudibleAudio: true }
  );

  const representative = finalScene.shots[0];
  if (!representative?.imageAsset) {
    throw new Error('Escena 4 no tiene imagen representativa.');
  }

  finalScene.imageAsset = representative.imageAsset;
  finalScene.voiceAsset = assetRelativePath(
    project.id,
    narrationPath
  );
  finalScene.videoAsset = assetRelativePath(
    project.id,
    sceneVideo
  );
  finalScene.status = 'review-required';
  finalScene.error = undefined;
  finalScene.productionStrategy = 'real-cinema-v2';

  project.status = 'quality-review';
  project.error = undefined;
  project.progress = {
    phase: 'quality-review',
    percent: 60,
    message:
      'Escena 4 “Quince días” generada como montaje 5x6s con narración en off. Revisión humana requerida.',
    currentScene: 4,
    totalScenes: project.plan!.scenes.length,
    updatedAt: new Date().toISOString()
  };

  project.productionLog.push(
    new Date().toISOString() +
      ' ViralCine 6 Safe: Escena 4 compuesta en 30s; cinco tomas silenciosas + una narración femenina en off; sin lip-sync, música, Fal ni fallback pagado.'
  );

  const sceneAssets = renderedAssets(
    project.id,
    finalScene.mode,
    assetAbsolutePath(project.id, finalScene.imageAsset),
    narrationPath,
    sceneVideo
  );

  await saveSceneCheckpoint(
    project,
    finalScene,
    sceneAssets
  );

  project = await saveProject(project);

  return {
    projectId: project.id,
    sceneVideo,
    runwayCredits: totalCredits,
    runwayUsd: totalCredits * 0.01
  };
}

async function ensureSceneNarration(projectId: string) {
  let project = await getProject(projectId);
  const scene = sceneByOrder(project, 4);

  const outputPath = path.join(
    projectAssetDir(project.id, 'audio'),
    'scene-004-narration-marin.mp3'
  );

  if (await exists(outputPath)) return outputPath;

  const estimate = estimateOperationCost(
    'voice',
    voiceCostUnits(SCENE4_NARRATION_V6)
  );

  if (estimate > MAX_VOICE_USD) {
    throw new Error(
      'SAFE COST GATE VOZ E4: estimación US$' +
        estimate.toFixed(4) +
        ' supera US$0.01.'
    );
  }

  const spendKey = 'v6safe:e4:narration:marin:1';
  const previous = await latestSpendForKey(
    project.id,
    spendKey
  );

  if (
    previous &&
    ['submitted', 'succeeded', 'failed-unknown', 'reconciled'].includes(
      previous.state
    )
  ) {
    throw new Error(
      'SAFE RETRY BLOCK narración E4: estado=' +
        previous.state +
        '.'
    );
  }

  await appendSpend(project.id, {
    operation: 'voice',
    provider: 'openai',
    model:
      process.env.OPENAI_TTS_MODEL ||
      'gpt-4o-mini-tts',
    state: 'submitted',
    estimatedUsd: estimate,
    sceneId: scene.id,
    idempotencyKey: spendKey
  });

  const oldExternal =
    process.env.ALLOW_EXTERNAL_API_CALLS;
  const oldPaid =
    process.env.ALLOW_PAID_GENERATION;

  try {
    process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
    process.env.ALLOW_PAID_GENERATION = 'true';

    await generateSpeech(
      SCENE4_NARRATION_V6,
      [
        'Español latino natural.',
        'Voz femenina adulta de Elena, íntima, cálida y claramente femenina.',
        'Narración en off, no diálogo frente a cámara.',
        'Decir exactamente el texto recibido.',
        'No traducir, no parafrasear, no agregar ni omitir palabras.',
        'Interpretación cinematográfica contenida; empieza reflexiva y termina con una pequeña señal de determinación.',
        'No usar timbre masculino, andrógino ni de locutor publicitario.'
      ].join(' '),
      outputPath,
      'marin'
    );

    await appendSpend(project.id, {
      operation: 'voice',
      provider: 'openai',
      model:
        process.env.OPENAI_TTS_MODEL ||
        'gpt-4o-mini-tts',
      state: 'succeeded',
      estimatedUsd: estimate,
      sceneId: scene.id,
      idempotencyKey: spendKey,
      outputAsset: assetRelativePath(project.id, outputPath)
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
      idempotencyKey: spendKey,
      error:
        error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    restoreEnv('ALLOW_EXTERNAL_API_CALLS', oldExternal);
    restoreEnv('ALLOW_PAID_GENERATION', oldPaid);
  }

  return outputPath;
}

function buildShotPrompt(shot: FilmShot) {
  return [
    shot.visualPrompt.trim(),
    'La persona visible conserva exactamente identidad facial, edad, tono de piel y rasgos del primer frame.',
    'Montaje de progreso realista; no transformar mágicamente el rostro, cuerpo ni ropa.',
    'Nadie habla frente a cámara. Bocas relajadas y sin movimientos de habla.',
    'Una sola acción dominante durante los seis segundos.',
    'Cámara: ' + shot.camera.trim(),
    'Sin texto legible, subtítulos, logotipos ni marcas de agua.',
    'Sin voz, diálogo ni música generada dentro del video.'
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 1900);
}

function assertProjectReady(project: FilmProject) {
  if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
    throw new Error('Este productor solo está autorizado para 15 DÍAS.');
  }

  if (
    process.env.ALLOW_EXTERNAL_API_CALLS === 'true' ||
    process.env.ALLOW_PAID_GENERATION === 'true' ||
    process.env.ALLOW_PAID_PROVIDER_FALLBACK === 'true'
  ) {
    throw new Error(
      'Las APIs legacy deben permanecer bloqueadas en .env.local.'
    );
  }

  const scene3 = project.plan?.scenes.find(
    (item) => item.order === 3
  );
  if (!scene3 || scene3.status !== 'ready') {
    throw new Error(
      'La Escena 3 debe estar aprobada/ready antes de producir Escena 4.'
    );
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
    throw new Error('No existe E4/T' + order + '.');
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

export const SCENE4_SAFE_MAX_USD_V6 =
  MAX_SCENE_VIDEO_CREDITS * 0.01 + MAX_VOICE_USD;
