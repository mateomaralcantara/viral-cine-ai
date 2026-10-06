import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  applyFifteenDaysCoreVoiceLocksV5
} from '@/lib/engine/fifteen-days-voice-lock-v5';
import {
  buildSceneReviewManifestV5,
  markSceneForIntegratedRun,
  printSceneReviewManifestV5,
  sceneForReview
} from '@/lib/engine/scene-review-v5';
import { produceProjectV4 } from '@/lib/engine/producer-v4';
import {
  assetAbsolutePath,
  assetRelativePath,
  getProject,
  projectAssetDir,
  saveProject
} from '@/lib/storage/project-store';
import { concatenate } from '@/lib/media/ffmpeg';
import { readSpendLedger } from '@/lib/engine/spend-ledger';
import {
  renderedAssets,
  saveSceneCheckpoint
} from '@/lib/engine/scene-checkpoints';
import path from 'node:path';

loadProjectLocalEnvOverride();

const [action = 'status', projectId, sceneOrderRaw] = process.argv.slice(2);
const sceneOrder = Number(sceneOrderRaw || '2');

if (!projectId || !Number.isInteger(sceneOrder) || sceneOrder < 1) {
  console.error(
    'Uso: npm run scene:15dias -- <status|prepare|run|approve|diagnose> <projectId> <sceneOrder>'
  );
  process.exit(1);
}

let project = await getProject(projectId);

if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
  throw new Error('Este comando solo está autorizado para el proyecto 15 DÍAS.');
}

if (action === 'status') {
  const manifest = await buildSceneReviewManifestV5(project, sceneOrder);
  printSceneReviewManifestV5(manifest);
  process.exit(0);
}

