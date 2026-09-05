import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ProjectInputSchema } from '../lib/domain/schemas';
import { createDemoPlan } from '../lib/engine/demo-plan';
import { recoverInterruptedProjects } from '../lib/engine/recovery';
import {
  publishSceneVideo,
  renderedAssets,
  reusableSceneAssets,
  reusableShotAssets,
  saveSceneCheckpoint,
  saveShotCheckpoint,
  sceneCheckpointPath,
  shotCheckpointPath,
  temporarySceneVideoPath
} from '../lib/engine/scene-checkpoints';
import { createPlaceholderImage, createSilenceAudio, renderAnimatedImage } from '../lib/media/ffmpeg';
import { checkFfmpeg } from '../lib/media/ffmpeg-check';
import {
  createProject,
  getProject,
  projectAssetDir,
  saveProject
} from '../lib/storage/project-store';

const input = ProjectInputSchema.parse({
  title: 'Prueba de recuperación',
  premise: 'Una producción interrumpida conserva sus escenas completas y continúa desde el punto seguro.',
  durationMinutes: 10,
  genre: 'Prueba técnica',
  audience: 'Equipo interno',
  visualStyle: 'Cinematográfico limpio',
  budgetUsd: 50,
  generateMusic: false
});

test('publica, valida y reutiliza una escena mediante checkpoint', async (context) => {
  if (!(await checkFfmpeg())) return context.skip('FFmpeg no está disponible');
  const previousDataDir = process.env.VIRALCINE_DATA_DIR;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'viralcine-checkpoint-'));
  process.env.VIRALCINE_DATA_DIR = directory;
  try {
    let project = await createProject(input);
    project.plan = createDemoPlan(input);
    project = await saveProject(project);
    if (!project.plan) throw new Error('El proyecto de prueba no contiene plan.');
    const scene = project.plan.scenes[0];
    scene.durationSeconds = 1;

    const image = path.join(projectAssetDir(project.id, 'images'), 'scene-001.png');
    const voice = path.join(projectAssetDir(project.id, 'audio'), 'scene-001.mp3');
    const video = path.join(projectAssetDir(project.id, 'video'), 'scene-001.mp4');
    const partial = temporarySceneVideoPath(video);
    await createPlaceholderImage(scene.title, scene.summary, image, input);
    await createSilenceAudio(1, voice);
    await renderAnimatedImage(image, voice, 1, partial, '16:9');
    await publishSceneVideo(partial, video, 1);

    const assets = renderedAssets(project.id, scene.mode, image, voice, video);
    await saveSceneCheckpoint(project, scene, assets);
    assert.ok((await stat(sceneCheckpointPath(project.id, 1))).size > 100);

    const restored = await reusableSceneAssets(project, { ...scene, status: 'pending' });
    assert.deepEqual(restored, assets);

    await writeFile(video, 'archivo interrumpido', 'utf8');
    assert.equal(await reusableSceneAssets(project, scene), undefined);
  } finally {
    if (previousDataDir === undefined) delete process.env.VIRALCINE_DATA_DIR;
    else process.env.VIRALCINE_DATA_DIR = previousDataDir;
    await rm(directory, { recursive: true, force: true });
  }
});

test('el worker vuelve a encolar un proyecto detenido sin borrar escenas listas', async () => {
  const previousDataDir = process.env.VIRALCINE_DATA_DIR;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'viralcine-recovery-'));
  process.env.VIRALCINE_DATA_DIR = directory;
  try {
    let project = await createProject(input);
    project.plan = createDemoPlan(input);
    project.status = 'producing';
    project.plan.scenes[0].status = 'ready';
    project.plan.scenes[0].shots[0].status = 'ready';
    project.plan.scenes[1].status = 'rendering';
    project.plan.scenes[1].shots[0].status = 'rendering';
    project.plan.scenes[1].shots[0].error = 'Proceso terminado abruptamente';
    project.plan.scenes[1].error = 'Proceso terminado abruptamente';
    project = await saveProject(project);

    assert.equal(await recoverInterruptedProjects(), 1);
    const recovered = await getProject(project.id);
    assert.equal(recovered.status, 'queued');
    assert.equal(recovered.plan?.scenes[0].status, 'ready');
    assert.equal(recovered.plan?.scenes[0].shots[0].status, 'ready');
    assert.equal(recovered.plan?.scenes[1].status, 'pending');
    assert.equal(recovered.plan?.scenes[1].shots[0].status, 'pending');
    assert.equal(recovered.plan?.scenes[1].shots[0].error, undefined);
    assert.equal(recovered.plan?.scenes[1].error, undefined);
    assert.equal(recovered.progress.phase, 'recovery');
  } finally {
    if (previousDataDir === undefined) delete process.env.VIRALCINE_DATA_DIR;
    else process.env.VIRALCINE_DATA_DIR = previousDataDir;
    await rm(directory, { recursive: true, force: true });
  }
});

test('publica y reutiliza una toma sin depender del resto de la escena', async (context) => {
  if (!(await checkFfmpeg())) return context.skip('FFmpeg no está disponible');
  const previousDataDir = process.env.VIRALCINE_DATA_DIR;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'viralcine-shot-checkpoint-'));
  process.env.VIRALCINE_DATA_DIR = directory;
  try {
    let project = await createProject(input);
    project.plan = createDemoPlan(input);
    project = await saveProject(project);
    if (!project.plan) throw new Error('El proyecto de prueba no contiene plan.');
    const scene = project.plan.scenes[0];
    const shot = scene.shots[0];
    const key = 'scene-001-shot-01';
    const image = path.join(projectAssetDir(project.id, 'images'), `${key}.png`);
    const voice = path.join(projectAssetDir(project.id, 'audio'), `${key}.mp3`);
    const video = path.join(projectAssetDir(project.id, 'video'), `${key}.mp4`);
    const partial = temporarySceneVideoPath(video);
    await createPlaceholderImage(shot.title, shot.visualPrompt, image, input);
    await createSilenceAudio(shot.durationSeconds, voice);
    await renderAnimatedImage(image, voice, shot.durationSeconds, partial, '16:9');
    await publishSceneVideo(partial, video, shot.durationSeconds);
    const assets = renderedAssets(project.id, shot.mode, image, voice, video);
    await saveShotCheckpoint(project, scene, shot, assets);
    assert.ok((await stat(shotCheckpointPath(project.id, 1, 1))).size > 100);
    assert.deepEqual(await reusableShotAssets(project, scene, shot), assets);
  } finally {
    if (previousDataDir === undefined) delete process.env.VIRALCINE_DATA_DIR;
    else process.env.VIRALCINE_DATA_DIR = previousDataDir;
    await rm(directory, { recursive: true, force: true });
  }
});
