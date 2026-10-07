import { access } from 'node:fs/promises';
import path from 'node:path';
import type { Character, FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import {
  assetAbsolutePath,
  assetRelativePath,
  getProject,
  projectAssetDir,
  saveProject
} from '@/lib/storage/project-store';
import {
  generateImage,
  generateImageWithReferences,
  generateSpeech
} from '@/lib/providers/openai-media';
import {
  audioFileToDataUri,
  generateRunwayGrok15AudioDrivenFromEnvironment,
  generateRunwayGrokLiteFromEnvironment,
  grok15AudioDrivenCredits,
  grokLiteImageToVideoCredits,
  imageFileToDataUri
} from '@/lib/providers/runway-router-v6';
import {
  concatenate,
  createSilenceAudio,
  extractLastFrame,
  normalizeReferenceImage,
  normalizeGeneratedVideo,
  normalizeGeneratedVideoWithEmbeddedAudio
} from '@/lib/media/ffmpeg';
import {
  assertCinematicSceneVideo,
  probeVideo
} from '@/lib/media/probe';
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
  planScene3SynchronizedV6,
  validateScene3SynchronizedV6,
  SCENE3_DIALOGUE_V6,
  SCENE3_ELENA_ID_V6,
  SCENE3_MARIANA_ID_V6
} from '@/lib/engine/scene3-sync-plan-v6';
import { applyFifteenDaysCoreVoiceLocksV5 } from '@/lib/engine/fifteen-days-voice-lock-v5';

const MAX_LITE_CREDITS = 25;
const MAX_DIALOGUE_CREDITS = 131;
const MAX_SCENE_CREDITS = 181;
const MAX_IMAGE_USD = 0.08;
const MAX_VOICE_USD = 0.01;

export type Scene3SynchronizedResult = {
  projectId: string;
  sceneVideo: string;
  runwayCredits: number;
  runwayUsd: number;
};

