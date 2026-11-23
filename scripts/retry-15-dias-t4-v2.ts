import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { estimatePilotShotSpend } from '@/lib/engine/pilot';
import { resetSceneQuality } from '@/lib/engine/quality-review';
import { reservedMovieSpend } from '@/lib/engine/spend-ledger';
import { dataRoot, getProject, projectRoot, saveProject } from '@/lib/storage/project-store';
import { FIFTEEN_DAYS_PILOT_SHOTS_V5 } from '@/lib/production-presets/fifteen-days-pilot-v5';

loadProjectLocalEnvOverride();

const [projectId] = process.argv.slice(2);

if (!projectId) {
  console.error('Uso: npm run pilot:retry-t4 -- <projectId>');
  process.exit(1);
}

const project = await getProject(projectId);

if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
  throw new Error('Este comando solo está autorizado para el proyecto 15 DÍAS.');
}
if (!project.plan) throw new Error('El proyecto no tiene plan.');
if (project.status !== 'quality-review') {
  throw new Error(`E1/T4 solo puede corregirse desde quality-review. Estado actual: ${project.status}.`);
}

const scene = project.plan.scenes[0];
const shot = scene?.shots.find((item) => item.id === 'pilot-15d-04');
const corrected = FIFTEEN_DAYS_PILOT_SHOTS_V5.find((item) => item.id === 'pilot-15d-04');

if (!scene || !shot || !corrected) {
  throw new Error('No encuentro E1/T4 “La maleta” o su corrección V2.');
}
if (shot.status !== 'review-required') {
  throw new Error(`E1/T4 no está en revisión manual. Estado: ${shot.status}.`);
}
if ((shot.generationCount || 0) !== 1) {
  throw new Error(
    `Reintento controlado bloqueado: E1/T4 registra ${shot.generationCount || 0} generaciones; se esperaba exactamente 1.`
  );
}
if (!shot.motionSpec || !corrected.motionSpec) {
  throw new Error('E1/T4 perdió su especificación Real Motion.');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(dataRoot(), 'backups', `t4-v1-rejected-${stamp}`, project.id);
await mkdir(backupDir, { recursive: true });
const backupPath = path.join(backupDir, 'project.json');
await copyFile(path.join(projectRoot(project.id), 'project.json'), backupPath);

shot.visualPrompt = corrected.visualPrompt;
shot.camera = corrected.camera;
shot.motionSpec = {
  ...corrected.motionSpec,
  preferredProviders: ['fal-video'],
  allowStillFallbackFinal: false
};

await resetSceneQuality(project.id, scene, shot);

shot.safeFailoverResume = false;
shot.lastGenerationState = undefined;
shot.error = undefined;
scene.status = 'pending';
scene.error = undefined;

const currentReservedUsd = await reservedMovieSpend(project.id);
const retryEstimatedUsd = estimatePilotShotSpend(shot);
const requiredCapUsd =
  Math.ceil((currentReservedUsd + retryEstimatedUsd + 0.05) * 100) / 100;

if (requiredCapUsd > 10) {
  throw new Error(
    `El reintento de T4 requeriría límite US$${requiredCapUsd.toFixed(2)}, superior al máximo piloto US$10.`
  );
}

project.pilot = {
  enabled: true,
  maxScenes: 1,
  maxShotsPerScene: 4,
  maxSpendUsd: Math.max(project.pilot?.maxSpendUsd || 0.1, requiredCapUsd),
  approvedForFullProduction: false
};

const now = new Date().toISOString();
project.status = 'queued';
project.error = undefined;
project.progress = {
  phase: 'queued',
  percent: 14,
  message:
    'E1/T4 V1 rechazada por el usuario: bucle al doblar ropa y hablante poco claro. V2 autorizada con una sola colocación de camisa y Elena claramente encuadrada como hablante.',
  currentScene: 1,
  totalScenes: project.plan.scenes.length,
  updatedAt: now
};
project.productionLog.push(
  `${now} E1/T4 V1 RECHAZADA manualmente: acción de doblar ropa repetitiva y Elena no se percibe con claridad como hablante.`,
  `${now} E1/T4 V2 preparada: Raúl coloca UNA camisa UNA vez y se detiene; Elena queda visible en tres cuartos, orientada a Raúl y con labios legibles para “¿Adónde vas?”.`,
  `${now} Reintento controlado de E1/T4 autorizado con Fal.ai. T1-T3 permanecen congeladas y T5 sigue bloqueada.`
);

const saved = await saveProject(project);

console.log('\n==================================================');
console.log(' VIRALCINE — E1/T4 V2 PREPARADA');
console.log('==================================================');
console.log('T1-T3: CONSERVADAS');
console.log('T4 V1: RECHAZADA');
console.log('T4 V2: AUTORIZADA');
console.log('Corrección 1: una sola camisa, una sola colocación, SIN BUCLE');
console.log('Corrección 2: Elena visible/orientada a Raúl como hablante');
console.log('Voz Elena: se reutiliza si ya existe');
console.log('Proveedor video: fal-video');
console.log('Gasto contabilizado previo: US$' + currentReservedUsd.toFixed(4));
console.log('Estimación máxima reintento T4: US$' + retryEstimatedUsd.toFixed(4));
console.log('Límite piloto ajustado: US$' + saved.pilot!.maxSpendUsd.toFixed(2));
console.log('T5: BLOQUEADA');
console.log('T4_V2=QUEUED');
console.log('Backup: ' + backupPath);
