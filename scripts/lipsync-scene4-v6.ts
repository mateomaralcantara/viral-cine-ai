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
import {
  prepareAudioFirstVoice,
  applyAudioFirstLipSync
} from '@/lib/engine/audio-first';
import {
  fitAudioToSlot,
  probeMediaDurationSeconds
} from '@/lib/media/segmented-ffmpeg';
import {
  concatenate,
  normalizeGeneratedVideoWithEmbeddedAudio
} from '@/lib/media/ffmpeg';
import { assertCinematicSceneVideo } from '@/lib/media/probe';
import {
  estimateOperationCost,
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

loadProjectLocalEnvOverride();

const [projectId, confirmation] = process.argv.slice(2);
const EXPECTED = '--confirm-scene4-lipsync-usd-1.61';

if (!projectId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene4:lipsync -- <projectId> ' + EXPECTED
  );
  process.exit(1);
}

const plan = validateScene4VisibleLipSyncPlanV6();

let project = await getProject(projectId);
assertProjectReady(project);

const scene = sceneByOrder(project, 4);
const finalScenePath = path.join(
  projectAssetDir(project.id, 'video'),
  'scene-004-lipsync-v6.mp4'
);

if (
  scene.videoAsset &&
  scene.videoAsset.endsWith('scene-004-lipsync-v6.mp4') &&
  await exists(finalScenePath)
) {
  await assertCinematicSceneVideo(finalScenePath, 30, {
    requireMotion: true,
    requireAudibleAudio: true
  });

  console.log('\n==================================================');
  console.log(' VIRALCINE 6 SAFE — ESCENA 4 LIP-SYNC YA EXISTE');
  console.log('==================================================');
  console.log('Video: ' + finalScenePath);
  console.log('Fal: NO');
  console.log('OpenAI: NO');
  console.log('Gasto nuevo: US$0');
  console.log('SCENE4_LIPSYNC_IDEMPOTENT=PASS');
  process.exit(0);
}

const voiceEstimate = SCENE4_VISIBLE_LIPSYNC_SEGMENTS_V6.reduce(
  (sum, item) =>
    sum + estimateOperationCost('voice', voiceCostUnits(item.text)),
  0
);
const lipSyncEstimate =
  SCENE4_VISIBLE_LIPSYNC_SEGMENTS_V6.length *
  estimateOperationCost('lip-sync', 6);
const totalEstimate = voiceEstimate + lipSyncEstimate;

if (lipSyncEstimate > 1.6001 || totalEstimate > SCENE4_VISIBLE_LIPSYNC_MAX_USD_V6) {
  throw new Error(
    'SAFE COST GATE E4 LIP-SYNC: estimación US$' +
      totalEstimate.toFixed(4) +
      ' supera US$' +
      SCENE4_VISIBLE_LIPSYNC_MAX_USD_V6.toFixed(2) +
      '.'
  );
}

applyFifteenDaysCoreVoiceLocksV5(project);
project = await saveProject(project);

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 4 / VOZ + LABIOS');
console.log('==================================================');
console.log('Videos Runway existentes: REUTILIZAR');
console.log('Regeneración Runway: NO');
console.log('Tomas con voz visible: T1 y T2');
console.log('T3-T5: montaje silencioso');
console.log('Voz: Elena / OpenAI marin');
console.log('Lip-sync: Fal Sync Lipsync v3');
console.log('Segundos de lip-sync: ' + plan.visibleLipSyncSeconds);
console.log('Máximo lip-sync: US$' + lipSyncEstimate.toFixed(2));
console.log('Máximo voz segmentada: US$0.01');
console.log('Máximo total autorizado: US$' + SCENE4_VISIBLE_LIPSYNC_MAX_USD_V6.toFixed(2));
console.log('');