export async function produceScene3SynchronizedV6(
  projectId: string
): Promise<Scene3SynchronizedResult> {
  let project = await getProject(projectId);
  assertProjectReady(project);

  applyFifteenDaysCoreVoiceLocksV5(project);
  planScene3SynchronizedV6(project);
  validateScene3SynchronizedV6(project);
  project = await saveProject(project);

  const scene2 = project.plan!.scenes.find((item) => item.order === 2)!;
  const scene3 = project.plan!.scenes.find((item) => item.order === 3)!;
  const elena = character(project, SCENE3_ELENA_ID_V6);
  const mariana = character(project, SCENE3_MARIANA_ID_V6);

  const scene2Video = scene2.videoAsset
    ? assetAbsolutePath(project.id, scene2.videoAsset)
    : undefined;
  if (!scene2Video || !(await exists(scene2Video))) {
    throw new Error('La Escena 2 aprobada no tiene video local para continuidad.');
  }

  const elenaRef = await requireExistingCharacterReference(project, elena);
  const marianaRef = await ensureMarianaReference(project, mariana);

  project = await getProject(project.id);
  const liveScene3 = project.plan!.scenes.find((item) => item.order === 3)!;
  liveScene3.status = 'rendering';
  liveScene3.error = undefined;
  project.status = 'producing';
  project.error = undefined;
  project.productionLog.push(
    new Date().toISOString() +
      ' ViralCine 6 Safe: Escena 3 inicia arquitectura audio-driven: plan -> voz -> video condicionado por audio -> audio embebido preservado -> composición local.'
  );
  project = await saveProject(project);

  const continuityFrame = path.join(
    projectAssetDir(project.id, 'images'),
    'scene-003-continuity-from-scene2.jpg'
  );
  if (!(await exists(continuityFrame))) {
    await extractLastFrame(
      scene2Video,
      continuityFrame,
      project.input.aspectRatio
    );
  }

  const t1 = await produceSetupShot(
    project.id,
    elenaRef,
    marianaRef,
    continuityFrame
  );

  const t1LastFrame = path.join(
    projectAssetDir(project.id, 'images'),
    'scene-003-shot-01-last.jpg'
  );
  await extractLastFrame(
    t1,
    t1LastFrame,
    project.input.aspectRatio
  );

  const t2 = await produceDialogueShot(
    project.id,
    marianaRef,
    t1LastFrame
  );

  const t3 = await produceReactionShot(
    project.id,
    t1LastFrame
  );

  project = await getProject(project.id);
  const finalScene = project.plan!.scenes.find((item) => item.order === 3)!;
  const clips = [t1, t2, t3];

  const sceneVideo = path.join(
    projectAssetDir(project.id, 'video'),
    'scene-003.mp4'
  );
  await concatenate(clips, sceneVideo);
  await assertCinematicSceneVideo(
    sceneVideo,
    24,
    { requireMotion: true, requireAudibleAudio: true }
  );

  const speakingShot = finalScene.shots.find((shot) => shot.order === 2)!;
  const representativeShot =
    finalScene.shots.find((shot) => shot.order === 1)!;

  if (!representativeShot.imageAsset || !speakingShot.voiceAsset) {
    throw new Error('Escena 3 no tiene assets representativos completos.');
  }

  finalScene.imageAsset = representativeShot.imageAsset;
  finalScene.voiceAsset = speakingShot.voiceAsset;
  finalScene.videoAsset = assetRelativePath(project.id, sceneVideo);
  finalScene.status = 'review-required';
  finalScene.error = undefined;
  finalScene.productionStrategy = 'real-cinema-v2';

  project.status = 'quality-review';
  project.error = undefined;
  project.progress = {
    phase: 'quality-review',
    percent: 45,
    message:
      'Escena 3 generada con diálogo audio-driven. Revisar sincronía boca/voz y actuación de Mariana.',
    currentScene: 3,
    totalScenes: project.plan!.scenes.length,
    updatedAt: new Date().toISOString()
  };
  project.productionLog.push(
    new Date().toISOString() +
      ' ViralCine 6 Safe: Escena 3 compuesta en 24s. T2 conserva el audio embebido generado junto al movimiento facial; MP3 externo NO fue reinsertado.'
  );

  const sceneAssets = renderedAssets(
    project.id,
    finalScene.mode,
    assetAbsolutePath(project.id, finalScene.imageAsset),
    assetAbsolutePath(project.id, finalScene.voiceAsset),
    sceneVideo
  );
  await saveSceneCheckpoint(project, finalScene, sceneAssets);
  project = await saveProject(project);

  const credits =
    grokLiteImageToVideoCredits(8, 'auto_720p') +
    grok15AudioDrivenCredits(8, '720p', 2, 1) +
    grokLiteImageToVideoCredits(8, 'auto_720p');

  return {
    projectId: project.id,
    sceneVideo,
    runwayCredits: credits,
    runwayUsd: credits * 0.01
  };
}