if (action === 'diagnose') {
  const scene = sceneForReview(project, sceneOrder);
  const ledger = await readSpendLedger(project.id);
  const sceneEntries = ledger.filter((entry) => entry.sceneId === scene.id);
  const failedUnknown = sceneEntries.filter(
    (entry) => entry.state === 'failed-unknown'
  );

  console.log('\n==================================================');
  console.log(' VIRALCINE — SCENE REVIEW 5.0 DIAGNOSTICO');
  console.log('==================================================');
  console.log('Proyecto: ' + project.status);
  console.log('Project error: ' + (project.error || 'NINGUNO'));
  console.log('Escena: ' + scene.order + ' · ' + scene.title);
  console.log('Estado escena: ' + scene.status);
  console.log('Scene error: ' + (scene.error || 'NINGUNO'));

  console.log('\nTOMAS');
  for (const shot of [...scene.shots].sort((a, b) => a.order - b.order)) {
    console.log(
      '- T' + shot.order +
      ' | status=' + shot.status +
      ' | generationCount=' + (shot.generationCount || 0) +
      ' | provider=' + (shot.lastProvider || 'ninguno') +
      ' | generationState=' + (shot.lastGenerationState || 'ninguno')
    );
    console.log(
      '  image=' + (shot.imageAsset || 'NO') +
      ' | base=' + (shot.baseVideoAsset || 'NO') +
      ' | final=' + (shot.videoAsset || 'NO')
    );
    if (shot.error) console.log('  error=' + shot.error);
  }

  console.log('\nFAILED-UNKNOWN DE ESTA ESCENA');
  if (!failedUnknown.length) {
    console.log('- ninguno');
  } else {
    for (const entry of failedUnknown) {
      console.log(
        '- ' + entry.operation +
        ' | provider=' + entry.provider +
        ' | shotId=' + (entry.shotId || 'N/A') +
        ' | key=' + (entry.idempotencyKey || 'N/A') +
        ' | riesgo=US
if (action === 'prepare') {
  applyFifteenDaysCoreVoiceLocksV5(project);
  project = await saveProject(project);

  const manifest = await buildSceneReviewManifestV5(project, sceneOrder);
  printSceneReviewManifestV5(manifest);

  console.log('\nPREPARE_ONLY=YES');
  console.log('APIs externas: NO');
  console.log('Gasto: US$0');
  process.exit(manifest.ready ? 0 : 2);
}

if (action === 'approve') {
  const scene = sceneForReview(project, sceneOrder);

  if (scene.status !== 'review-required' && scene.status !== 'ready') {
    throw new Error(
      `La escena ${sceneOrder} no está lista para aprobación humana. Estado: ${scene.status}.`
    );
  }

  for (const shot of scene.shots) {
    if (!shot.videoAsset) {
      throw new Error(
        `No se puede aprobar la escena ${sceneOrder}: T${shot.order} no tiene video final.`
      );
    }
    shot.status = 'ready';
    shot.error = undefined;
    shot.qualityOverrideApproved = true;
    shot.qualityForceRegenerate = false;
    shot.safeFailoverResume = false;
  }

  const shotClips = scene.shots
    .sort((a, b) => a.order - b.order)
    .map((shot) => assetAbsolutePath(project.id, shot.videoAsset!));
  const sceneVideo = path.join(
    projectAssetDir(project.id, 'video'),
    'scene-' + String(scene.order).padStart(3, '0') + '.mp4'
  );
  await concatenate(shotClips, sceneVideo);

  const representativeShot = scene.shots.find(
    (shot) => Boolean(shot.imageAsset && shot.voiceAsset)
  );

  if (representativeShot?.imageAsset && representativeShot.voiceAsset) {
    const sceneAssets = renderedAssets(
      project.id,
      scene.mode === 'animated-image' ? 'ai-video' : scene.mode,
      assetAbsolutePath(project.id, representativeShot.imageAsset),
      assetAbsolutePath(project.id, representativeShot.voiceAsset),
      sceneVideo
    );
    Object.assign(scene, sceneAssets);
    await saveSceneCheckpoint(project, scene, sceneAssets);
  } else {
    scene.videoAsset = assetRelativePath(project.id, sceneVideo);
  }

  scene.status = 'ready';
  scene.error = undefined;
  scene.qualityOverrideApproved = true;

  const now = new Date().toISOString();
  project.status = 'ready';
  project.error = undefined;
  project.progress = {
    phase: 'scene-approved',
    percent: Math.min(
      89,
      Math.round(
        (sceneOrder / Math.max(1, project.plan?.scenes.length || 1)) * 89
      )
    ),
    message:
      `Escena ${sceneOrder} “${scene.title}” aprobada 10/10 como unidad completa. Sus tomas quedan congeladas para reutilización.`,
    currentScene: sceneOrder,
    totalScenes: project.plan?.scenes.length,
    updatedAt: now
  };
  project.productionLog.push(
    now +
      ` Scene Review 5.0: escena ${sceneOrder} “${scene.title}” APROBADA 10/10; tomas congeladas.`
  );

  project = await saveProject(project);

  console.log('\n==================================================');
  console.log(' VIRALCINE — ESCENA APROBADA');
  console.log('==================================================');
  console.log(`Escena ${sceneOrder}: ${scene.title}`);
  console.log('Estado: ready');
  console.log('Tomas: congeladas/reutilizables');
  console.log('Video de escena: ' + (scene.videoAsset || 'NO DISPONIBLE'));
  console.log('Siguiente escena: ' + (sceneOrder + 1));
  console.log('SCENE_APPROVED=YES');
  process.exit(0);
}

if (action !== 'run') {
  throw new Error(
    `Acción desconocida “${action}”. Usa status, prepare, run, approve o diagnose.`
  );
}

applyFifteenDaysCoreVoiceLocksV5(project);
project = await saveProject(project);

const manifest = await buildSceneReviewManifestV5(project, sceneOrder);
printSceneReviewManifestV5(manifest);

if (!manifest.ready) {
  throw new Error(
    'SCENE REVIEW BLOQUEADO. Corrige los bloqueos del manifest antes de autorizar gasto.'
  );
}

markSceneForIntegratedRun(project, sceneOrder);
project = await saveProject(project);

console.log('\n==================================================');
console.log(' VIRALCINE — GENERANDO ESCENA COMPLETA');
console.log('==================================================');
console.log(`Escena ${sceneOrder}: ${manifest.sceneTitle}`);
console.log('Unidad de revisión: ESCENA COMPLETA');
console.log('Unidad de reparación: TOMA INDIVIDUAL');
console.log('Diálogo/lip-sync: INTEGRADO');
console.log('Música: ' + manifest.sound.projectMusic);
console.log('Ambiente/SFX: MANIFESTADOS; proveedor dedicado aún no activo');
console.log(
  'Tope del proyecto: US$' +
    manifest.spend.projectBudgetUsd.toFixed(2)
);
console.log(
  'Proyección previa: US$' +
    manifest.spend.projectedUsd.toFixed(4)
);
console.log('');

const result = await produceProjectV4(project.id, {
  targetSceneOrder: sceneOrder,
  reviewWholeScene: true,
  integrateSceneMusic: true
});

const completedScene = result.plan?.scenes.find(
  (item) => item.order === sceneOrder
);

console.log('\n==================================================');
console.log(' VIRALCINE — SCENE REVIEW 5.0');
console.log('==================================================');
console.log('Proyecto: ' + result.status);
console.log(
  'Escena: ' +
    (completedScene
      ? completedScene.order + ' · ' + completedScene.title
      : sceneOrder)
);
console.log(
  'Estado escena: ' +
    (completedScene?.status || 'desconocido')
);
console.log('T5/otras escenas futuras: NO se generan automáticamente');

if (completedScene?.videoAsset) {
  console.log(
    'SCENE_VIDEO=' +
      assetAbsolutePath(result.id, completedScene.videoAsset)
  );
}
console.log('SCENE_REVIEW_REQUIRED=' + (result.status === 'quality-review' ? 'YES' : 'NO'));

if (result.status !== 'quality-review') {
  console.log('PROJECT_ERROR=' + (result.error || 'SIN DETALLE'));
  console.error(
    'SCENE_RUN_INCOMPLETE=' + result.status +
    '. No repitas la generación hasta diagnosticar/reconciliar el estado.'
  );
  process.exit(3);
}
 + entry.estimatedUsd.toFixed(4)
      );
      console.log('  error=' + (entry.error || 'SIN DETALLE'));
      if (entry.providerRequestId) {
        console.log('  providerRequestId=' + entry.providerRequestId);
      }
    }
  }

  console.log('\nDIAGNOSE_ONLY=YES');
  console.log('APIs externas: NO');
  console.log('Gasto: US$0');
  process.exit(0);
}

