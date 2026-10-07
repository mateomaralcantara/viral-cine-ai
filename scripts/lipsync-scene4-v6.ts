import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  assetAbsolutePath,
  assetRelativePath,
  getProject,
  projectAssetDir,
  saveProject
} from '@/lib/storage/project-store';
import { prepareAudioFirstVoice } from '@/lib/engine/audio-first';
import {
  fitAudioToSlot,
  probeMediaDurationSeconds
} from '@/lib/media/segmented-ffmpeg';
import {
  concatenate,
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
  saveShotCheckpoint
} from '@/lib/engine/scene-checkpoints';
import {
  applyFifteenDaysCoreVoiceLocksV5
} from '@/lib/engine/fifteen-days-voice-lock-v5';
import {
  SCENE4_ELENA_ID_V6
} from '@/lib/engine/scene4-montage-plan-v6';
import {
  SCENE4_VISIBLE_LIPSYNC_SEGMENTS_V6,
  SCENE4_VISIBLE_LIPSYNC_MAX_USD_V6,
  validateScene4VisibleLipSyncPlanV6
} from '@/lib/engine/scene4-visible-lipsync-plan-v6';
import {
  audioFileToDataUri,
  generateRunwayWan3AudioReferenceFromEnvironment,
  imageFileToDataUri,
  wan3VideoCredits
} from '@/lib/providers/runway-router-v6';

loadProjectLocalEnvOverride();

const [projectId, confirmation] = process.argv.slice(2);
const EXPECTED = '--confirm-scene4-wan3-usd-1.21';

if (!projectId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene4:wan3 -- <projectId> ' + EXPECTED
  );
  process.exit(1);
}

// Protección explícita: esta ruta NO puede usar Fal.
delete process.env.FAL_KEY;
process.env.ENABLE_LIPSYNC = 'false';
process.env.VIRALCINE_LOCAL_LIPSYNC_ONLY = '1';

const plan = validateScene4VisibleLipSyncPlanV6();

let project = await getProject(projectId);
assertProjectReady(project);

const scene = sceneByOrder(project, 4);
const finalScenePath = path.join(
  projectAssetDir(project.id, 'video'),
  'scene-004-wan3-lipsync-v6.mp4'
);

if (
  scene.videoAsset &&
  scene.videoAsset.endsWith('scene-004-wan3-lipsync-v6.mp4') &&
  await exists(finalScenePath)
) {
  await assertCinematicSceneVideo(finalScenePath, 30, {
    requireMotion: true,
    requireAudibleAudio: true
  });

  console.log('\n==================================================');
  console.log(' VIRALCINE 6 SAFE — ESCENA 4 WAN 3.0 YA EXISTE');
  console.log('==================================================');
  console.log('Video: ' + finalScenePath);
  console.log('Runway nuevo: NO');
  console.log('Fal.ai: NO');
  console.log('OpenAI: NO');
  console.log('Gasto nuevo: US$0');
  console.log('SCENE4_WAN3_IDEMPOTENT=PASS');
  process.exit(0);
}

const creditsPerShot = wan3VideoCredits(6, '1280:720');
const videoUsd =
  SCENE4_VISIBLE_LIPSYNC_SEGMENTS_V6.length *
  creditsPerShot *
  0.01;
const voiceEstimate = SCENE4_VISIBLE_LIPSYNC_SEGMENTS_V6.reduce(
  (sum, item) =>
    sum + estimateOperationCost('voice', voiceCostUnits(item.text)),
  0
);
const totalEstimate = videoUsd + voiceEstimate;

if (creditsPerShot !== 60) {
  throw new Error(
    'SAFE COST GATE: WAN 3.0 6s 720p debía costar 60 créditos; calculó ' +
      creditsPerShot + '.'
  );
}

if (videoUsd > 1.2001 || totalEstimate > SCENE4_VISIBLE_LIPSYNC_MAX_USD_V6) {
  throw new Error(
    'SAFE COST GATE E4 WAN3: estimación US$' +
      totalEstimate.toFixed(4) +
      ' supera US$' +
      SCENE4_VISIBLE_LIPSYNC_MAX_USD_V6.toFixed(2) +
      '.'
  );
}