async function produceSetupShot(
  projectId: string,
  elenaRef: string,
  marianaRef: string,
  continuityFrame: string
) {
  let project = await getProject(projectId);
  const scene = scene3(project);
  const shot = shotByOrder(scene, 1);

  if (shot.status === 'ready' && shot.videoAsset) {
    const current = assetAbsolutePath(project.id, shot.videoAsset);
    if (await exists(current)) return current;
  }

  const key = 'scene-003-shot-01';
  const rawImagePath = path.join(
    projectAssetDir(project.id, 'images'),
    key + '-openai-raw.png'
  );
  const imagePath = path.join(
    projectAssetDir(project.id, 'images'),
    key + '.png'
  );

  if (!(await exists(rawImagePath))) {
    await authorizedOpenAIImage(
      project,
      scene,
      shot,
      'v6safe:e3:t1:composite-image',
      rawImagePath,
      async () => {
        await generateImageWithReferences(
          [elenaRef, marianaRef, continuityFrame],
          [
            shot.visualPrompt,
            'Crear un único frame cinematográfico horizontal que mantenga exactamente a Elena y Mariana según sus referencias.',
            'La geografía, luz y entorno deben continuar desde la tercera referencia.',
            'Mariana se ha sentado a distancia respetuosa de Elena.',
            'Nadie está hablando. Bocas relajadas y cerradas de forma natural.',
            'Sin texto, subtítulos, logos ni marcas de agua.'
          ].join(' '),
          rawImagePath
        );
      }
    );
  }

  if (!(await exists(imagePath))) {
    await normalizeReferenceImage(
      rawImagePath,
      imagePath,
      project.input.aspectRatio
    );
  }

  const silencePath = path.join(
    projectAssetDir(project.id, 'audio'),
    key + '.mp3'
  );
  if (!(await exists(silencePath))) {
    await createSilenceAudio(8, silencePath);
  }

  const rawPath = path.join(
    projectAssetDir(project.id, 'video'),
    key + '-grok-lite-raw.mp4'
  );
  const finalPath = path.join(
    projectAssetDir(project.id, 'video'),
    key + '.mp4'
  );

  if (!(await exists(rawPath))) {
    const credits = grokLiteImageToVideoCredits(8, 'auto_720p');
    if (credits > MAX_LITE_CREDITS) {
      throw new Error('SAFE COST GATE T1: Grok Lite supera 25 créditos.');
    }
    const spendKey = 'v6safe:e3:t1:grok-lite:1';
    await assertSpendAvailable(project.id, spendKey, rawPath);
    await appendSpend(project.id, {
      operation: 'video',
      provider: 'runway-direct',
      model: 'grok_imagine_1_5_lite',
      state: 'submitted',
      estimatedUsd: credits * 0.01,
      sceneId: scene.id,
      shotId: shot.id,
      idempotencyKey: spendKey
    });
    try {
      const generated = await generateRunwayGrokLiteFromEnvironment(
        {
          model: 'grok_imagine_1_5_lite',
          promptImage: await imageFileToDataUri(imagePath),
          promptText: [
            shot.visualPrompt,
            'Movimiento corporal sutil y natural. Elena sigue escribiendo; Mariana termina de sentarse.',
            'Nadie habla. No animar habla ni conversación.',
            'Una sola toma continua. Sin texto ni subtítulos.'
          ].join(' '),
          ratio: 'auto_720p',
          duration: 8
        },
        rawPath
      );
      await appendSpend(project.id, {
        operation: 'video',
        provider: 'runway-direct',
        model: generated.model,
        state: 'succeeded',
        estimatedUsd: credits * 0.01,
        actualUsd: generated.credits * 0.01,
        sceneId: scene.id,
        shotId: shot.id,
        idempotencyKey: spendKey,
        providerRequestId: generated.taskId,
        outputAsset: assetRelativePath(project.id, rawPath)
      });
    } catch (error) {
      await recordUnknownVideoFailure(project, scene, shot, spendKey, 'grok_imagine_1_5_lite', credits, error);
      throw error;
    }
  }

  await normalizeGeneratedVideo(
    rawPath,
    silencePath,
    8,
    finalPath,
    project.input.aspectRatio
  );
  await assertCinematicSceneVideo(finalPath, 8, { requireMotion: true });

  await markShotReady(project.id, 1, {
    imagePath,
    voicePath: silencePath,
    rawPath,
    finalPath,
    provider: 'Runway Direct / grok_imagine_1_5_lite',
    pipelineVersion: '6.0-safe-scene3-setup',
    spendUsd: 0.25
  });

  return finalPath;
}

