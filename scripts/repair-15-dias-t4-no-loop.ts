import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { appendSpend, assertSpendRetrySafe, estimateOperationCost, reservedMovieSpend } from '@/lib/engine/spend-ledger';
import { safeErrorMessage } from '@/lib/engine/production-safety';
import { publishSceneVideo, saveShotCheckpoint } from '@/lib/engine/scene-checkpoints';
import { normalizeGeneratedVideo } from '@/lib/media/ffmpeg';
import { generateFalLipSync } from '@/lib/providers/fal-media';
import {
  assetAbsolutePath,
  assetRelativePath,
  getProject,
  projectAssetDir,
  saveProject
} from '@/lib/storage/project-store';

loadProjectLocalEnvOverride();

const [projectId] = process.argv.slice(2);
if (!projectId) {
  console.error('Uso: npm run pilot:repair-t4-no-loop -- <projectId>');
  process.exit(1);
}

const project = await getProject(projectId);
if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
  throw new Error('Este comando solo está autorizado para el proyecto 15 DÍAS.');
}
if (!project.plan) throw new Error('El proyecto no tiene plan.');

const scene = project.plan.scenes[0];
const shot = scene?.shots.find((item) => item.id === 'pilot-15d-04');
if (!scene || !shot) throw new Error('No encuentro E1/T4 “La maleta”.');

if (project.status !== 'quality-review' || shot.status !== 'review-required') {
  throw new Error(
    `La reparación T4 no-loop solo puede ejecutarse desde quality-review/review-required. Proyecto=${project.status}, T4=${shot.status}.`
  );
}
if (!shot.imageAsset || !shot.voiceAsset || !shot.baseVideoAsset || !shot.videoAsset) {
  throw new Error('T4 no tiene image/voice/base/final completos para una reparación sin regenerar video.');
}

const currentSpend = await reservedMovieSpend(project.id);
const lipSyncEstimate = estimateOperationCost('lip-sync', shot.durationSeconds);
const projectedSpend = Math.ceil((currentSpend + lipSyncEstimate) * 10000) / 10000;

if (projectedSpend > 10) {
  throw new Error(
    `Reparación bloqueada: gasto proyectado US$${projectedSpend.toFixed(4)} supera el máximo piloto US$10.`
  );
}

const key = 'lip-sync-repair:pilot-15d-04:no-repeat-v1';
await assertSpendRetrySafe(project.id, key, 'reparación lip-sync T4 sin repetición');

const videoDir = projectAssetDir(project.id, 'video');
const rejectedDir = path.join(videoDir, 'rejected');
await mkdir(rejectedDir, { recursive: true });

const basePath = assetAbsolutePath(project.id, shot.baseVideoAsset);
const voicePath = assetAbsolutePath(project.id, shot.voiceAsset);
const finalPath = assetAbsolutePath(project.id, shot.videoAsset);
const canonicalLipSyncPath = shot.lipSyncAsset
  ? assetAbsolutePath(project.id, shot.lipSyncAsset)
  : path.join(videoDir, 'scene-001-shot-04-lipsync-raw.mp4');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rejectedFinal = path.join(rejectedDir, `scene-001-shot-04-repeat-v2-${stamp}.mp4`);
const rejectedLip = path.join(rejectedDir, `scene-001-shot-04-lipsync-cutoff-v2-${stamp}.mp4`);

await copyFile(finalPath, rejectedFinal);
try {
  await copyFile(canonicalLipSyncPath, rejectedLip);
} catch {
  // El final defectuoso queda preservado aunque el raw histórico no exista.
}

const repairRaw = path.join(videoDir, `scene-001-shot-04-lipsync-no-loop-${stamp}.mp4`);
const repairFinal = path.join(videoDir, `scene-001-shot-04-no-loop-${stamp}.partial.mp4`);

process.env.FAL_LIPSYNC_SYNC_MODE = 'silence';

await appendSpend(project.id, {
  operation: 'lip-sync',
  provider: 'fal',
  model: process.env.FAL_LIPSYNC_MODEL || 'fal-ai/sync-lipsync/v3',
  state: 'reserved',
  estimatedUsd: lipSyncEstimate,
  sceneId: scene.id,
  shotId: shot.id,
  idempotencyKey: key
});
await appendSpend(project.id, {
  operation: 'lip-sync',
  provider: 'fal',
  model: process.env.FAL_LIPSYNC_MODEL || 'fal-ai/sync-lipsync/v3',
  state: 'submitted',
  estimatedUsd: lipSyncEstimate,
  sceneId: scene.id,
  shotId: shot.id,
  idempotencyKey: key
});

