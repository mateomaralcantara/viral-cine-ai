import test from 'node:test';
import assert from 'node:assert/strict';
import type { FilmProject } from '../lib/domain/schemas';
import { buildMasterExportPlan } from '../lib/engine/master-export-v4';

function fixture(): FilmProject {
  return {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
    status: 'ready',
    input: {
      title: 'Master Test',
      premise: 'Test',
      durationMinutes: 1,
      genre: 'Test',
      audience: 'Test',
      visualStyle: 'Cine',
      language: 'es',
      aspectRatio: '16:9',
      budgetUsd: 10,
      burnSubtitles: false,
      generateMusic: true
    },
    plan: {
      logline: 'Test',
      synopsis: 'Test',
      creativeDirection: 'Test',
      musicPrompt: 'Test',
      characters: [],
      scenes: [{
        id: 'scene-1',
        order: 1,
        act: 1,
        title: 'Escena',
        durationSeconds: 14,
        summary: 'Test',
        narration: '',
        dialogue: '',
        dialogueTurns: [],
        visualPrompt: 'Test',
        negativePrompt: '',
        camera: 'Test',
        soundDesign: '',
        transition: '',
        mode: 'ai-video',
        characterIds: [],
        shots: [
          {
            id: 'shot-1',
            order: 1,
            title: 'Uno',
            durationSeconds: 7,
            visualPrompt: 'Test',
            camera: 'Test',
            spokenText: 'Uno',
            dialogueLines: [],
            mode: 'video',
            characterIds: [],
            status: 'ready',
            videoAsset: 'video/one.mp4',
            pipelineVersion: '4.2-single-full-flow-music'
          },
          {
            id: 'shot-2',
            order: 2,
            title: 'Dos',
            durationSeconds: 7,
            visualPrompt: 'Test',
            camera: 'Test',
            spokenText: 'Dos',
            dialogueLines: [],
            mode: 'video',
            characterIds: [],
            status: 'ready',
            videoAsset: 'video/two.mp4',
            pipelineVersion: '4.2-segmented-full-flow-music',
            lastProvider: 'segmented-openai-localvideo-voice-local-lipsync-fallback-music'
          }
        ],
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

test('master plan ordena y acepta tomas aprobadas listas', () => {
  const result = buildMasterExportPlan(fixture());
  assert.equal(result.totalShots, 2);
  assert.equal(result.readyShots, 2);
  assert.equal(result.expectedDurationSeconds, 14);
  assert.equal(result.degradedLipSyncShots, 1);
  assert.deepEqual(result.blockers, []);
});

test('master plan bloquea pipeline legacy no aprobado', () => {
  const project = fixture();
  project.plan!.scenes[0].shots[1].pipelineVersion = '3.3-legacy';
  const result = buildMasterExportPlan(project);
  assert.equal(result.readyShots, 1);
  assert.equal(result.blockers.length, 1);
  assert.match(result.blockers[0], /E1\/T2/);
});


test('master plan acepta pipelines 5.0 y 6.0 aprobados', () => {
  const project = fixture();
  project.plan!.scenes[0].shots[0].pipelineVersion = '5.0-real-motion-v1';
  project.plan!.scenes[0].shots[1].pipelineVersion = '6.0-scene6b-repair';
  const result = buildMasterExportPlan(project);
  assert.equal(result.readyShots, 2);
  assert.deepEqual(result.blockers, []);
});

test('master export registra pelicula-final.mp4 para UI y descarga', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(
    new URL('../scripts/master-export-v4.ts', import.meta.url),
    'utf8'
  );

  assert.match(source, /path\.join\(exportDir, 'pelicula-final\.mp4'\)/);
  assert.match(source, /project\.finalVideoAsset = assetRelativePath/);
  assert.match(source, /phase: 'master-exported'/);
  assert.match(source, /saveProject\(project\)/);
  assert.match(source, /FINAL_VIDEO_ASSET=/);
});


test('master plan acepta exactamente el pipeline 4.0-audio-first aprobado', () => {
  const project = fixture();
  project.plan!.scenes[0].shots[0].pipelineVersion = '4.0-audio-first';
  project.plan!.scenes[0].shots[1].pipelineVersion = '4.0-audio-first';
  const result = buildMasterExportPlan(project);
  assert.equal(result.readyShots, 2);
  assert.deepEqual(result.blockers, []);
});

test('master plan no abre toda la familia 4.0: bloquea variantes desconocidas', () => {
  const project = fixture();
  project.plan!.scenes[0].shots[0].pipelineVersion = '4.0-legacy-unknown';
  const result = buildMasterExportPlan(project);
  assert.equal(result.readyShots, 1);
  assert.equal(result.blockers.length, 1);
  assert.match(result.blockers[0], /pipeline no aprobado para master/);
});