async function produceDialogueShot(
  projectId: string,
  marianaRef: string,
  sceneContinuityFrame: string
) {
  let project = await getProject(projectId);
  const scene = scene3(project);
  const shot = shotByOrder(scene, 2);

  if (shot.status === 'ready' && shot.videoAsset) {
    const current = assetAbsolutePath(project.id, shot.videoAsset);
    if (await exists(current)) return current;
  }

  const key = 'scene-003-shot-02';
  const voicePath = path.join(
    projectAssetDir(project.id, 'audio'),
    key + '-mariana-cedar.mp3'
  );

  if (!(await exists(voicePath))) {
    const estimate = estimateOperationCost(
      'voice',
      voiceCostUnits(SCENE3_DIALOGUE_V6)
    );
    if (estimate > MAX_VOICE_USD) {
      throw new Error(
        'SAFE COST GATE VOZ: estimación US$' +
          estimate.toFixed(4) +
          ' supera US$0.01.'
      );
    }

    const spendKey = 'v6safe:e3:t2:voice:cedar:1';
    await assertSpendAvailable(project.id, spendKey, voicePath);
    await appendSpend(project.id, {
      operation: 'voice',
      provider: 'openai',
      model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
      state: 'submitted',
      estimatedUsd: estimate,
      sceneId: scene.id,
      shotId: shot.id,
      characterId: SCENE3_MARIANA_ID_V6,
      idempotencyKey: spendKey
    });

    try {
      await withLegacyPaidGate(async () => {
        await generateSpeech(
          SCENE3_DIALOGUE_V6,
          [
            'Español latino natural.',
            'Voz femenina madura, calmada, clara y cálida, con autoridad tranquila.',
            'Habla exactamente el texto recibido.',
            'No traduzcas, no parafrasees, no agregues, no omitas ni sustituyas palabras.',
            'Debe caber naturalmente dentro de ocho segundos.',
            'Sin tono publicitario ni melodramático.'
          ].join(' '),
          voicePath,
          'cedar'
        );
      });

      await appendSpend(project.id, {
        operation: 'voice',
        provider: 'openai',
        model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
        state: 'succeeded',
        estimatedUsd: estimate,
        sceneId: scene.id,
        shotId: shot.id,
        characterId: SCENE3_MARIANA_ID_V6,
        idempotencyKey: spendKey,
        outputAsset: assetRelativePath(project.id, voicePath)
      });
    } catch (error) {
      await appendSpend(project.id, {
        operation: 'voice',
        provider: 'openai',
        model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
        state: 'failed-unknown',
        estimatedUsd: estimate,
        sceneId: scene.id,
        shotId: shot.id,
        characterId: SCENE3_MARIANA_ID_V6,
        idempotencyKey: spendKey,
        error: errorText(error)
      });
      throw error;
    }
  }

  const voiceProbe = await probeVideo(voicePath);
  if (!voiceProbe.hasAudio || voiceProbe.durationSeconds < 3 || voiceProbe.durationSeconds > 8) {
    throw new Error(
      'VOZ T2 FUERA DE RANGO: duración=' +
        voiceProbe.durationSeconds.toFixed(3) +
        's. Debe quedar entre 3 y 8s antes de generar el video; Runway NO fue llamado.'
    );
  }

  const rawPath = path.join(
    projectAssetDir(project.id, 'video'),
    key + '-grok-audio-driven-raw.mp4'
  );
  const finalPath = path.join(
    projectAssetDir(project.id, 'video'),
    key + '.mp4'
  );

  if (!(await exists(rawPath))) {
    const credits = grok15AudioDrivenCredits(8, '720p', 2, 1);
    if (credits !== MAX_DIALOGUE_CREDITS) {
      throw new Error(
        'SAFE COST GATE T2: costo inesperado ' + credits + ' créditos.'
      );
    }
    const spendKey = 'v6safe:e3:t2:grok15-audio-driven:1';
    await assertSpendAvailable(project.id, spendKey, rawPath);

    await appendSpend(project.id, {
      operation: 'video',
      provider: 'runway-direct',
      model: 'grok_imagine_1_5',
      state: 'submitted',
      estimatedUsd: credits * 0.01,
      sceneId: scene.id,
      shotId: shot.id,
      idempotencyKey: spendKey
    });

    try {
      const generated = await generateRunwayGrok15AudioDrivenFromEnvironment(
        {
          model: 'grok_imagine_1_5',
          promptText: [
            '[Image 1] define exactamente el rostro, edad, cabello y vestuario de Mariana.',
            '[Image 2] define la calle, iluminación, encuadre y continuidad de la escena.',
            'Mariana es la única persona que habla.',
            'Su boca, labios y mandíbula permanecen visibles durante todo el parlamento.',
            'La interpretación facial y los movimientos de boca deben seguir el audio de referencia exactamente, palabra por palabra.',
            'Elena, si aparece, permanece completamente en silencio y no mueve los labios como si hablara.',
            'Plano medio corto frontal, leve push-in continuo, sin cortes.',
            'No generar voz adicional, música, texto, subtítulos, logos ni marcas de agua.'
          ].join(' '),
          duration: 8,
          ratio: '16:9',
          resolution: '720p',
          references: [
            { uri: await imageFileToDataUri(marianaRef) },
            { uri: await imageFileToDataUri(sceneContinuityFrame) }
          ],
          referenceAudio: [
            {
              type: 'audio',
              uri: await audioFileToDataUri(voicePath)
            }
          ]
        },
        rawPath
      );

      await appendSpend(project.id, {
        operation: 'video',
        provider: 'runway-direct',
        model: generated.model,
        state: 'succeeded',
        estimatedUsd: credits * 0.01,
        actualUsd: generated.credits * 0.01,
        sceneId: scene.id,
        shotId: shot.id,
        idempotencyKey: spendKey,
        providerRequestId: generated.taskId,
        outputAsset: assetRelativePath(project.id, rawPath)
      });
    } catch (error) {
      await recordUnknownVideoFailure(project, scene, shot, spendKey, 'grok_imagine_1_5', credits, error);
      throw error;
    }
  }

  const rawProbe = await probeVideo(rawPath);
  if (!rawProbe.hasAudio) {
    throw new Error(
      'Grok audio-driven devolvió video sin audio embebido. No se publicará la toma.'
    );
  }

  await normalizeGeneratedVideoWithEmbeddedAudio(
    rawPath,
    8,
    finalPath,
    project.input.aspectRatio
  );
  await assertCinematicSceneVideo(
    finalPath,
    8,
    { requireMotion: true, requireAudibleAudio: true }
  );

  await markShotReady(project.id, 2, {
    imagePath: sceneContinuityFrame,
    voicePath,
    rawPath,
    lipSyncPath: rawPath,
    finalPath,
    provider: 'Runway Direct / grok_imagine_1_5 audio-driven',
    pipelineVersion: '6.0-audio-driven-lipsync',
    spendUsd: MAX_DIALOGUE_CREDITS * 0.01
  });

  return finalPath;
}