applyFifteenDaysCoreVoiceLocksV5(project);
project = await saveProject(project);

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 4 / WAN 3.0 VOZ + LABIOS');
console.log('==================================================');
console.log('Fal.ai: PROHIBIDO / NO USADO');
console.log('FAL_KEY en este proceso: ELIMINADA');
console.log('Videos originales T1-T5: PRESERVADOS');
console.log('Regeneración: SOLO T1 y T2');
console.log('T3-T5: REUTILIZAR SIN CAMBIOS');
console.log('Voz: Elena / OpenAI marin');
console.log('Video hablado: Runway Direct / WAN 3.0 audio-reference');
console.log('Resolución: 1280x720');
console.log('Duración por toma: 6s');
console.log('Costo máximo por toma WAN: 60 créditos = US$0.60');
console.log('Máximo WAN total: US$1.20');
console.log('Máximo voz: US$0.01');
console.log('Máximo total autorizado: US$' + SCENE4_VISIBLE_LIPSYNC_MAX_USD_V6.toFixed(2));
console.log('Fallback pagado: NO');
console.log('');

for (const segment of SCENE4_VISIBLE_LIPSYNC_SEGMENTS_V6) {
  project = await getProject(project.id);
  const currentScene = sceneByOrder(project, 4);
  const shot = shotByOrder(currentScene, segment.order);

  if (
    shot.pipelineVersion === '6.0-scene4-wan3-audio-reference' &&
    shot.videoAsset
  ) {
    const existing = assetAbsolutePath(project.id, shot.videoAsset);
    if (await exists(existing)) {
      console.log(
        'E4/T' + segment.order +
        ': WAN 3.0 ya existente; se reutiliza sin gasto.'
      );
      continue;
    }
  }

  if (!shot.videoAsset) {
    throw new Error(
      'E4/T' + segment.order +
      ' no tiene video original para preservar/referenciar.'
    );
  }
  if (!shot.imageAsset) {
    throw new Error(
      'E4/T' + segment.order +
      ' no tiene imageAsset de continuidad para WAN 3.0.'
    );
  }

  const originalVideoAsset = shot.videoAsset;
  const originalVideoPath = assetAbsolutePath(project.id, originalVideoAsset);
  const referenceImagePath = assetAbsolutePath(project.id, shot.imageAsset);
  await Promise.all([
    access(originalVideoPath),
    access(referenceImagePath)
  ]);

  const voiceShot: FilmShot = {
    ...shot,
    spokenText: segment.text,
    speakerId: SCENE4_ELENA_ID_V6,
    dialogueLines: [{
      id: shot.id + ':visible-dialogue-wan3-v6',
      speakerId: SCENE4_ELENA_ID_V6,
      text: segment.text,
      emotion: 'íntima y determinada',
      startSeconds: 0,
      endSeconds: 6
    }]
  };

  console.log(
    '\n--- E4/T' + segment.order +
    ' · WAN 3.0 audio-reference ---'
  );
  console.log('Texto: ' + segment.text);
  console.log('Video original: PRESERVAR');
  console.log('Fal.ai: NO');

  const voiceKey =
    'scene4-visible-lipsync-v6/e4-t' + segment.order + '-elena';
  const expectedVoicePath = path.join(
    projectAssetDir(project.id, 'audio'),
    voiceKey + '.mp3'
  );
  const voiceAlreadyExists = await exists(expectedVoicePath);

  const prepared = await withVoicePaidGate(() =>
    prepareAudioFirstVoice(
      project,
      currentScene,
      voiceShot,
      voiceKey
    )
  );

  const rawVoiceDuration = await probeMediaDurationSeconds(
    prepared.voicePath
  );
  const speedFactor = Math.max(1, rawVoiceDuration / 6);

  if (speedFactor > 1.2) {
    throw new Error(
      'E4/T' + segment.order +
      ': la voz dura ' + rawVoiceDuration.toFixed(3) +
      's y necesitaría ' + speedFactor.toFixed(3) +
      'x. Diálogo visible limitado a 1.2x. Runway NO fue llamado.'
    );
  }

  const audioDir = path.join(
    projectAssetDir(project.id, 'audio'),
    'scene4-wan3-v6'
  );
  const videoDir = path.join(
    projectAssetDir(project.id, 'video'),
    'scene4-wan3-v6'
  );
  await Promise.all([
    mkdir(audioDir, { recursive: true }),
    mkdir(videoDir, { recursive: true })
  ]);

  const masterAudioPath = path.join(
    audioDir,
    'scene-004-shot-' +
      String(segment.order).padStart(2, '0') +
      '-elena-master.wav'
  );
  const rawWanPath = path.join(
    videoDir,
    'scene-004-shot-' +
      String(segment.order).padStart(2, '0') +
      '-wan3-audio-ref-raw.mp4'
  );
  const finalWanPath = path.join(
    videoDir,
    'scene-004-shot-' +
      String(segment.order).padStart(2, '0') +
      '-wan3-final.mp4'
  );

  await fitAudioToSlot(
    prepared.voicePath,
    speedFactor,
    6,
    masterAudioPath
  );

  const spendKey =
    'v6safe:e4:t' + segment.order + ':wan3-audio-reference:1';

  if (!(await exists(rawWanPath))) {
    await assertWanSpendAvailable(
      project.id,
      spendKey,
      rawWanPath
    );

    await appendSpend(project.id, {
      operation: 'video',
      provider: 'runway-direct',
      model: 'wan3',
      state: 'submitted',
      estimatedUsd: creditsPerShot * 0.01,
      sceneId: currentScene.id,
      shotId: shot.id,
      characterId: SCENE4_ELENA_ID_V6,
      idempotencyKey: spendKey
    });

    try {
      const imageUri = await imageFileToDataUri(referenceImagePath);
      const audioUri = await audioFileToDataUri(masterAudioPath);

      const generated =
        await generateRunwayWan3AudioReferenceFromEnvironment(
          {
            model: 'wan3',
            promptText: [
              '[Image 1] fija identidad, edad, rostro, piel, cabello, vestuario, iluminación y continuidad de Elena.',
              shot.visualPrompt,
              'Elena es la única persona que habla.',
              'El audio de referencia contiene exactamente su parlamento.',
              'Sincroniza con precisión labios, mandíbula, boca y expresión facial con cada fonema y pausa del audio.',
              'Mantén la boca claramente visible durante el parlamento.',
              'Conserva el rostro y la identidad de Elena; no cambies edad, facciones ni cuerpo.',
              'Una sola toma cinematográfica continua de seis segundos.',
              'No agregues otra voz, diálogo, música, texto, subtítulos, logos ni marcas de agua.'
            ].join(' '),
            audio: true,
            duration: 6,
            ratio: '1280:720',
            references: [{ uri: imageUri }],
            referenceAudio: [{ type: 'audio', uri: audioUri }]
          },
          rawWanPath
        );

      if (generated.credits !== creditsPerShot) {
        throw new Error(
          'Runway devolvió ' + generated.credits +
          ' créditos; esperábamos exactamente ' + creditsPerShot + '.'
        );
      }

      await appendSpend(project.id, {
        operation: 'video',
        provider: 'runway-direct',
        model: generated.model,
        state: 'succeeded',
        estimatedUsd: creditsPerShot * 0.01,
        actualUsd: generated.credits * 0.01,
        sceneId: currentScene.id,
        shotId: shot.id,
        characterId: SCENE4_ELENA_ID_V6,
        idempotencyKey: spendKey,
        providerRequestId: generated.taskId,
        outputAsset: assetRelativePath(project.id, rawWanPath)
      });
    } catch (error) {
      const message = errorText(error);
      const taskIdMatch = message.match(/taskId=([0-9a-f-]{36})/i);

      await appendSpend(project.id, {
        operation: 'video',
        provider: 'runway-direct',
        model: 'wan3',
        state: 'failed-unknown',
        estimatedUsd: creditsPerShot * 0.01,
        sceneId: currentScene.id,
        shotId: shot.id,
        characterId: SCENE4_ELENA_ID_V6,
        idempotencyKey: spendKey,
        providerRequestId: taskIdMatch?.[1],
        error: message
      });
      throw error;
    }
  }

  const rawProbe = await probeVideo(rawWanPath);
  if (!rawProbe.hasVideo || !rawProbe.hasAudio) {
    throw new Error(
      'WAN 3.0 devolvió un asset incompleto en E4/T' +
      segment.order +
      ': video=' + rawProbe.hasVideo +
      ', audio=' + rawProbe.hasAudio +
      '. No se publicará.'
    );
  }

  await normalizeGeneratedVideoWithEmbeddedAudio(
    rawWanPath,
    6,
    finalWanPath,
    project.input.aspectRatio
  );

  await assertCinematicSceneVideo(
    finalWanPath,
    6,
    {
      requireMotion: true,
      requireAudibleAudio: true
    }
  );

  project = await getProject(project.id);
  const saveScene = sceneByOrder(project, 4);
  const saveShot = shotByOrder(saveScene, segment.order);

  saveShot.spokenText = segment.text;
  saveShot.speakerId = SCENE4_ELENA_ID_V6;
  saveShot.dialogueLines = [{
    id: saveShot.id + ':visible-dialogue-wan3-v6',
    speakerId: SCENE4_ELENA_ID_V6,
    text: segment.text,
    emotion: 'íntima y determinada',
    startSeconds: 0,
    endSeconds: 6
  }];
  saveShot.voiceAsset = assetRelativePath(project.id, masterAudioPath);
  saveShot.lipSyncAsset = assetRelativePath(project.id, rawWanPath);
  saveShot.videoAsset = assetRelativePath(project.id, finalWanPath);
  saveShot.lastProvider = 'Runway Direct / WAN 3.0 audio-reference';
  saveShot.lastGenerationState = 'succeeded';
  saveShot.pipelineVersion = '6.0-scene4-wan3-audio-reference';
  saveShot.status = 'ready';
  saveShot.error = undefined;
  saveShot.generationCount = (saveShot.generationCount || 0) + 1;
  saveShot.estimatedSpendUsd =
    (saveShot.estimatedSpendUsd || 0) +
    creditsPerShot * 0.01 +
    (voiceAlreadyExists
      ? 0
      : estimateOperationCost(
          'voice',
          voiceCostUnits(segment.text)
        ));

  const shotAssets = renderedAssets(
    project.id,
    saveShot.mode,
    referenceImagePath,
    masterAudioPath,
    finalWanPath
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
      segment.order +
      ' generada con Runway WAN 3.0 audio-reference + Elena OpenAI marin. Fal.ai NO usado. Video original preservado: ' +
      originalVideoAsset +
      '.'
  );
  await saveProject(project);

  console.log('E4/T' + segment.order + ': WAN 3.0 LISTA');
  console.log('Créditos: ' + creditsPerShot);
  console.log('Fal.ai: NO');
}

