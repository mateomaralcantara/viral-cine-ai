import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { estimatePilotShotSpend } from '@/lib/engine/pilot';
import { reservedMovieSpend } from '@/lib/engine/spend-ledger';
import { saveShotCheckpoint, type SceneAssets } from '@/lib/engine/scene-checkpoints';
import { getProject, saveProject } from '@/lib/storage/project-store';

loadProjectLocalEnvOverride();

const [projectId] = process.argv.slice(2);

if (!projectId) {
  console.error('Uso: npm run pilot:next15 -- <projectId>');
  process.exit(1);
}

const project = await getProject(projectId);

if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
  throw new Error('Este comando solo está autorizado para el proyecto 15 DÍAS.');
}
if (!project.plan) {
  throw new Error('El proyecto no tiene plan.');
}

const scene = project.plan.scenes[0];
const shotOne = scene?.shots.find((shot) => shot.id === 'pilot-15d-01');
const shotTwo = scene?.shots.find((shot) => shot.id === 'pilot-15d-02');

if (!scene || !shotOne || !shotTwo) {
  throw new Error('No encuentro E1/T1 o E1/T2 del preset 15 DÍAS.');
}

if (shotOne.status !== 'review-required' && shotOne.status !== 'ready') {
  throw new Error(
    `E1/T1 no está lista para aprobación humana. Estado actual: ${shotOne.status}.`
  );
}

if (!shotOne.imageAsset || !shotOne.voiceAsset || !shotOne.videoAsset) {
  throw new Error('E1/T1 no tiene todos los assets necesarios para congelarla como aprobada.');
}

const approvedAssets: SceneAssets = {
  mode: shotOne.mode,
  imageAsset: shotOne.imageAsset,
  voiceAsset: shotOne.voiceAsset,
  videoAsset: shotOne.videoAsset
};

await saveShotCheckpoint(project, scene, shotOne, approvedAssets);

shotOne.qualityOverrideApproved = true;
shotOne.qualityForceRegenerate = false;
shotOne.safeFailoverResume = false;
shotOne.status = 'ready';
shotOne.error = undefined;

if (!shotTwo.motionSpec) {
  throw new Error('E1/T2 perdió su especificación Real Motion.');
}

shotTwo.motionSpec = {
  ...shotTwo.motionSpec,
  preferredProviders: ['fal-video']
};
shotTwo.videoModelOverride = undefined;
shotTwo.qualityForceRegenerate = false;
shotTwo.safeFailoverResume = false;
shotTwo.lastGenerationState = undefined;
shotTwo.error = undefined;
shotTwo.status = 'pending';

scene.status = 'pending';
scene.error = undefined;

const currentReservedUsd = await reservedMovieSpend(project.id);
const nextEstimatedUsd = estimatePilotShotSpend(shotTwo);
const requiredCapUsd =
  Math.ceil((currentReservedUsd + nextEstimatedUsd + 0.05) * 100) / 100;

if (requiredCapUsd > 10) {
  throw new Error(
    `El siguiente piloto requeriría un límite de US$${requiredCapUsd.toFixed(2)}, superior al máximo de seguridad de US$10.`
  );
}

project.pilot = {
  enabled: true,
  maxScenes: 1,
  maxShotsPerScene: 2,
  maxSpendUsd: Math.max(project.pilot?.maxSpendUsd || 0.1, requiredCapUsd),
  approvedForFullProduction: false
};

const now = new Date().toISOString();
project.status = 'queued';
project.error = undefined;
project.progress = {
  phase: 'queued',
  percent: 10,
  message:
    'E1/T1 aprobada manualmente 10/10. E1/T2 La mesa detrás del cristal autorizada con Fal.ai; producción masiva sigue bloqueada.',
  currentScene: 1,
  totalScenes: project.plan.scenes.length,
  updatedAt: now
};
project.productionLog.push(
  `${now} E1/T1 La moneda aprobada manualmente por el usuario como visual 10/10; se conserva el video existente y no se regenera.`,
  `${now} Sound Design de E1/T1 queda para mezcla posterior en capas; no se altera el video Fal aprobado.`,
  `${now} E1/T2 La mesa detrás del cristal autorizada como única toma nueva del piloto; proveedor Fal.ai.`
);

const saved = await saveProject(project);

console.log('\n==================================================');
console.log(' VIRALCINE — AVANCE PILOTO 15 DÍAS');
console.log('==================================================');
console.log('E1/T1: APROBADA MANUALMENTE 10/10');
console.log('E1/T1 video: ' + shotOne.videoAsset);
console.log('E1/T1 Sound Design: diferido a mezcla posterior');
console.log('E1/T2: AUTORIZADA');
console.log('Título E1/T2: ' + shotTwo.title);
console.log('Proveedor E1/T2: fal-video');
console.log('Gasto contabilizado previo: US$' + currentReservedUsd.toFixed(2));
console.log('Estimación máxima siguiente toma: US$' + nextEstimatedUsd.toFixed(2));
console.log('Límite piloto ajustado: US$' + saved.pilot!.maxSpendUsd.toFixed(2));
console.log('Proyecto: ' + saved.status);
console.log('Producción masiva: BLOQUEADA');
console.log('NEXT_15_DIAS=QUEUED');