async function produceReactionShot(
  projectId: string,
  firstFrame: string
) {
  let project = await getProject(projectId);
  const scene = scene3(project);
  const shot = shotByOrder(scene, 3);

  if (shot.status === 'ready' && shot.videoAsset) {
    const current = assetAbsolutePath(project.id, shot.videoAsset);
    if (await exists(current)) return current;
  }

  const key = 'scene-003-shot-03';
  const silencePath = path.join(
    projectAssetDir(project.id, 'audio'),
    key + '.mp3'
  );
  if (!(await exists(silencePath))) {
    await createSilenceAudio(8, silencePath);
  }

  const rawPath = path.join(
    projectAssetDir(project.id, 'video'),
    key + '-grok-lite-raw.mp4'
  );
  const finalPath = path.join(
    projectAssetDir(project.id, 'video'),
    key + '.mp4'
  );

  if (!(await exists(rawPath))) {
    const credits = grokLiteImageToVideoCredits(8, 'auto_720p');
    if (credits > MAX_LITE_CREDITS) {
      throw new Error('SAFE COST GATE T3: Grok Lite supera 25 créditos.');
    }
    const spendKey = 'v6safe:e3:t3:grok-lite:1';
    await assertSpendAvailable(project.id, spendKey, rawPath);
    await appendSpend(project.id, {
      operation: 'video',
      provider: 'runway-direct',
      model: 'grok_imagine_1_5_lite',
      state: 'submitted',
      estimatedUsd: credits * 0.01,
      sceneId: scene.id,
      shotId: shot.id,
      idempotencyKey: spendKey
    });
    try {
      const generated = await generateRunwayGrokLiteFromEnvironment(
        {
          model: 'grok_imagine_1_5_lite',
          promptImage: await imageFileToDataUri(firstFrame),
          promptText: [
            shot.visualPrompt,
            'Elena levanta lentamente la mirada del cuaderno y procesa la propuesta.',
            'Mariana espera en silencio. Ninguna persona habla.',
            'Bocas relajadas, sin movimientos de habla.',
            'Movimiento natural y contenido, una sola toma continua, sin texto.'
          ].join(' '),
          ratio: 'auto_720p',
          duration: 8
        },
        rawPath
      );
      await appendSpend(project.id, {
        operation: 'video',
        provider: 'runway-direct',
        model: generated.model,
        state: 'succeeded',
        estimatedUsd: credits * 0.01,
        actualUsd: generated.credits * 0.01,
        sceneId: scene.id,
        shotId: shot.id,
        idempotencyKey: spendKey,
        providerRequestId: generated.taskId,
        outputAsset: assetRelativePath(project.id, rawPath)
      });
    } catch (error) {
      await recordUnknownVideoFailure(project, scene, shot, spendKey, 'grok_imagine_1_5_lite', credits, error);
      throw error;
    }
  }

  await normalizeGeneratedVideo(
    rawPath,
    silencePath,
    8,
    finalPath,
    project.input.aspectRatio
  );
  await assertCinematicSceneVideo(finalPath, 8, { requireMotion: true });

  await markShotReady(project.id, 3, {
    imagePath: firstFrame,
    voicePath: silencePath,
    rawPath,
    finalPath,
    provider: 'Runway Direct / grok_imagine_1_5_lite',
    pipelineVersion: '6.0-safe-scene3-reaction',
    spendUsd: 0.25
  });

  return finalPath;
}

