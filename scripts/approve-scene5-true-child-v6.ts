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
const EXPECTED = '--approve-scene5-true-child';

if (!projectId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene5:approve -- <projectId> ' + EXPECTED
  );
  process.exit(1);
}

if (
  process.env.ALLOW_EXTERNAL_API_CALLS === 'true' ||
  process.env.ALLOW_PAID_GENERATION === 'true'
) {
  throw new Error('La aprobación debe ejecutarse con APIs pagadas bloqueadas.');
}

const project = await getProject(projectId);

if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
  throw new Error('Este comando solo está autorizado para 15 DÍAS.');
}

if (!project.plan || project.plan.scenes.length !== 6) {
  throw new Error('Se esperaba la versión short de 6 escenas.');
}

const scene5 = project.plan.scenes.find((item) => item.order === 5);
if (!scene5 || scene5.id !== 'scene-15d-short-05') {
  throw new Error('No encuentro Escena 5 short.');
}

if (
  !scene5.videoAsset?.endsWith(
    'scene-005-wan3-reunion-v6-mateo-true-child.mp4'
  )
) {
  throw new Error(
    'Escena 5 no apunta al master Mateo true-child aprobado.'
  );
}

const master = assetAbsolutePath(project.id, scene5.videoAsset);
await access(master);

await assertCinematicSceneVideo(
  master,
  30,
  {
    requireMotion: true,
    requireAudibleAudio: true
  }
);

const ordered = [...scene5.shots].sort((a, b) => a.order - b.order);
if (ordered.length !== 6) {
  throw new Error('Escena 5 aprobada debe conservar 6 tomas.');
}

for (const shot of ordered) {
  if (!shot.videoAsset || shot.status !== 'ready') {
    throw new Error(
      'E5/T' + shot.order + ' no está ready con video.'
    );
  }
  await access(assetAbsolutePath(project.id, shot.videoAsset));
}

for (const order of [3, 5]) {
  const shot = ordered.find((item) => item.order === order);
  if (!shot) throw new Error('Falta E5/T' + order + '.');

  if (
    shot.pipelineVersion !== '6.0-scene5-mateo-true-child' ||
    !shot.videoAsset?.includes('true-child-final.mp4')
  ) {
    throw new Error(
      'E5/T' + order +
      ' no corresponde a la voz infantil aprobada de Mateo.'
    );
  }
}

scene5.status = 'ready';
scene5.qualityOverrideApproved = true;
scene5.error = undefined;

project.status = 'ready';
project.error = undefined;
project.progress = {
  phase: 'scene-5-approved',
  percent: 92,
  message:
    'Escena 5 “De verdad” aprobada por revisión humana. Preparar Escena 6 final.',
  currentScene: 6,
  totalScenes: 6,
  updatedAt: new Date().toISOString()
};

project.productionLog.push(
  new Date().toISOString() +
    ' APROBACION HUMANA: Escena 5 aprobada con master Mateo true-child. Master congelado; no regenerar.'
);

await saveProject(project);

console.log('\n==================================================');
console.log(' VIRALCINE 6 — ESCENA 5 APROBADA');
console.log('==================================================');
console.log('Master: ' + master);
console.log('Mateo T3/T5: TRUE CHILD aprobado');
console.log('Estado: ready');
console.log('qualityOverrideApproved: true');
console.log('Regeneración ejecutada: NO');
console.log('APIs externas: NO');
console.log('Gasto: US$0');
console.log('Siguiente: Escena 6 “Ese capítulo sí”');
console.log('SCENE5_APPROVED=YES');
