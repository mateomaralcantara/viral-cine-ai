import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FilmShotSchema, type FilmProject } from '../lib/domain/schemas';
import { ensureProjectFolders, projectAssetDir } from '../lib/storage/project-store';
import { createSyntheticMotionVideo } from '../lib/media/synthetic-video';
import { planSingleRenderTiming, renderSingleShotReal } from '../lib/engine/single-real-renderer-v4';

const PROJECT_ID = '77777777-8888-4999-8aaa-bbbbbbbbbbbb';

function fixture(speakerId: 'narrator' | 'pilato'): FilmProject {
  return {
    id: PROJECT_ID,
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
    status: 'ready',
    input: {
      title: 'Single real lip-sync test',
      premise: 'Prueba offline de narración y de personaje individual con sincronización facial.',
      durationMinutes: 5,
      genre: 'Test',
      audience: 'Equipo',
      visualStyle: 'Cine',
      language: 'es',
      aspectRatio: '16:9',
      budgetUsd: 5,
      burnSubtitles: false,
      generateMusic: false
    },
    plan: {
      logline: 'Test',
      synopsis: 'Test',
      creativeDirection: 'Test',
      musicPrompt: 'Test',
      characters: [{
        id: 'pilato',
        name: 'Pilato',
        role: 'Gobernador',
        age: 50,
        appearance: 'Rostro firme',
        wardrobe: 'Túnica romana',
        personality: 'Contenido',
        voiceInstructions: 'Voz masculina firme',
        voiceProvider: 'elevenlabs',
        imagePrompt: 'Pilato'
      }],
      scenes: [{
        id: 'scene-1',
        order: 1,
        act: 1,
        title: 'Escena',
        durationSeconds: 4,
        summary: 'Test',
        narration: '',
        dialogue: '',
        dialogueTurns: [],
        visualPrompt: 'Patio de piedra del siglo I.',
        negativePrompt: '',
        camera: 'Primer plano estable.',
        soundDesign: '',
        transition: '',
        mode: 'ai-video',
        characterIds: speakerId === 'pilato' ? ['pilato'] : [],
        shots: [{
          id: 'single-shot',
          order: 1,
          title: 'Single',
          durationSeconds: 4,
          visualPrompt: 'Plano estable.',
          camera: 'Primer plano.',
          spokenText: speakerId === 'pilato' ? 'No encuentro motivo para condenarlo.' : 'La mañana avanzaba sobre Jerusalén.',
          speakerId,
          dialogueLines: [{
            id: 'line-1',
            speakerId,
            text: speakerId === 'pilato' ? 'No encuentro motivo para condenarlo.' : 'La mañana avanzaba sobre Jerusalén.',
            startSeconds: 0,
            endSeconds: 4
          }],
          mode: 'video',
          characterIds: speakerId === 'pilato' ? ['pilato'] : [],
          status: 'ready'
        }],
        status: 'ready'
      }]
    },
    progress: {
      phase: 'ready',
      percent: 100,
      message: 'Test',
      updatedAt: '2026-10-04T00:00:00.000Z'
    },
    productionLog: []
  } as FilmProject;
}

async function prepareVisual(project: FilmProject) {
  await ensureProjectFolders(project.id);
  const scene = project.plan!.scenes[0];
  const shot = scene.shots[0];
  const folder = 'scene-01-shot-01-' + shot.id;
  const refPath = path.join(
    projectAssetDir(project.id, 'images'),
    'single-v4-sources',
    folder,
    'reference.png'
  );
  const videoPath = path.join(
    projectAssetDir(project.id, 'video'),
    'single-v4-sources',
    folder,
    'base-real.mp4'
  );
  await mkdir(path.dirname(refPath), { recursive: true });
  await mkdir(path.dirname(videoPath), { recursive: true });
  await writeFile(refPath, Buffer.from('offline-reference'));
  await createSyntheticMotionVideo(4, videoPath, '16:9');
}

