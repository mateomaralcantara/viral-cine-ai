import { access } from 'node:fs/promises';
import path from 'node:path';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  assetAbsolutePath,
  assetRelativePath,
  getProject,
  projectAssetDir,
  saveProject
} from '@/lib/storage/project-store';
import {
  concatenate,
  extractLastFrame,
  normalizeGeneratedVideo
} from '@/lib/media/ffmpeg';
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
  readSpendLedger,
  voiceCostUnits
} from '@/lib/engine/spend-ledger';
import {
  releaseNoChargeGenerationReservation
} from '@/lib/engine/spend-guard';
import {
  renderedAssets,
  saveSceneCheckpoint,
  saveShotCheckpoint
} from '@/lib/engine/scene-checkpoints';

loadProjectLocalEnvOverride();

const [projectId, confirm] = process.argv.slice(2);
const CONFIRM = '--confirm-50-credits';
const MAX_CREDITS_PER_SHOT = 25;
const MAX_SCENE_CREDITS = 50;
const MODEL = 'grok_imagine_1_5_lite' as const;
const RATIO = 'auto_720p' as const;

if (!projectId || confirm !== CONFIRM) {
  console.error(
    'Uso: npm run safe:scene2:runway -- <projectId> ' + CONFIRM
  );
  process.exit(1);
}

if (
  process.env.ALLOW_EXTERNAL_API_CALLS === 'true' ||
  process.env.ALLOW_PAID_GENERATION === 'true' ||
  process.env.ALLOW_PAID_PROVIDER_FALLBACK === 'true'
) {
  throw new Error(
    'ViralCine 6 Safe exige que las APIs legacy permanezcan BLOQUEADAS en .env.local. ' +
      'Ejecuta scripts/LOCK-PAID-APIS.ps1 antes de continuar.'
  );
}

if (!process.env.OPENAI_API_KEY?.trim()) {
  throw new Error('OPENAI_API_KEY no está configurado para la narración.');
}

let project = await getProject(projectId);
const scene = project.plan?.scenes.find((item) => item.order === 2);

if (!scene) throw new Error('No existe la Escena 2.');
if (scene.shots.length !== 3) {
  throw new Error(
    'Escena 2 inesperada: se esperaban exactamente 3 tomas.'
  );
}

const [t1, t2, t3] = [...scene.shots].sort(
  (a, b) => a.order - b.order
);

if (!t1.videoAsset || t1.status !== 'ready') {
  throw new Error(
    'E2/T1 debe estar ready y tener videoAsset antes de continuar.'
  );
}

await reconcileKnownFalUpload403(project, scene.id, t2.id);
project = await saveProject(project);

const sceneFresh = project.plan!.scenes.find(
  (item) => item.order === 2
)!;
const shots = [...sceneFresh.shots].sort(
  (a, b) => a.order - b.order
);
const first = shots[0];
const second = shots[1];
const third = shots[2];

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 2 / GROK LITE DIRECT');
console.log('==================================================');
console.log('Proyecto: ' + project.input.title);
console.log('Escena: 2 · ' + sceneFresh.title);
console.log('T1: REUTILIZAR · US$0');
console.log('T2: Runway Grok Lite Direct · máximo 25 créditos');
console.log('T3: Runway Grok Lite Direct · máximo 25 créditos');
console.log('Máximo visual autorizado: 50 créditos = US$0.50');
console.log('Narración: OpenAI marin; costo estimado menor de US$0.01');
console.log('Música: NO');
console.log('Auditoría IA automática: NO');
console.log('Fal.ai: NO');
console.log('Fallback pagado: NO');
console.log('');

sceneFresh.status = 'rendering';
sceneFresh.error = undefined;
project.status = 'producing';
project.error = undefined;
project.productionLog.push(
  new Date().toISOString() +
    ' ViralCine 6 Safe: Escena 2 inicia con T1 reutilizada y T2/T3 por Runway Grok Lite Direct; Fal bloqueado.'
);
project = await saveProject(project);

let previousVideo = assetAbsolutePath(
  project.id,
  first.videoAsset!
);
await access(previousVideo);

let totalCredits = 0;