async function ensureMarianaReference(
  project: FilmProject,
  mariana: Character
) {
  if (mariana.referenceAsset) {
    const current = assetAbsolutePath(project.id, mariana.referenceAsset);
    if (await exists(current)) return current;
  }

  const output = path.join(
    projectAssetDir(project.id, 'images'),
    'character-' + mariana.id + '.png'
  );

  if (!(await exists(output))) {
    const scene = scene3(project);
    const shot = shotByOrder(scene, 1);
    await authorizedOpenAIImage(
      project,
      scene,
      shot,
      'v6safe:e3:mariana-character-image',
      output,
      async () => {
        await generateImage(
          [
            mariana.imagePrompt,
            mariana.appearance,
            'Vestuario: ' + mariana.wardrobe + '.',
            'Referencia limpia de personaje, fondo neutro, rostro frontal y claramente visible.',
            'Sin texto ni logotipo.'
          ].join(' '),
          output
        );
      },
      mariana.id
    );
  }

  const live = await getProject(project.id);
  const liveMariana = character(live, SCENE3_MARIANA_ID_V6);
  liveMariana.referenceAsset = assetRelativePath(live.id, output);
  live.productionLog.push(
    new Date().toISOString() +
      ' ViralCine 6 Safe: referencia visual de Mariana fijada para continuidad de Escena 3.'
  );
  await saveProject(live);
  return output;
}

async function requireExistingCharacterReference(
  project: FilmProject,
  person: Character
) {
  if (!person.referenceAsset) {
    throw new Error(
      person.name +
        ' no tiene referenceAsset. La continuidad existente debe conservarse; no se autoriza recrearla automáticamente.'
    );
  }
  const absolute = assetAbsolutePath(project.id, person.referenceAsset);
  await access(absolute);
  return absolute;
}

async function authorizedOpenAIImage(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot,
  spendKey: string,
  outputPath: string,
  run: () => Promise<void>,
  characterId?: string
) {
  const estimate = estimateOperationCost('image', 1);
  if (estimate > MAX_IMAGE_USD) {
    throw new Error(
      'SAFE COST GATE IMAGEN: estimación US$' +
        estimate.toFixed(4) +
        ' supera US$0.08.'
    );
  }

  await assertSpendAvailable(project.id, spendKey, outputPath);
  await appendSpend(project.id, {
    operation: 'image',
    provider: 'openai',
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
    state: 'submitted',
    estimatedUsd: estimate,
    sceneId: scene.id,
    shotId: shot.id,
    characterId,
    idempotencyKey: spendKey
  });

  try {
    await withLegacyPaidGate(run);
    await appendSpend(project.id, {
      operation: 'image',
      provider: 'openai',
      model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
      state: 'succeeded',
      estimatedUsd: estimate,
      sceneId: scene.id,
      shotId: shot.id,
      characterId,
      idempotencyKey: spendKey,
      outputAsset: assetRelativePath(project.id, outputPath)
    });
  } catch (error) {
    await appendSpend(project.id, {
      operation: 'image',
      provider: 'openai',
      model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
      state: 'failed-unknown',
      estimatedUsd: estimate,
      sceneId: scene.id,
      shotId: shot.id,
      characterId,
      idempotencyKey: spendKey,
      error: errorText(error)
    });
    throw error;
  }
}

