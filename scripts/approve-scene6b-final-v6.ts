import { access } from 'node:fs/promises';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  assetAbsolutePath,
  getProject,
  saveProject
} from '@/lib/storage/project-store';
import { assertCinematicSceneVideo } from '@/lib/media/probe';
import {
  SCENE6_ELENA_ID_V6,
  SCENE6_SOFIA_ID_V6,
  SCENE6_MATEO_ID_V6
} from '@/lib/engine/scene6-closing-plan-v6';
import {
  SCENE6B_DIALOGUE_V6
} from '@/lib/engine/scene6b-repair-spec-v6';

loadProjectLocalEnvOverride();

const [projectId, confirmation] = process.argv.slice(2);
const EXPECTED = '--approve-scene6b-final';

if (!projectId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene6b:approve -- <projectId> ' + EXPECTED
  );
  process.exit(1);
}

if (
  process.env.ALLOW_EXTERNAL_API_CALLS === 'true' ||
  process.env.ALLOW_PAID_GENERATION === 'true' ||
  process.env.ALLOW_PAID_PROVIDER_FALLBACK === 'true'
) {
  throw new Error(
    'La aprobación final debe ejecutarse con APIs pagadas bloqueadas.'
  );
}

const project = await getProject(projectId);

if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
  throw new Error('Este comando solo está autorizado para 15 DÍAS.');
}

if (!project.plan || project.plan.scenes.length !== 6) {
  throw new Error('Se esperaba la versión short de 6 escenas.');
}

const scene6 = project.plan.scenes.find((item) => item.order === 6);
if (!scene6 || scene6.id !== 'scene-15d-short-06') {
  throw new Error('No encuentro Escena 6 short.');
}

if (
  !scene6.videoAsset?.endsWith('scene-006b-repair-v6.mp4')
) {
  throw new Error(
    'Escena 6 no apunta al master 6B aprobado.'
  );
}

const master = assetAbsolutePath(project.id, scene6.videoAsset);
await access(master);

await assertCinematicSceneVideo(
  master,
  12,
  {
    requireMotion: true,
    requireAudibleAudio: true
  }
);

const ordered = [...scene6.shots].sort((a, b) => a.order - b.order);

if (ordered.length !== 3) {
  throw new Error(
    'Escena 6B aprobada debe conservar exactamente 3 tomas.'
  );
}

for (const shot of ordered) {
  if (!shot.videoAsset || shot.status !== 'ready') {
    throw new Error(
      'E6B/T' + shot.order + ' no está ready con video.'
    );
  }
  await access(assetAbsolutePath(project.id, shot.videoAsset));
}

const t1 = ordered[0];
const t2 = ordered[1];
const t3 = ordered[2];

if (
  t1.spokenText ||
  t1.characterIds.length !== 1 ||
  t1.characterIds[0] !== SCENE6_SOFIA_ID_V6
) {
  throw new Error(
    'E6B/T1 aprobada debe ser Sofía únicamente y silenciosa.'
  );
}

if (
  t2.spokenText !== SCENE6B_DIALOGUE_V6 ||
  t2.speakerId !== SCENE6_ELENA_ID_V6 ||
  t2.characterIds.length !== 1 ||
  t2.characterIds[0] !== SCENE6_ELENA_ID_V6
) {
  throw new Error(
    'E6B/T2 aprobada debe ser Elena únicamente con el diálogo final.'
  );
}

const t3Expected = [
  SCENE6_ELENA_ID_V6,
  SCENE6_SOFIA_ID_V6,
  SCENE6_MATEO_ID_V6
];

if (
  t3.spokenText ||
  JSON.stringify(t3.characterIds) !== JSON.stringify(t3Expected)
) {
  throw new Error(
    'E6B/T3 aprobada debe conservar Elena + Sofía + Mateo y ser silenciosa.'
  );
}

for (const shot of ordered) {
  if (shot.pipelineVersion !== '6.0-scene6b-repair') {
    throw new Error(
      'E6B/T' + shot.order +
      ' no corresponde al pipeline final Scene 6B Repair.'
    );
  }
}

scene6.status = 'ready';
scene6.qualityOverrideApproved = true;
scene6.error = undefined;

project.status = 'ready';
project.error = undefined;
project.progress = {
  phase: 'film-complete',
  percent: 100,
  message:
    '15 DÍAS completado. Escena 6B aprobada por revisión humana y congelada como cierre final.',
  currentScene: 6,
  totalScenes: 6,
  updatedAt: new Date().toISOString()
};

project.productionLog.push(
  new Date().toISOString() +
    ' APROBACION HUMANA FINAL: Escena 6B aprobada. Master scene-006b-repair-v6.mp4 congelado; no regenerar. 15 DÍAS short completado.'
);

await saveProject(project);

console.log('\n==================================================');
console.log(' VIRALCINE 6 — ESCENA 6B APROBADA / FINAL');
console.log('==================================================');
console.log('Master: ' + master);
console.log('T1: Sofía únicamente · APROBADA');
console.log('T2: Elena únicamente + diálogo final · APROBADA');
console.log('T3: Elena + Sofía + Mateo · APROBADA');
console.log('Estado escena: ready');
console.log('qualityOverrideApproved: true');
console.log('Estado proyecto: ready');
console.log('Progreso: 100%');
console.log('Regeneración ejecutada: NO');
console.log('APIs externas: NO');
console.log('Gasto: US$0');
console.log('MASTER_FROZEN=YES');
console.log('SCENE6B_APPROVED=YES');
console.log('FILM_COMPLETE=YES');