project = await getProject(project.id);
const finalScene = sceneByOrder(project, 4);

const clips = [...finalScene.shots]
  .sort((a, b) => a.order - b.order)
  .map((shot) => {
    if (!shot.videoAsset) {
      throw new Error(
        'E4/T' + shot.order +
        ' no tiene video final para recomponer la escena.'
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

finalScene.videoAsset = assetRelativePath(
  project.id,
  finalScenePath
);
finalScene.status = 'review-required';
finalScene.error =
  'T1-T2 regeneradas con Runway WAN 3.0 audio-reference y Elena sincronizada; T3-T5 reutilizadas. Fal.ai NO usado. Revisión humana requerida.';
finalScene.productionStrategy = 'real-cinema-v2';

project.status = 'quality-review';
project.error = undefined;
project.progress = {
  phase: 'quality-review',
  percent: 60,
  message:
    'Escena 4 recompuesta sin Fal: T1-T2 Runway WAN 3.0 con voz/labios; T3-T5 reutilizadas.',
  currentScene: 4,
  totalScenes: project.plan!.scenes.length,
  updatedAt: new Date().toISOString()
};

project.productionLog.push(
  new Date().toISOString() +
    ' ViralCine 6 Safe: Escena 4 recompuesta con Runway WAN 3.0 audio-reference en T1-T2. Fal.ai PROHIBIDO/NO USADO. T3-T5 reutilizadas.'
);

await saveProject(project);

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 4 WAN 3.0 LISTA');
console.log('==================================================');
console.log('Fal.ai: NO');
console.log('T1: Runway WAN 3.0 + voz/labios');
console.log('T2: Runway WAN 3.0 + voz/labios');
console.log('T3-T5: REUTILIZADAS');
console.log('Máximo WAN autorizado: US$1.20');
console.log('Máximo voz autorizado: US$0.01');
console.log('Video final: ' + finalScenePath);
console.log('SCENE4_WAN3_REVIEW_REQUIRED=YES');

function assertProjectReady(value: FilmProject) {
  if (value.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
    throw new Error(
      'Este comando solo está autorizado para 15 DÍAS.'
    );
  }

  if (
    process.env.ALLOW_EXTERNAL_API_CALLS === 'true' ||
    process.env.ALLOW_PAID_GENERATION === 'true' ||
    process.env.ALLOW_PAID_PROVIDER_FALLBACK === 'true'
  ) {
    throw new Error(
      'Las APIs generales deben permanecer bloqueadas en .env.local. Esta ruta usa solo OpenAI voz explícita y Runway WAN 3.0 explícito.'
    );
  }

  if (!process.env.RUNWAYML_API_SECRET?.trim()) {
    throw new Error(
      'RUNWAYML_API_SECRET no está configurado.'
    );
  }

  const current = value.plan?.scenes.find(
    (item) => item.order === 4
  );
  if (!current || !current.videoAsset) {
    throw new Error(
      'La Escena 4 original debe existir antes de esta corrección.'
    );
  }
  if (
    current.status !== 'review-required' &&
    current.status !== 'ready'
  ) {
    throw new Error(
      'La Escena 4 debe estar en review-required o ready. Estado=' +
      current.status
    );
  }
}

async function assertWanSpendAvailable(
  currentProjectId: string,
  spendKey: string,
  expectedAsset: string
) {
  const previous = await latestSpendForKey(
    currentProjectId,
    spendKey
  );

  if (!previous) return;

  if (
    previous.state === 'succeeded' &&
    await exists(expectedAsset)
  ) {
    return;
  }

  if (
    previous.state === 'reserved' ||
    previous.state === 'failed-no-charge'
  ) {
    return;
  }

  if (
    ['submitted', 'succeeded', 'failed-unknown', 'reconciled'].includes(
      previous.state
    )
  ) {
    throw new Error(
      'SAFE RETRY BLOCK WAN: existe estado ' +
      previous.state +
      ' para ' +
      spendKey +
      '. No se reintentará automáticamente.'
    );
  }
}

function sceneByOrder(
  value: FilmProject,
  order: number
): FilmScene {
  const current = value.plan?.scenes.find(
    (item) => item.order === order
  );
  if (!current) {
    throw new Error('No existe Escena ' + order + '.');
  }
  return current;
}

function shotByOrder(
  current: FilmScene,
  order: number
): FilmShot {
  const shot = current.shots.find(
    (item) => item.order === order
  );
  if (!shot) {
    throw new Error('No existe E4/T' + order + '.');
  }
  return shot;
}

async function withVoicePaidGate<T>(
  run: () => Promise<T>
) {
  const oldExternal = process.env.ALLOW_EXTERNAL_API_CALLS;
  const oldPaid = process.env.ALLOW_PAID_GENERATION;
  const oldFallback =
    process.env.ALLOW_PAID_PROVIDER_FALLBACK;
  const oldProduction = process.env.PRODUCTION_MODE;

  process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
  process.env.ALLOW_PAID_GENERATION = 'true';
  process.env.ALLOW_PAID_PROVIDER_FALLBACK = 'false';
  process.env.PRODUCTION_MODE = 'real';

  try {
    return await run();
  } finally {
    restoreEnv('ALLOW_EXTERNAL_API_CALLS', oldExternal);
    restoreEnv('ALLOW_PAID_GENERATION', oldPaid);
    restoreEnv(
      'ALLOW_PAID_PROVIDER_FALLBACK',
      oldFallback
    );
    restoreEnv('PRODUCTION_MODE', oldProduction);
  }
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
  return error instanceof Error ? error.message : String(error);
}
