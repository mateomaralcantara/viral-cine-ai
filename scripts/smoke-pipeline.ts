import { readdir, rm, stat } from 'node:fs/promises';
import { ProjectInputSchema } from '../lib/domain/schemas';
import { createDemoPlan } from '../lib/engine/demo-plan';
import { estimateBudget } from '../lib/engine/budget';
import { produceProjectV4 } from '../lib/engine/producer-v4';
import { recoverInterruptedProjects } from '../lib/engine/recovery';
import { assetAbsolutePath, createProject, getProject, projectAssetDir, saveProject } from '../lib/storage/project-store';

process.env.PRODUCTION_MODE = 'demo';
process.env.REAL_CINEMA_PIPELINE = 'true';
process.env.ALLOW_EXTERNAL_API_CALLS = 'false';
process.env.ALLOW_PAID_GENERATION = 'false';
process.env.PILOT_MODE = 'false';
process.env.FAKE_PROVIDER_SCENARIO = 'success';
process.env.VIRALCINE_DATA_DIR ||= '.data-smoke-v4';

await rm(process.env.VIRALCINE_DATA_DIR, { recursive: true, force: true });

const input = ProjectInputSchema.parse({
  title: 'Prueba integral ViralCine 4.0',
  premise: 'Una producción técnica breve verifica automáticamente audio primero, video en movimiento, checkpoints, montaje y recuperación.',
  durationMinutes: 5,
  genre: 'Prueba técnica',
  audience: 'Equipo de producción',
  visualStyle: 'Cinematográfico limpio',
  budgetUsd: 50,
  generateMusic: false,
  burnSubtitles: true
});

let project = await createProject(input);
const plan = createDemoPlan(input);
plan.scenes = plan.scenes.slice(0, 12).map((scene, index) => ({
  ...scene,
  order: index + 1,
  durationSeconds: 5,
  narration: `Prueba técnica de la escena ${index + 1}.`,
  dialogue: '',
  dialogueTurns: [],
  mode: 'ai-video' as const,
  shots: [],
  status: 'pending' as const,
  imageAsset: undefined,
  voiceAsset: undefined,
  videoAsset: undefined,
  error: undefined
}));
project.plan = plan;
project.budget = estimateBudget(input, plan);
project.status = 'queued';
project = await saveProject(project);
project = await produceProjectV4(project.id);

if (project.status !== 'ready') throw new Error(`La prueba 4.0 terminó en estado ${project.status}: ${project.error || ''}`);
if (!project.finalVideoAsset) throw new Error('La prueba terminó sin película final.');
if (!project.plan?.scenes[0].videoAsset) throw new Error('La prueba terminó sin clip de escena.');
const firstClip = assetAbsolutePath(project.id, project.plan.scenes[0].videoAsset);
const firstClipBeforeRecovery = await stat(firstClip);

project.status = 'producing';
project.plan.scenes[1].status = 'rendering';
project.progress = {
  ...project.progress,
  phase: 'real-cinema',
  percent: 30,
  message: 'Interrupción simulada para comprobar la reanudación 4.0',
  currentScene: 2,
  updatedAt: new Date().toISOString()
};
await saveProject(project);
const recoveredProjects = await recoverInterruptedProjects();
project = await getProject(project.id);
project = await produceProjectV4(project.id);

if (project.status !== 'ready') throw new Error(`La recuperación 4.0 terminó en ${project.status}: ${project.error || ''}`);
if (!project.finalVideoAsset) throw new Error('La recuperación terminó sin película final.');
const firstClipAfterRecovery = await stat(firstClip);
if (firstClipAfterRecovery.mtimeMs !== firstClipBeforeRecovery.mtimeMs) {
  throw new Error('La recuperación regeneró un segmento ya validado.');
}
const checkpointFiles = await readdir(projectAssetDir(project.id, 'checkpoints'));
const sceneCheckpointCount = checkpointFiles.filter((file) => /^scene-\d{3}\.json$/.test(file)).length;
const shotCheckpointCount = checkpointFiles.filter((file) => /^scene-\d{3}-shot-\d{2}\.json$/.test(file)).length;
if (shotCheckpointCount !== 12) throw new Error(`Se esperaban 12 checkpoints de segmento y se encontraron ${shotCheckpointCount}.`);
if (sceneCheckpointCount !== 12) throw new Error(`Se esperaban 12 checkpoints de escena y se encontraron ${sceneCheckpointCount}.`);
const finalPath = assetAbsolutePath(project.id, project.finalVideoAsset);
const info = await stat(finalPath);
if (info.size < 1024) throw new Error('La película final parece vacía o corrupta.');

console.log(JSON.stringify({
  ok: true,
  pipeline: '4.0-audio-first',
  productionMode: 'demo',
  externalCalls: false,
  recoveryOk: true,
  recoveredProjects,
  sceneCheckpointCount,
  shotCheckpointCount,
  projectId: project.id,
  finalPath,
  bytes: info.size
}, null, 2));
