import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { estimatePilotShotSpend } from '@/lib/engine/pilot';
import { reservedMovieSpend } from '@/lib/engine/spend-ledger';
import { saveShotCheckpoint, type SceneAssets } from '@/lib/engine/scene-checkpoints';
import { getProject, saveProject } from '@/lib/storage/project-store';

loadProjectLocalEnvOverride();

const [projectId, nextOrderRaw] = process.argv.slice(2);
const nextOrder = Number(nextOrderRaw);

if (!projectId || !Number.isInteger(nextOrder)) {
  console.error('Uso: npm run pilot:advance15 -- <projectId> <nextShotOrder>');
  process.exit(1);
}
if (nextOrder < 2 || nextOrder > 5) {
  throw new Error('Este comando progresivo cubre únicamente E1/T2 a E1/T5.');
}

const project = await getProject(projectId);

if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
  throw new Error('Este comando solo está autorizado para el proyecto 15 DÍAS.');
}
if (!project.plan) throw new Error('El proyecto no tiene plan.');

const scene = project.plan.scenes[0];
if (!scene) throw new Error('No existe la escena 1.');

const previousOrder = nextOrder - 1;
const previous = scene.shots.find((shot) => shot.order === previousOrder);
const next = scene.shots.find((shot) => shot.order === nextOrder);

if (!previous || !next) {
  throw new Error(`No encuentro E1/T${previousOrder} o E1/T${nextOrder}.`);
}

if (previous.status !== 'review-required' && previous.status !== 'ready') {
  throw new Error(
    `E1/T${previousOrder} no está lista para aprobación humana. Estado: ${previous.status}.`
  );
}

if (!previous.imageAsset || !previous.voiceAsset || !previous.videoAsset) {
  throw new Error(
    `E1/T${previousOrder} no tiene todos los assets necesarios para congelarla como aprobada.`
  );
}

const approvedAssets: SceneAssets = {
  mode: previous.mode,
  imageAsset: previous.imageAsset,
  voiceAsset: previous.voiceAsset,
  videoAsset: previous.videoAsset
};

await saveShotCheckpoint(project, scene, previous, approvedAssets);

previous.qualityOverrideApproved = true;
previous.qualityForceRegenerate = false;
previous.safeFailoverResume = false;
previous.status = 'ready';
previous.error = undefined;

if (!next.motionSpec) {
  throw new Error(`E1/T${nextOrder} perdió su especificación Real Motion.`);
}

next.motionSpec = {
  ...next.motionSpec,
  preferredProviders: ['fal-video'],
  allowStillFallbackFinal: false
};
next.videoModelOverride = undefined;
next.qualityForceRegenerate = false;
next.safeFailoverResume = false;
next.lastGenerationState = undefined;
next.error = undefined;
next.status = 'pending';

scene.status = 'pending';
scene.error = undefined;

const currentReservedUsd = await reservedMovieSpend(project.id);
const nextEstimatedUsd = estimatePilotShotSpend(next);
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
  maxShotsPerScene: nextOrder,
  maxSpendUsd: Math.max(project.pilot?.maxSpendUsd || 0.1, requiredCapUsd),
  approvedForFullProduction: false
};

const now = new Date().toISOString();
project.status = 'queued';
project.error = undefined;
project.progress = {
  phase: 'queued',
  percent: Math.min(25, 8 + nextOrder * 2),
  message:
    `E1/T${previousOrder} aprobada manualmente 10/10. E1/T${nextOrder} ${next.title} autorizada con Fal.ai; producción masiva sigue bloqueada.`,
  currentScene: 1,
  totalScenes: project.plan.scenes.length,
  updatedAt: now
};
project.productionLog.push(
  `${now} E1/T${previousOrder} ${previous.title} aprobada manualmente por el usuario como 10/10; se conserva el video existente.`,
  `${now} E1/T${nextOrder} ${next.title} autorizada como única toma nueva del piloto; proveedor Fal.ai.`
);

const saved = await saveProject(project);

console.log('\n==================================================');
console.log(' VIRALCINE — AVANCE PROGRESIVO ESCENA 1');
console.log('==================================================');
console.log(`E1/T${previousOrder}: APROBADA MANUALMENTE 10/10`);
console.log('Video conservado: ' + previous.videoAsset);
console.log(`E1/T${nextOrder}: AUTORIZADA`);
console.log('Título: ' + next.title);
console.log('Proveedor: fal-video');
console.log('Gasto contabilizado previo: US$' + currentReservedUsd.toFixed(4));
console.log('Estimación máxima siguiente toma: US$' + nextEstimatedUsd.toFixed(4));
console.log('Límite piloto ajustado: US$' + saved.pilot!.maxSpendUsd.toFixed(2));
console.log('Proyecto: ' + saved.status);
console.log('Producción masiva: BLOQUEADA');
console.log(`NEXT_E1_T${nextOrder}=QUEUED`);
