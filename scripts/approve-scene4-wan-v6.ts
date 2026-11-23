import { access } from 'node:fs/promises';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  assetAbsolutePath,
  getProject,
  saveProject
} from '@/lib/storage/project-store';
import { assertCinematicSceneVideo } from '@/lib/media/probe';

loadProjectLocalEnvOverride();

const [projectId, confirmation] = process.argv.slice(2);
const EXPECTED = '--approve-scene4-wan3';

if (!projectId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene4:approve -- <projectId> ' + EXPECTED
  );
  process.exit(1);
}

const project = await getProject(projectId);

if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
  throw new Error('Este comando solo está autorizado para 15 DÍAS.');
}

if (!project.plan || project.plan.scenes.length !== 6) {
  throw new Error(
    'Se esperaba la versión short de 6 escenas.'
  );
}

const scene4 = project.plan.scenes.find((item) => item.order === 4);
if (!scene4 || scene4.id !== 'scene-15d-short-04') {
  throw new Error('No encuentro Escena 4 short.');
}

if (!scene4.videoAsset?.endsWith('scene-004-wan3-lipsync-v6.mp4')) {
  throw new Error(
    'Escena 4 no apunta al master WAN 3.0 aprobado.'
  );
}

const videoPath = assetAbsolutePath(project.id, scene4.videoAsset);
await access(videoPath);
await assertCinematicSceneVideo(
  videoPath,
  30,
  {
    requireMotion: true,
    requireAudibleAudio: true
  }
);

const ordered = [...scene4.shots].sort((a, b) => a.order - b.order);
if (ordered.length !== 5) {
  throw new Error('Escena 4 aprobada debe conservar 5 tomas.');
}

for (const shot of ordered) {
  if (!shot.videoAsset || shot.status !== 'ready') {
    throw new Error(
      'E4/T' + shot.order + ' no está ready con video.'
    );
  }
  await access(assetAbsolutePath(project.id, shot.videoAsset));
}

if (
  ordered[0]?.pipelineVersion !== '6.0-scene4-wan3-audio-reference' ||
  ordered[1]?.pipelineVersion !== '6.0-scene4-wan3-audio-reference'
) {
  throw new Error(
    'T1-T2 no corresponden al master WAN 3.0 aprobado.'
  );
}

scene4.status = 'ready';
scene4.qualityOverrideApproved = true;
scene4.error = undefined;

project.status = 'ready';
project.error = undefined;
project.progress = {
  phase: 'scene-4-approved',
  percent: 67,
  message:
    'Escena 4 “Quince días” aprobada por revisión humana. Preparar Escena 5.',
  currentScene: 5,
  totalScenes: 6,
  updatedAt: new Date().toISOString()
};

project.productionLog.push(
  new Date().toISOString() +
    ' APROBACION HUMANA: Escena 4 WAN 3.0 aprobada. Master congelado; no regenerar.'
);

await saveProject(project);

console.log('\n==================================================');
console.log(' VIRALCINE 6 — ESCENA 4 APROBADA');
console.log('==================================================');
console.log('Master: ' + videoPath);
console.log('Estado: ready');
console.log('Regeneración ejecutada: NO');
console.log('APIs externas: NO');
console.log('Gasto: US$0');
console.log('SCENE4_APPROVED=YES');
