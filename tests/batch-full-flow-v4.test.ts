import test from 'node:test';
import assert from 'node:assert/strict';
import type { FilmProject, FilmShot } from '../lib/domain/schemas';
import {
  buildBatchQueue,
  canFitBatchBudget,
  formatBatchMachineSummary,
  isFullFlow42Complete
} from '../lib/engine/batch-full-flow-v4';

function shot(
  id: string,
  order: number,
  pipelineVersion?: string,
  status: FilmShot['status'] = 'ready',
  dialogueLines = 1
): FilmShot {
  return {
    id,
    order,
    title: id,
    durationSeconds: 7,
    visualPrompt: '',
    camera: '',
    spokenText: 'Texto',
    speakerId: 'narrator',
    dialogueLines: Array.from({ length: dialogueLines }, (_, index) => ({
      id: id + '-l' + index,
      speakerId: index === 0 ? 'narrator' : 'other',
      text: 'Texto',
      startSeconds: index * 2,
      endSeconds: (index + 1) * 2
    })),
    mode: 'video',
    characterIds: [],
    status,
    pipelineVersion,
    videoAsset: pipelineVersion?.startsWith('4.2-') ? 'video/final.mp4' : undefined
  } as FilmShot;
}

function fixture(): FilmProject {
  return {
    id: 'p',
    createdAt: '',
    updatedAt: '',
    status: 'ready',
    input: {
      title: 'Batch',
      premise: 'Premisa suficientemente larga para la prueba del batch.',
      durationMinutes: 5,
      genre: 'Drama',
      audience: 'General',
      visualStyle: 'Cine',
      language: 'es',
      aspectRatio: '16:9',
      budgetUsd: 100,
      burnSubtitles: false,
      generateMusic: true
    },
    plan: {
      logline: '',
      synopsis: '',
      creativeDirection: '',
      musicPrompt: '',
      characters: [],
      scenes: [
        {
          id: 's1',
          order: 1,
          act: 1,
          title: 'S1',
          durationSeconds: 21,
          summary: '',
          narration: '',
          dialogue: '',
          dialogueTurns: [],
          visualPrompt: '',
          negativePrompt: '',
          camera: '',
          soundDesign: '',
          transition: '',
          mode: 'ai-video',
          characterIds: [],
          shots: [
            shot('a', 1, '4.2-single-full-flow-music'),
            shot('b', 2, undefined, 'ready', 1),
            shot('c', 3, undefined, 'ready', 3)
          ],
          status: 'ready'
        },
        {
          id: 's2',
          order: 2,
          act: 1,
          title: 'S2',
          durationSeconds: 7,
          summary: '',
          narration: '',
          dialogue: '',
          dialogueTurns: [],
          visualPrompt: '',
          negativePrompt: '',
          camera: '',
          soundDesign: '',
          transition: '',
          mode: 'ai-video',
          characterIds: [],
          shots: [shot('d', 1)],
          status: 'ready'
        }
      ]
    },
    progress: {
      phase: 'ready',
      percent: 100,
      message: '',
      updatedAt: ''
    },
    productionLog: []
  } as FilmProject;
}

test('reconoce toma 4.2 oficialmente completa', () => {
  assert.equal(isFullFlow42Complete(fixture().plan!.scenes[0].shots[0]), true);
  assert.equal(isFullFlow42Complete(fixture().plan!.scenes[0].shots[1]), false);
});

test('batch omite listas y conserva orden single/segmented', () => {
  const queue = buildBatchQueue(fixture());
  assert.deepEqual(
    queue.map((item) => [item.shotId, item.kind]),
    [['b', 'single'], ['c', 'segmented'], ['d', 'single']]
  );
});

test('batch respeta escena, from-shot y maxShots', () => {
  assert.deepEqual(
    buildBatchQueue(fixture(), { sceneOrder: 1, maxShots: 1 }).map((x) => x.shotId),
    ['b']
  );
  assert.deepEqual(
    buildBatchQueue(fixture(), { fromShotId: 'c' }).map((x) => x.shotId),
    ['c', 'd']
  );
});

test('budget cap incluye el siguiente costo antes de autorizarlo', () => {
  assert.equal(canFitBatchBudget(1.2, 0.8, 2), true);
  assert.equal(canFitBatchBudget(1.2, 0.8001, 2), false);
});


test('resumen batch machine-readable usa ASCII estable para PowerShell', () => {
  const lines = formatBatchMachineSummary({
    selectedShots: 9,
    preflightPass: 9,
    blocked: 0,
    estimatedUsd: 9.7073
  });

  assert.deepEqual(lines, [
    'BATCH_SELECTED_SHOTS=9',
    'BATCH_PREFLIGHT_PASS=9',
    'BATCH_BLOCKED=0',
    'BATCH_ESTIMATED_USD=9.7073'
  ]);

  assert.equal(lines.every((line) => /^[\x20-\x7E]+$/.test(line)), true);
});