if (action === 'prepare') {
  applyFifteenDaysCoreVoiceLocksV5(project);
  project = await saveProject(project);

  const manifest = await buildSceneReviewManifestV5(project, sceneOrder);
  printSceneReviewManifestV5(manifest);

  console.log('\nPREPARE_ONLY=YES');
  console.log('APIs externas: NO');
  console.log('Gasto: US$0');
  process.exit(manifest.ready ? 0 : 2);
}

if (action === 'approve') {
  const scene = sceneForReview(project, sceneOrder);

  if (scene.status !== 'review-required' && scene.status !== 'ready') {
    throw new Error(
      `La escena ${sceneOrder} no está lista para aprobación humana. Estado: ${scene.status}.`
    );
  }

  for (const shot of scene.shots) {
    if (!shot.videoAsset) {
      throw new Error(
        `No se puede aprobar la escena ${sceneOrder}: T${shot.order} no tiene video final.`
      );
    }
    shot.status = 'ready';
    shot.error = undefined;
    shot.qualityOverrideApproved = true;
    shot.qualityForceRegenerate = false;
    shot.safeFailoverResume = false;
  }

  const shotClips = scene.shots
    .sort((a, b) => a.order - b.order)
    .map((shot) => assetAbsolutePath(project.id, shot.videoAsset!));
  const sceneVideo = path.join(
    projectAssetDir(project.id, 'video'),
    'scene-' + String(scene.order).padStart(3, '0') + '.mp4'
  );
  await concatenate(shotClips, sceneVideo);

  const representativeShot = scene.shots.find(
    (shot) => Boolean(shot.imageAsset && shot.voiceAsset)
  );

  if (representativeShot?.imageAsset && representativeShot.voiceAsset) {
    const sceneAssets = renderedAssets(
      project.id,
      scene.mode === 'animated-image' ? 'ai-video' : scene.mode,
      assetAbsolutePath(project.id, representativeShot.imageAsset),
      assetAbsolutePath(project.id, representativeShot.voiceAsset),
      sceneVideo
    );
    Object.assign(scene, sceneAssets);
    await saveSceneCheckpoint(project, scene, sceneAssets);
  } else {
    scene.videoAsset = assetRelativePath(project.id, sceneVideo);
  }

  scene.status = 'ready';
  scene.error = undefined;
  scene.qualityOverrideApproved = true;

  const now = new Date().toISOString();
  project.status = 'ready';
  project.error = undefined;
  project.progress = {
    phase: 'scene-approved',
    percent: Math.min(
      89,
      Math.round(
        (sceneOrder / Math.max(1, project.plan?.scenes.length || 1)) * 89
      )
    ),
    message:
      `Escena ${sceneOrder} “${scene.title}” aprobada 10/10 como unidad completa. Sus tomas quedan congeladas para reutilización.`,
    currentScene: sceneOrder,
    totalScenes: project.plan?.scenes.length,
    updatedAt: now
  };
  project.productionLog.push(
    now +
      ` Scene Review 5.0: escena ${sceneOrder} “${scene.title}” APROBADA 10/10; tomas congeladas.`
  );

  project = await saveProject(project);

  console.log('\n==================================================');
  console.log(' VIRALCINE — ESCENA APROBADA');
  console.log('==================================================');
  console.log(`Escena ${sceneOrder}: ${scene.title}`);
  console.log('Estado: ready');
  console.log('Tomas: congeladas/reutilizables');
  console.log('Video de escena: ' + (scene.videoAsset || 'NO DISPONIBLE'));
  console.log('Siguiente escena: ' + (sceneOrder + 1));
  console.log('SCENE_APPROVED=YES');
  process.exit(0);
}

