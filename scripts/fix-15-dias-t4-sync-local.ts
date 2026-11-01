import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { normalizeGeneratedVideoWithEmbeddedAudio } from '@/lib/media/ffmpeg';
import { probeVideo } from '@/lib/media/probe';
import { publishSceneVideo, saveShotCheckpoint } from '@/lib/engine/scene-checkpoints';
import { assetAbsolutePath, getProject, projectAssetDir, saveProject } from '@/lib/storage/project-store';

loadProjectLocalEnvOverride();

const [projectId] = process.argv.slice(2);

if (!projectId) {
  console.error('Uso: npm run pilot:fix-t4-sync -- <projectId>');
  process.exit(1);
}

const project = await getProject(projectId);

if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
  throw new Error('Este comando solo está autorizado para el proyecto 15 DÍAS.');
}
if (!project.plan) throw new Error('El proyecto no tiene plan.');

const scene = project.plan.scenes[0];
const shot = scene?.shots.find((item) => item.id === 'pilot-15d-04');

if (!scene || !shot) {
  throw new Error('No encuentro E1/T4 “La maleta”.');
}

if (project.status !== 'quality-review' || shot.status !== 'review-required') {
  throw new Error(
    'La reparación de sincronía solo puede ejecutarse desde quality-review/review-required. ' +
    'Proyecto=' + project.status + ', T4=' + shot.status + '.'
  );
}

if (!shot.lipSyncAsset || !shot.videoAsset || !shot.imageAsset || !shot.voiceAsset) {
  throw new Error('T4 no tiene los assets necesarios para una reparación local de sincronía.');
}

const lipSyncPath = assetAbsolutePath(project.id, shot.lipSyncAsset);
const finalPath = assetAbsolutePath(project.id, shot.videoAsset);
const probe = await probeVideo(lipSyncPath);

const tolerance = Math.max(0.25, shot.durationSeconds * 0.05);
const minimumDuration = Math.max(0.12, shot.durationSeconds - tolerance);

if (!probe.hasVideo || !probe.hasAudio || probe.durationSeconds < minimumDuration) {
  throw new Error(
    'El raw lip-sync no es utilizable sin otra llamada al proveedor: video=' + probe.hasVideo +
    ', audio=' + probe.hasAudio + ', duración=' + probe.durationSeconds.toFixed(2) +
    's, mínimo=' + minimumDuration.toFixed(2) + 's. NO se ejecutó ninguna API.'
  );
}

const videoDir = projectAssetDir(project.id, 'video');
const rejectedDir = path.join(videoDir, 'rejected');
await mkdir(rejectedDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rejectedFinal = path.join(rejectedDir, 'scene-001-shot-04-audio-desync-' + stamp + '.mp4');
const partialPath = path.join(videoDir, 'scene-001-shot-04-sync-fix-' + stamp + '.partial.mp4');

await copyFile(finalPath, rejectedFinal);

try {
  await normalizeGeneratedVideoWithEmbeddedAudio(
    lipSyncPath,
    shot.durationSeconds,
    partialPath,
    project.input.aspectRatio
  );

  await publishSceneVideo(partialPath, finalPath, shot.durationSeconds, {
    requireAudibleAudio: true,
    requireMotion: true
  });
} finally {
  await rm(partialPath, { force: true });
}

shot.qualityScore = undefined;
shot.qualityAttempts = undefined;
shot.qualityIssues = undefined;
shot.qualityReportAsset = undefined;
shot.qualityOverrideApproved = false;
shot.qualityForceRegenerate = false;
shot.safeFailoverResume = false;
shot.status = 'review-required';
shot.error = 'T4 recompuesta usando el audio embebido del lip-sync; requiere revisión manual de sincronía.';

scene.status = 'review-required';
scene.qualityScore = undefined;
scene.qualityAttempts = undefined;
scene.qualityIssues = undefined;
scene.qualityReportAsset = undefined;
scene.qualityOverrideApproved = false;
scene.error = 'E1/T4 recompuesta con audio sincronizado del proveedor; revisión manual requerida.';

project.status = 'quality-review';
project.error = undefined;

const now = new Date().toISOString();
project.progress = {
  phase: 'quality-review',
  percent: 14,
  message: 'Revisa E1/T4: se preservó el audio embebido del lip-sync para mantener voz y labios en la misma línea temporal.',
  currentScene: 1,
  totalScenes: project.plan.scenes.length,
  updatedAt: now
};

project.productionLog.push(
  now + ' E1/T4 rechazada manualmente por desincronía voz/labios.',
  now + ' Diagnóstico: el final reemplazaba el audio embebido por el MP3 original durante normalización, rompiendo el timing que Fal había sincronizado.',
  now + ' Reparación LOCAL: se recompuso T4 preservando video+audio del raw lip-sync como una unidad temporal. APIs externas: NO. Gasto adicional: US$0.'
);

await saveShotCheckpoint(project, scene, shot, {
  mode: shot.mode,
  imageAsset: shot.imageAsset,
  voiceAsset: shot.voiceAsset,
  videoAsset: shot.videoAsset
});

const saved = await saveProject(project);

console.log('\n==================================================');
console.log(' VIRALCINE — T4 VOZ/LABIOS REPARADOS LOCALMENTE');
console.log('==================================================');
console.log('Raw lip-sync: ' + shot.lipSyncAsset);
console.log('Raw contiene video: ' + probe.hasVideo);
console.log('Raw contiene audio: ' + probe.hasAudio);
console.log('Duración raw: ' + probe.durationSeconds.toFixed(3) + ' s');
console.log('Audio usado en FINAL: audio EMBEBIDO por Fal en el lip-sync');
console.log('MP3 externo reinsertado: NO');
console.log('Loop de video: NO');
console.log('API externa ejecutada: NO');
console.log('Gasto adicional: US$0');
console.log('T1-T3: CONSERVADAS');
console.log('T5: BLOQUEADA');
console.log('Estado: ' + saved.status);
console.log('T4_SYNC=REVIEW_REQUIRED');
console.log('Final desincronizado preservado: ' + rejectedFinal);