for (const shotOrder of [2, 3]) {
  project = await getProject(project.id);
  const currentScene = project.plan!.scenes.find(
    (item) => item.order === 2
  )!;
  const shot = currentScene.shots.find(
    (item) => item.order === shotOrder
  )!;

  if (shot.status === 'ready' && shot.videoAsset) {
    console.log(
      'E2/T' + shotOrder + ': checkpoint/asset existente; se reutiliza.'
    );
    previousVideo = assetAbsolutePath(
      project.id,
      shot.videoAsset
    );
    continue;
  }

  const key =
    'scene-002-shot-' +
    String(shotOrder).padStart(2, '0');

  const refPath = path.join(
    projectAssetDir(project.id, 'images'),
    key + '-runway-ref.jpg'
  );

  await extractLastFrame(
    previousVideo,
    refPath,
    project.input.aspectRatio
  );

  const referenceUri = await imageFileToDataUri(refPath);

  const directCredits = grokLiteImageToVideoCredits(
    shot.durationSeconds,
    RATIO
  );

  console.log(
    '\n--- E2/T' + shotOrder + ' · GROK LITE DIRECTO ---'
  );
  console.log('Modelo: ' + MODEL);
  console.log('Modo: image-to-video / first frame');
  console.log('Resolución: 720p');
  console.log('Duración: ' + shot.durationSeconds + 's');
  console.log(
    'Costo máximo fijo: ' +
      directCredits +
      ' créditos = USD ' +
      (directCredits * 0.01).toFixed(2)
  );

  if (directCredits > MAX_CREDITS_PER_SHOT) {
    throw new Error(
      'SAFE COST GATE: E2/T' +
        shotOrder +
        ' cuesta ' +
        directCredits +
        ' créditos; máximo permitido: ' +
        MAX_CREDITS_PER_SHOT +
        '. NO se generó.'
    );
  }

  if (totalCredits + directCredits > MAX_SCENE_CREDITS) {
    throw new Error(
      'SAFE COST GATE: la escena superaría ' +
        MAX_SCENE_CREDITS +
        ' créditos. NO se generó esta toma.'
    );
  }

  const request = {
    model: MODEL,
    promptImage: referenceUri,
    promptText: buildPrompt(shot.visualPrompt, shot.camera),
    ratio: RATIO,
    duration: shot.durationSeconds
  };

  const spendKey =
    'v6safe:grok-direct:' + shot.id + ':1';

  const previousSpend = await latestSpendForKey(
    project.id,
    spendKey
  );

  if (
    previousSpend &&
    ['submitted', 'succeeded', 'failed-unknown'].includes(
      previousSpend.state
    )
  ) {
    throw new Error(
      'SAFE RETRY BLOCK: existe estado ' +
        previousSpend.state +
        ' para ' +
        spendKey +
        '. No se reintentará automáticamente.'
    );
  }

  const rawPath = path.join(
    projectAssetDir(project.id, 'video'),
    key + '-runway-raw.mp4'
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
      request,
      rawPath
    );
  } catch (error) {
    await appendSpend(project.id, {
      operation: 'video',
      provider: 'runway-direct',
      model: MODEL,
      state: 'failed-unknown',
      estimatedUsd: directCredits * 0.01,
      sceneId: currentScene.id,
      shotId: shot.id,
      idempotencyKey: spendKey,
      error:
        error instanceof Error
          ? error.message
          : String(error)
    });
    throw error;
  }

  const chargedCredits = generated.credits;

  if (chargedCredits > MAX_CREDITS_PER_SHOT) {
    throw new Error(
      'Runway reportó ' +
        chargedCredits +
        ' créditos después de generar; supera el techo esperado. Detén el proyecto y revisa facturación.'
    );
  }

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
    outputAsset: assetRelativePath(
      project.id,
      rawPath
    )
  });

  const audioPath = path.join(
    projectAssetDir(project.id, 'audio'),
    key + '.mp3'
  );

  if (!(await fileExists(audioPath))) {
    const voiceKey =
      'v6safe:voice:' + shot.id + ':marin';
    const voiceEstimate = estimateOperationCost(
      'voice',
      voiceCostUnits(shot.spokenText)
    );

    const oldExternal =
      process.env.ALLOW_EXTERNAL_API_CALLS;
    const oldPaid =
      process.env.ALLOW_PAID_GENERATION;

    process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
    process.env.ALLOW_PAID_GENERATION = 'true';

    await appendSpend(project.id, {
      operation: 'voice',
      provider: 'openai',
      model:
        process.env.OPENAI_TTS_MODEL ||
        'gpt-4o-mini-tts',
      state: 'submitted',
      estimatedUsd: voiceEstimate,
      sceneId: currentScene.id,
      shotId: shot.id,
      idempotencyKey: voiceKey
    });

    try {
      await generateSpeech(
        shot.spokenText,
        'Narración en español latino neutro. Decir exactamente el texto recibido. No traducir, no parafrasear, no añadir palabras. Tono íntimo, dramático y contenido.',
        audioPath,
        'marin'
      );

      await appendSpend(project.id, {
        operation: 'voice',
        provider: 'openai',
        model:
          process.env.OPENAI_TTS_MODEL ||
          'gpt-4o-mini-tts',
        state: 'succeeded',
        estimatedUsd: voiceEstimate,
        sceneId: currentScene.id,
        shotId: shot.id,
        idempotencyKey: voiceKey,
        outputAsset: assetRelativePath(
          project.id,
          audioPath
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
        estimatedUsd: voiceEstimate,
        sceneId: currentScene.id,
        shotId: shot.id,
        idempotencyKey: voiceKey,
        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
      throw error;
    } finally {
      restoreEnv(
        'ALLOW_EXTERNAL_API_CALLS',
        oldExternal
      );
      restoreEnv(
        'ALLOW_PAID_GENERATION',
        oldPaid
      );
    }
  }

  const finalPath = path.join(
    projectAssetDir(project.id, 'video'),
    key + '.mp4'
  );

  await normalizeGeneratedVideo(
    rawPath,
    audioPath,
    shot.durationSeconds,
    finalPath,
    project.input.aspectRatio
  );

  project = await getProject(project.id);
  const saveScene = project.plan!.scenes.find(
    (item) => item.order === 2
  )!;
  const saveShot = saveScene.shots.find(
    (item) => item.order === shotOrder
  )!;

  saveShot.imageAsset = assetRelativePath(
    project.id,
    refPath
  );
  saveShot.voiceAsset = assetRelativePath(
    project.id,
    audioPath
  );
  saveShot.baseVideoAsset = assetRelativePath(
    project.id,
    rawPath
  );
  saveShot.videoAsset = assetRelativePath(
    project.id,
    finalPath
  );
  saveShot.status = 'ready';
  saveShot.error = undefined;
  saveShot.lastProvider =
    'Runway Grok Lite Direct / ' +
    generated.model;
  saveShot.lastGenerationState = 'succeeded';
  saveShot.generationCount =
    (saveShot.generationCount || 0) + 1;
  saveShot.estimatedSpendUsd =
    (saveShot.estimatedSpendUsd || 0) +
    chargedCredits * 0.01;
  saveShot.pipelineVersion =
    '6.0-safe-runway-preview';

  const shotAssets = renderedAssets(
    project.id,
    saveShot.mode,
    refPath,
    audioPath,
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
      ' ViralCine 6 Safe: E2/T' +
      shotOrder +
      ' generada por Runway Grok Lite Direct (' +
      generated.model +
      ') · ' +
      chargedCredits +
      ' créditos.'
  );

  project = await saveProject(project);
  previousVideo = finalPath;
}

project = await getProject(project.id);
const finalScene = project.plan!.scenes.find(
  (item) => item.order === 2
)!;

const clips = [...finalScene.shots]
  .sort((a, b) => a.order - b.order)
  .map((shot) => {
    if (!shot.videoAsset) {
      throw new Error(
        'E2/T' +
          shot.order +
          ' no tiene video final.'
      );
    }
    return assetAbsolutePath(
      project.id,
      shot.videoAsset
    );
  });

const sceneVideo = path.join(
  projectAssetDir(project.id, 'video'),
  'scene-002.mp4'
);

await concatenate(clips, sceneVideo);

const representative = finalScene.shots.find(
  (shot) =>
    Boolean(shot.imageAsset && shot.voiceAsset)
);

if (!representative?.imageAsset ||
    !representative.voiceAsset) {
  throw new Error(
    'No hay assets representativos para checkpoint de escena.'
  );
}

finalScene.videoAsset = assetRelativePath(
  project.id,
  sceneVideo
);
finalScene.imageAsset =
  representative.imageAsset;
finalScene.voiceAsset =
  representative.voiceAsset;
finalScene.status = 'review-required';
finalScene.error = undefined;

project.status = 'quality-review';
project.error = undefined;
project.progress = {
  phase: 'quality-review',
  percent: 30,
  message:
    'Escena 2 generada con ViralCine 6 Safe / Runway. Revisión humana requerida.',
  currentScene: 2,
  totalScenes: project.plan!.scenes.length,
  updatedAt: new Date().toISOString()
};

project.productionLog.push(
  new Date().toISOString() +
    ' ViralCine 6 Safe: Escena 2 compuesta en 24s; T1 reutilizada, T2/T3 Runway, sin música ni auditoría automática.'
);

const sceneAssets = renderedAssets(
  project.id,
  finalScene.mode,
  assetAbsolutePath(
    project.id,
    finalScene.imageAsset
  ),
  assetAbsolutePath(
    project.id,
    finalScene.voiceAsset
  ),
  sceneVideo
);

await saveSceneCheckpoint(
  project,
  finalScene,
  sceneAssets
);

project = await saveProject(project);

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 2 LISTA PARA REVISAR');
console.log('==================================================');
console.log('T1: reutilizada');
console.log('T2/T3: Runway Grok Lite Direct');
console.log(
  'Créditos Runway usados en esta ejecución: ' +
    totalCredits
);
console.log(
  'Costo Runway máximo observado: US$' +
    (totalCredits * 0.01).toFixed(2)
);
console.log('Música: NO');
console.log('Auditoría automática: NO');
console.log('Fal.ai: NO');
console.log(
  'SCENE_VIDEO=' + sceneVideo
);
console.log('SCENE_REVIEW_REQUIRED=YES');

async function reconcileKnownFalUpload403(
  value: typeof project,
  sceneId: string,
  shotId: string
) {
  const ledger = await readSpendLedger(
    value.id
  );
  const entries = ledger.filter(
    (entry) =>
      entry.operation === 'video' &&
      entry.shotId === shotId &&
      entry.provider
        .toLowerCase()
        .includes('fal')
  );

  const latest = entries.at(-1);
  if (!latest) return;

  if (latest.state === 'failed-no-charge') {
    return;
  }

  if (latest.state !== 'failed-unknown') {
    return;
  }

  const message = latest.error || '';
  if (
    !/subir el recurso/i.test(message) ||
    !/HTTP 403/i.test(message)
  ) {
    throw new Error(
      'Existe un gasto Fal failed-unknown que NO puede reconciliarse automáticamente. Detente.'
    );
  }

  if (latest.outputAsset) {
    throw new Error(
      'El intento Fal tiene outputAsset; no se reconciliará automáticamente.'
    );
  }

  await appendSpend(value.id, {
    operation: 'video',
    provider: latest.provider,
    model: latest.model,
    state: 'failed-no-charge',
    estimatedUsd: latest.estimatedUsd,
    actualUsd: 0,
    sceneId,
    shotId,
    idempotencyKey: latest.idempotencyKey,
    providerRequestId:
      latest.providerRequestId,
    error:
      'ViralCine 6 Safe: reconciliado como no-charge; HTTP 403 durante upload antes de inferencia Fal.'
  });

  const localScene = value.plan!.scenes.find(
    (item) => item.id === sceneId
  )!;
  const localShot = localScene.shots.find(
    (item) => item.id === shotId
  )!;

  if ((localShot.generationCount || 0) > 0) {
    releaseNoChargeGenerationReservation(
      localShot,
      latest.estimatedUsd
    );
  }

  localShot.status = 'pending';
  localShot.error = undefined;
  localShot.lastGenerationState = undefined;
  localShot.safeFailoverResume = false;
  value.status = 'ready';
  value.error = undefined;

  value.productionLog.push(
    new Date().toISOString() +
      ' ViralCine 6 Safe: último Fal upload 403 de E2/T2 reconciliado como failed-no-charge antes de migrar a Runway.'
  );
}

function buildPrompt(
  visualPrompt: string,
  camera: string
) {
  return [
    visualPrompt.trim(),
    'Mantener exactamente la identidad de la mujer del primer frame.',
    'Continuidad estricta de rostro, cabello, edad, ropa y ambiente.',
    'Movimiento humano natural y físicamente plausible.',
    'Cámara: ' + camera.trim(),
    'Sin texto, subtítulos, logotipos ni marcas de agua.',
    'Sin diálogo generado dentro del video.'
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 1900);
}

async function fileExists(filePath: string) {
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