if (action !== 'run') {
  throw new Error(
    `Acción desconocida “${action}”. Usa status, prepare, run o approve.`
  );
}

applyFifteenDaysCoreVoiceLocksV5(project);
project = await saveProject(project);

const manifest = await buildSceneReviewManifestV5(project, sceneOrder);
printSceneReviewManifestV5(manifest);

if (!manifest.ready) {
  throw new Error(
    'SCENE REVIEW BLOQUEADO. Corrige los bloqueos del manifest antes de autorizar gasto.'
  );
}

markSceneForIntegratedRun(project, sceneOrder);
project = await saveProject(project);

console.log('\n==================================================');
console.log(' VIRALCINE — GENERANDO ESCENA COMPLETA');
console.log('==================================================');
console.log(`Escena ${sceneOrder}: ${manifest.sceneTitle}`);
console.log('Unidad de revisión: ESCENA COMPLETA');
console.log('Unidad de reparación: TOMA INDIVIDUAL');
console.log('Diálogo/lip-sync: INTEGRADO');
console.log('Música: ' + manifest.sound.projectMusic);
console.log('Ambiente/SFX: MANIFESTADOS; proveedor dedicado aún no activo');
console.log(
  'Tope del proyecto: US$' +
    manifest.spend.projectBudgetUsd.toFixed(2)
);
console.log(
  'Proyección previa: US$' +
    manifest.spend.projectedUsd.toFixed(4)
);
console.log('');

const result = await produceProjectV4(project.id, {
  targetSceneOrder: sceneOrder,
  reviewWholeScene: true,
  integrateSceneMusic: true
});

const completedScene = result.plan?.scenes.find(
  (item) => item.order === sceneOrder
);

console.log('\n==================================================');
console.log(' VIRALCINE — SCENE REVIEW 5.0');
console.log('==================================================');
console.log('Proyecto: ' + result.status);
console.log(
  'Escena: ' +
    (completedScene
      ? completedScene.order + ' · ' + completedScene.title
      : sceneOrder)
);
console.log(
  'Estado escena: ' +
    (completedScene?.status || 'desconocido')
);
console.log('T5/otras escenas futuras: NO se generan automáticamente');

if (completedScene?.videoAsset) {
  console.log(
    'SCENE_VIDEO=' +
      assetAbsolutePath(result.id, completedScene.videoAsset)
  );
}
console.log('SCENE_REVIEW_REQUIRED=' + (result.status === 'quality-review' ? 'YES' : 'NO'));
