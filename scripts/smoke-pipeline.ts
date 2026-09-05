import { readdir, stat } from 'node:fs/promises';
import { ProjectInputSchema } from '../lib/domain/schemas';
import { createDemoPlan } from '../lib/engine/demo-plan';
import { estimateBudget } from '../lib/engine/budget';
import { produceProject } from '../lib/engine/producer';
import { recoverInterruptedProjects } from '../lib/engine/recovery';
import { assetAbsolutePath, createProject, getProject, projectAssetDir, saveProject } from '../lib/storage/project-store';

process.env.PRODUCTION_MODE = 'demo';
process.env.VIRALCINE_DATA_DIR ||= '.data-smoke';

const input = ProjectInputSchema.parse({
  title: 'Prueba integral ViralCine',
  premise: 'Una producción técnica breve verifica automáticamente el guion, las escenas, el audio, el montaje y la exportación.',
  durationMinutes: 10,
  genre: 'Prueba técnica',
  audience: 'Equipo de producción',
  visualStyle: 'Cinematográfico limpio',
  budgetUsd: 50,
  generateMusic: false,
  burnSubtitles: true
});

let project = await createProject(input);
const plan = createDemoPlan(input);
plan.scenes = plan.scenes.slice(0, 12).map((scene) => ({
  ...scene,
  durationSeconds: 5,
  narration: `Prueba técnica de la escena ${scene.order}.`,
  dialogue: '',
  shots: []
}));
project.plan = plan;
project.budget = estimateBudget(input, plan);
project.status = 'queued';
project = await saveProject(project);
project = await produceProject(project.id);

if (!project.finalVideoAsset) throw new Error('La prueba terminó sin película final.');
if (!project.plan?.scenes[0].videoAsset) throw new Error('La prueba terminó sin clip de escena.');
const firstClip = assetAbsolutePath(project.id, project.plan.scenes[0].videoAsset);
const firstClipBeforeRecovery = await stat(firstClip);

project.status = 'producing';
project.plan.scenes[1].status = 'rendering';
project.progress = {
  ...project.progress,
  phase: 'scenes',
  percent: 30,
  message: 'Interrupción simulada para comprobar la reanudación',
  currentScene: 2,
  updatedAt: new Date().toISOString()
};
await saveProject(project);
const recoveredProjects = await recoverInterruptedProjects();
project = await getProject(project.id);
project = await produceProject(project.id);

if (!project.finalVideoAsset) throw new Error('La recuperación terminó sin película final.');
const firstClipAfterRecovery = await stat(firstClip);
if (firstClipAfterRecovery.mtimeMs !== firstClipBeforeRecovery.mtimeMs) {
  throw new Error('La recuperación regeneró una escena que ya estaba validada.');
}
const checkpointCount = (await readdir(projectAssetDir(project.id, 'checkpoints')))
  .filter((file) => /^scene-\d{3}\.json$/.test(file)).length;
const shotCheckpointCount = (await readdir(projectAssetDir(project.id, 'checkpoints')))
  .filter((file) => /^scene-\d{3}-shot-\d{2}\.json$/.test(file)).length;
if (shotCheckpointCount !== 12) throw new Error(`Se esperaban 12 checkpoints de toma y se encontraron ${shotCheckpointCount}.`);
const finalPath = assetAbsolutePath(project.id, project.finalVideoAsset);
const info = await stat(finalPath);
console.log(JSON.stringify({
  ok: true,
  recoveryOk: true,
  recoveredProjects,
  checkpointCount,
  shotCheckpointCount,
  projectId: project.id,
  finalPath,
  bytes: info.size
}, null, 2));