try {
  await generateFalLipSync(basePath, voicePath, repairRaw);

  await appendSpend(project.id, {
    operation: 'lip-sync',
    provider: 'fal',
    model: process.env.FAL_LIPSYNC_MODEL || 'fal-ai/sync-lipsync/v3',
    state: 'succeeded',
    estimatedUsd: lipSyncEstimate,
    sceneId: scene.id,
    shotId: shot.id,
    idempotencyKey: key,
    outputAsset: repairRaw
  });
} catch (error) {
  await appendSpend(project.id, {
    operation: 'lip-sync',
    provider: 'fal',
    model: process.env.FAL_LIPSYNC_MODEL || 'fal-ai/sync-lipsync/v3',
    state: 'failed-unknown',
    estimatedUsd: lipSyncEstimate,
    sceneId: scene.id,
    shotId: shot.id,
    idempotencyKey: key,
    error: safeErrorMessage(error)
  });
  throw error;
}

try {
  await normalizeGeneratedVideo(
    repairRaw,
    voicePath,
    shot.durationSeconds,
    repairFinal,
    project.input.aspectRatio
  );

  await publishSceneVideo(repairFinal, finalPath, shot.durationSeconds, {
    requireAudibleAudio: true,
    requireMotion: true
  });

  await copyFile(repairRaw, canonicalLipSyncPath);
} finally {
  await rm(repairFinal, { force: true });
}

shot.lipSyncAsset = assetRelativePath(project.id, canonicalLipSyncPath);
shot.videoAsset = assetRelativePath(project.id, finalPath);
shot.qualityScore = undefined;
shot.qualityAttempts = undefined;
shot.qualityIssues = undefined;
shot.qualityReportAsset = undefined;
shot.qualityOverrideApproved = false;
shot.qualityForceRegenerate = false;
shot.safeFailoverResume = false;
shot.status = 'review-required';
shot.error = 'T4 reparada sin repetición de video; requiere revisión manual.';

scene.status = 'review-required';
scene.qualityScore = undefined;
scene.qualityAttempts = undefined;
scene.qualityIssues = undefined;
scene.qualityReportAsset = undefined;
scene.qualityOverrideApproved = false;
scene.error = 'E1/T4 reparada sin loop; revisión manual requerida.';

project.status = 'quality-review';
project.error = undefined;
project.pilot = {
  enabled: true,
  maxScenes: 1,
  maxShotsPerScene: 4,
  maxSpendUsd: Math.max(project.pilot?.maxSpendUsd || 0.1, Math.ceil((projectedSpend + 0.05) * 100) / 100),
  approvedForFullProduction: false
};

const now = new Date().toISOString();
project.progress = {
  phase: 'quality-review',
  percent: 14,
  message: 'Revisa E1/T4 reparada: video continuo, diálogo una sola vez, sin repetir la escena como relleno.',
  currentScene: 1,
  totalScenes: project.plan.scenes.length,
  updatedAt: now
};
project.productionLog.push(
  `${now} E1/T4 V2 rechazada por repetición visual: el lip-sync corto era rellenado mediante loop de video.`,
  `${now} E1/T4 reparada reutilizando el video base y la voz existentes; Fal lip-sync ejecutado en modo silence y normalización sin stream_loop.`,
  `${now} No se regeneró imagen ni video Fal base; T1-T3 permanecen congeladas y T5 sigue bloqueada.`
);

await saveShotCheckpoint(project, scene, shot, {
  mode: shot.mode,
  imageAsset: shot.imageAsset,
  voiceAsset: shot.voiceAsset,
  videoAsset: shot.videoAsset
});

const saved = await saveProject(project);

console.log('\n==================================================');
console.log(' VIRALCINE — T4 REPARADA SIN REPETICION');
console.log('==================================================');
console.log('Video base Fal: REUTILIZADO');
console.log('Voz Elena: REUTILIZADA');
console.log('Imagen: REUTILIZADA');
console.log('Lip-sync: REGENERADO UNA VEZ con sync_mode=silence');
console.log('Loop de video: PROHIBIDO');
console.log('T4 generationCount: ' + (shot.generationCount || 0) + ' (sin nueva generación de video base)');
console.log('Gasto previo: US$' + currentSpend.toFixed(4));
console.log('Estimación reparación lip-sync: US$' + lipSyncEstimate.toFixed(4));
console.log('Gasto proyectado: US$' + projectedSpend.toFixed(4));
console.log('Estado: ' + saved.status);
console.log('T5: BLOQUEADA');
console.log('T4_NO_LOOP=REVIEW_REQUIRED');
console.log('Final defectuoso preservado: ' + rejectedFinal);