async function withTempData(run: (root: string) => Promise<void>) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'viralcine-single-real-'));
  const previousDataDir = process.env.VIRALCINE_DATA_DIR;
  const previousMode = process.env.PRODUCTION_MODE;
  const previousExternal = process.env.ALLOW_EXTERNAL_API_CALLS;
  const previousPaid = process.env.ALLOW_PAID_GENERATION;
  try {
    process.env.VIRALCINE_DATA_DIR = tempRoot;
    process.env.PRODUCTION_MODE = 'demo';
    process.env.ALLOW_EXTERNAL_API_CALLS = 'false';
    process.env.ALLOW_PAID_GENERATION = 'false';
    await run(tempRoot);
  } finally {
    if (previousDataDir === undefined) delete process.env.VIRALCINE_DATA_DIR;
    else process.env.VIRALCINE_DATA_DIR = previousDataDir;
    if (previousMode === undefined) delete process.env.PRODUCTION_MODE;
    else process.env.PRODUCTION_MODE = previousMode;
    if (previousExternal === undefined) delete process.env.ALLOW_EXTERNAL_API_CALLS;
    else process.env.ALLOW_EXTERNAL_API_CALLS = previousExternal;
    if (previousPaid === undefined) delete process.env.ALLOW_PAID_GENERATION;
    else process.env.ALLOW_PAID_GENERATION = previousPaid;
    await rm(tempRoot, { recursive: true, force: true });
  }
}

test('single narrador mantiene ruta sin lip-sync', async () => {
  await withTempData(async () => {
    const project = fixture('narrator');
    await prepareVisual(project);
    const scene = project.plan!.scenes[0];
    const result = await renderSingleShotReal(project, scene, scene.shots[0]);
    assert.equal(result.lipSyncRequired, false);
    assert.match(result.outputAsset, /final-real\.mp4$/);
    assert.equal(result.sourcePreserved, true);
  });
});

test('single personaje visible entra a lip-sync y versiona la salida', async () => {
  await withTempData(async () => {
    const project = fixture('pilato');
    await prepareVisual(project);
    const scene = project.plan!.scenes[0];
    const result = await renderSingleShotReal(project, scene, scene.shots[0]);
    assert.equal(result.lipSyncRequired, true);
    assert.match(result.outputAsset, /final-real-lipsync\.mp4$/);
    assert.equal(result.sourcePreserved, true);
  });
});


test('autoajuste E3/T2 respeta schema 4-8s y usa rescate off-camera mínimo', () => {
  const plan = planSingleRenderTiming(9.799, 7, { allowNarrationRescue: true });
  assert.equal(plan.durationAdjusted, true);
  assert.equal(plan.outputDurationSeconds, 8);
  assert.equal(Number.isInteger(plan.outputDurationSeconds), true);
  assert.equal(plan.rescueSpeedUsed, true);
  assert.ok(plan.speedFactor > 1.2);
  assert.ok(plan.speedFactor <= 1.25);

  const project = fixture('narrator');
  const shot = project.plan!.scenes[0].shots[0];
  shot.durationSeconds = plan.outputDurationSeconds;
  assert.doesNotThrow(() => FilmShotSchema.parse(shot));
});

test('autoajuste conserva duración si la voz ya cabe dentro de 1.2x', () => {
  const plan = planSingleRenderTiming(8.0, 7, { allowNarrationRescue: true });
  assert.equal(plan.durationAdjusted, false);
  assert.equal(plan.outputDurationSeconds, 7);
  assert.equal(plan.rescueSpeedUsed, false);
  assert.ok(plan.speedFactor < 1.2);
});

test('diálogo visible no usa rescate por encima de 1.2x', () => {
  assert.throws(
    () => planSingleRenderTiming(9.799, 7, { allowNarrationRescue: false }),
    /diálogo visible no permite rescate/
  );
});

test('E6/T5 usa rescate excepcional del narrador sin romper el schema', () => {
  const plan = planSingleRenderTiming(10.542, 7, {
    allowNarrationRescue: true,
    allowEmergencyNarrationRescue: true
  });

  assert.equal(plan.outputDurationSeconds, 8);
  assert.equal(plan.durationAdjusted, true);
  assert.equal(plan.rescueSpeedUsed, true);
  assert.equal(plan.emergencyNarrationRescueUsed, true);
  assert.ok(plan.speedFactor > 1.25);
  assert.ok(plan.speedFactor <= 1.33);

  const project = fixture('narrator');
  const shot = project.plan!.scenes[0].shots[0];
  shot.durationSeconds = plan.outputDurationSeconds;
  assert.doesNotThrow(() => FilmShotSchema.parse(shot));
});

test('el rescate excepcional no se activa si no se autoriza explícitamente', () => {
  assert.throws(
    () => planSingleRenderTiming(10.542, 7, {
      allowNarrationRescue: true,
      allowEmergencyNarrationRescue: false
    }),
    /rescate seguro de narración llega a 1.25x/
  );
});

test('autoajuste bloquea narración que excede incluso el rescate excepcional 1.33x', () => {
  assert.throws(
    () => planSingleRenderTiming(14, 7, {
      allowNarrationRescue: true,
      allowEmergencyNarrationRescue: true
    }),
    /rescate excepcional del narrador llega a 1.33x/
  );
});