for (const segment of SCENE4_VISIBLE_LIPSYNC_SEGMENTS_V6) {
  project = await getProject(project.id);
  const currentScene = sceneByOrder(project, 4);
  const shot = shotByOrder(currentScene, segment.order);

  if (
    shot.pipelineVersion === '6.0-scene4-visible-lipsync' &&
    shot.videoAsset
  ) {
    const existing = assetAbsolutePath(project.id, shot.videoAsset);
    if (await exists(existing)) {
      console.log(
        'E4/T' + segment.order +
        ': lip-sync ya existente; se reutiliza sin gasto.'
      );
      continue;
    }
  }

  if (!shot.videoAsset) {
    throw new Error(
      'E4/T' + segment.order +
      ' no tiene video generado para reutilizar.'
    );
  }

  const baseVideoPath = assetAbsolutePath(project.id, shot.videoAsset);
  await access(baseVideoPath);

  const voiceShot: FilmShot = {
    ...shot,
    spokenText: segment.text,
    speakerId: SCENE4_ELENA_ID_V6,
    dialogueLines: [{
      id: shot.id + ':visible-dialogue-v6',
      speakerId: SCENE4_ELENA_ID_V6,
      text: segment.text,
      emotion: 'íntima y determinada',
      startSeconds: 0,
      endSeconds: 6
    }]
  };

  console.log(
    '\n--- E4/T' + segment.order +
    ' · sincronización visible ---'
  );
  console.log('Texto: ' + segment.text);

  const voiceKey =
    'scene4-visible-lipsync-v6/e4-t' + segment.order + '-elena';

  const prepared = await withAuthorizedPaidGate(() =>
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
      'x. Diálogo visible limitado a 1.2x. Fal NO fue llamado.'
    );
  }

  const audioDir = path.join(
    projectAssetDir(project.id, 'audio'),
    'scene4-visible-lipsync-v6'
  );
  const videoDir = path.join(
    projectAssetDir(project.id, 'video'),
    'scene4-visible-lipsync-v6'
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
  const rawLipSyncPath = path.join(
    videoDir,
    'scene-004-shot-' +
      String(segment.order).padStart(2, '0') +
      '-fal-lipsync-raw.mp4'
  );
  const finalLipSyncPath = path.join(
    videoDir,
    'scene-004-shot-' +
      String(segment.order).padStart(2, '0') +
      '-lipsync-final.mp4'
  );

  await fitAudioToSlot(
    prepared.voicePath,
    speedFactor,
    6,
    masterAudioPath
  );

  if (!(await exists(rawLipSyncPath))) {
    await withAuthorizedPaidGate(() =>
      applyAudioFirstLipSync(
        project,
        currentScene,
        voiceShot,
        baseVideoPath,
        masterAudioPath,
        rawLipSyncPath
      )
    );
  }

  await normalizeGeneratedVideoWithEmbeddedAudio(
    rawLipSyncPath,
    6,
    finalLipSyncPath,
    project.input.aspectRatio
  );

  await assertCinematicSceneVideo(
    finalLipSyncPath,
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
    id: saveShot.id + ':visible-dialogue-v6',
    speakerId: SCENE4_ELENA_ID_V6,
    text: segment.text,
    emotion: 'íntima y determinada',
    startSeconds: 0,
    endSeconds: 6
  }];
  saveShot.voiceAsset = assetRelativePath(project.id, masterAudioPath);
  saveShot.lipSyncAsset = assetRelativePath(project.id, rawLipSyncPath);
  saveShot.videoAsset = assetRelativePath(project.id, finalLipSyncPath);
  saveShot.lastProvider = 'OpenAI marin + Fal Sync Lipsync v3';
  saveShot.lastGenerationState = 'succeeded';
  saveShot.pipelineVersion = '6.0-scene4-visible-lipsync';
  saveShot.status = 'ready';
  saveShot.error = undefined;
  saveShot.estimatedSpendUsd =
    (saveShot.estimatedSpendUsd || 0) +
    estimateOperationCost('voice', voiceCostUnits(segment.text)) +
    estimateOperationCost('lip-sync', 6);

  if (!saveShot.imageAsset) {
    throw new Error(
      'E4/T' + segment.order + ' perdió imageAsset.'
    );
  }

  const shotAssets = renderedAssets(
    project.id,
    saveShot.mode,
    assetAbsolutePath(project.id, saveShot.imageAsset),
    masterAudioPath,
    finalLipSyncPath
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
      ' convertida a diálogo visible de Elena con OpenAI marin + Fal lip-sync; video Runway reutilizado.'
  );
  await saveProject(project);
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
  'T1-T2 tienen diálogo visible de Elena sincronizado; T3-T5 permanecen como montaje silencioso. Revisión humana requerida.';
finalScene.productionStrategy =
  'real-cinema-v2';

project.status = 'quality-review';
project.error = undefined;
project.progress = {
  phase: 'quality-review',
  percent: 60,
  message:
    'Escena 4 recompuesta: toda la voz hablada está en T1-T2 con labios sincronizados; T3-T5 quedan silenciosas.',
  currentScene: 4,
  totalScenes: project.plan!.scenes.length,
  updatedAt: new Date().toISOString()
};

project.productionLog.push(
  new Date().toISOString() +
    ' ViralCine 6 Safe: Escena 4 recompuesta sin regenerar Runway; narración exacta convertida en diálogo visible de Elena repartido entre T1-T2 con lip-sync real. T3-T5 silenciosas.'
);

await saveProject(project);

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 4 LIP-SYNC LISTA');
console.log('==================================================');
console.log('Runway regenerado: NO');
console.log('T1: VOZ + LABIOS');
console.log('T2: VOZ + LABIOS');
console.log('T3-T5: SILENCIO / MONTAJE');
console.log('Narración exacta conservada: SI');
console.log('Video final: ' + finalScenePath);
console.log('SCENE4_LIPSYNC_REVIEW_REQUIRED=YES');

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
      'Las APIs generales deben permanecer bloqueadas en .env.local. Este comando abre únicamente sus llamadas autorizadas.'
    );
  }

  const current = value.plan?.scenes.find(
    (item) => item.order === 4
  );
  if (!current || !current.videoAsset) {
    throw new Error(
      'La Escena 4 original debe estar generada antes del lip-sync.'
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

function sceneByOrder(
  value: FilmProject,
  order: number
): FilmScene {
  const scene = value.plan?.scenes.find(
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

async function withAuthorizedPaidGate<T>(
  run: () => Promise<T>
) {
  const oldExternal = process.env.ALLOW_EXTERNAL_API_CALLS;
  const oldPaid = process.env.ALLOW_PAID_GENERATION;
  const oldFallback =
    process.env.ALLOW_PAID_PROVIDER_FALLBACK;
  const oldProduction = process.env.PRODUCTION_MODE;
  const oldLipSync = process.env.ENABLE_LIPSYNC;
  const oldLocal = process.env.VIRALCINE_LOCAL_LIPSYNC_ONLY;

  process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
  process.env.ALLOW_PAID_GENERATION = 'true';
  process.env.ALLOW_PAID_PROVIDER_FALLBACK = 'false';
  process.env.PRODUCTION_MODE = 'real';
  process.env.ENABLE_LIPSYNC = 'true';
  delete process.env.VIRALCINE_LOCAL_LIPSYNC_ONLY;

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
    restoreEnv('ENABLE_LIPSYNC', oldLipSync);
    restoreEnv(
      'VIRALCINE_LOCAL_LIPSYNC_ONLY',
      oldLocal
    );
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