async function markShotReady(
  projectId: string,
  order: number,
  input: {
    imagePath: string;
    voicePath: string;
    rawPath: string;
    lipSyncPath?: string;
    finalPath: string;
    provider: string;
    pipelineVersion: string;
    spendUsd: number;
  }
) {
  const project = await getProject(projectId);
  const scene = scene3(project);
  const shot = shotByOrder(scene, order);

  shot.imageAsset = assetRelativePath(project.id, input.imagePath);
  shot.voiceAsset = assetRelativePath(project.id, input.voicePath);
  shot.baseVideoAsset = assetRelativePath(project.id, input.rawPath);
  shot.lipSyncAsset = input.lipSyncPath
    ? assetRelativePath(project.id, input.lipSyncPath)
    : undefined;
  shot.videoAsset = assetRelativePath(project.id, input.finalPath);
  shot.status = 'ready';
  shot.error = undefined;
  shot.lastProvider = input.provider;
  shot.lastGenerationState = 'succeeded';
  shot.generationCount = (shot.generationCount || 0) + 1;
  shot.estimatedSpendUsd =
    (shot.estimatedSpendUsd || 0) + input.spendUsd;
  shot.pipelineVersion = input.pipelineVersion;

  const assets = renderedAssets(
    project.id,
    shot.mode,
    input.imagePath,
    input.voicePath,
    input.finalPath
  );
  await saveShotCheckpoint(project, scene, shot, assets);

  project.productionLog.push(
    new Date().toISOString() +
      ' ViralCine 6 Safe: E3/T' +
      order +
      ' lista · ' +
      input.provider +
      '.'
  );
  await saveProject(project);
}

async function recordUnknownVideoFailure(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot,
  spendKey: string,
  model: string,
  credits: number,
  error: unknown
) {
  await appendSpend(project.id, {
    operation: 'video',
    provider: 'runway-direct',
    model,
    state: 'failed-unknown',
    estimatedUsd: credits * 0.01,
    sceneId: scene.id,
    shotId: shot.id,
    idempotencyKey: spendKey,
    error: errorText(error)
  });
}

async function assertSpendAvailable(
  projectId: string,
  spendKey: string,
  expectedAsset: string
) {
  const previous = await latestSpendForKey(projectId, spendKey);
  if (!previous) return;

  if (previous.state === 'succeeded' && await exists(expectedAsset)) {
    throw new Error(
      'SAFE RESUME: existe operación succeeded y asset para ' +
        spendKey +
        '. La toma debe reconciliarse/reutilizarse, no cobrarse de nuevo.'
    );
  }

  if (
    ['submitted', 'succeeded', 'failed-unknown', 'reconciled'].includes(
      previous.state
    )
  ) {
    throw new Error(
      'SAFE RETRY BLOCK: existe estado ' +
        previous.state +
        ' para ' +
        spendKey +
        '. No se reintentará automáticamente.'
    );
  }
}

async function withLegacyPaidGate<T>(run: () => Promise<T>) {
  const oldExternal = process.env.ALLOW_EXTERNAL_API_CALLS;
  const oldPaid = process.env.ALLOW_PAID_GENERATION;
  process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
  process.env.ALLOW_PAID_GENERATION = 'true';
  try {
    return await run();
  } finally {
    restoreEnv('ALLOW_EXTERNAL_API_CALLS', oldExternal);
    restoreEnv('ALLOW_PAID_GENERATION', oldPaid);
  }
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
      'Las APIs legacy deben permanecer bloqueadas en .env.local. Este productor abre solo cada llamada explícitamente autorizada.'
    );
  }
  const scene2 = project.plan?.scenes.find((item) => item.order === 2);
  if (!scene2 || scene2.status !== 'ready') {
    throw new Error('Escena 2 debe estar aprobada/ready antes de producir Escena 3.');
  }
}

function scene3(project: FilmProject) {
  const scene = project.plan?.scenes.find((item) => item.order === 3);
  if (!scene) throw new Error('No existe Escena 3.');
  return scene;
}

function shotByOrder(scene: FilmScene, order: number) {
  const shot = scene.shots.find((item) => item.order === order);
  if (!shot) throw new Error('No existe E3/T' + order + '.');
  return shot;
}

function character(project: FilmProject, id: string) {
  const person = project.plan?.characters.find((item) => item.id === id);
  if (!person) throw new Error('No existe personaje ' + id + '.');
  return person;
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const SCENE3_SAFE_MAX_USD_V6 =
  MAX_SCENE_CREDITS * 0.01 + MAX_IMAGE_USD * 2 + MAX_VOICE_USD;
