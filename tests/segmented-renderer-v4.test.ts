import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FilmProject } from '../lib/domain/schemas';
import { ensureProjectFolders, projectAssetDir } from '../lib/storage/project-store';
import { createSyntheticMotionVideo } from '../lib/media/synthetic-video';
import { probeMediaDurationSeconds } from '../lib/media/segmented-ffmpeg';
import {
  buildSegmentedShotPlan,
  previewSegmentedRenderer,
  renderSegmentedShotOffline
} from '../lib/engine/segmented-renderer-v4';
import { buildSegmentedVisualPlan } from '../lib/engine/segmented-visual-plan-v4';

const PROJECT_ID = '11111111-2222-4333-8444-555555555555';

function fixture(): FilmProject {
  return {
    id: PROJECT_ID,
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    status: 'ready',
    input: {
      title: 'Segmented Renderer Test',
      premise: 'Prueba offline no destructiva de una toma multihablante con tres subsegmentos temporales.',
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
        id: 'character-a',
        name: 'A',
        role: 'Protagonista',
        age: 30,
        appearance: 'Test',
        wardrobe: 'Test',
        personality: 'Test',
        voiceInstructions: 'Serena',
        voiceProvider: 'elevenlabs',
        imagePrompt: 'Test'
      }],
      scenes: [{
        id: 'scene-1',
        order: 1,
        act: 1,
        title: 'Escena',
        durationSeconds: 7,
        summary: 'Test',
        narration: 'Inicio narrado.',
        dialogue: 'A: Hola.; B: Sigue.',
        dialogueTurns: [],
        visualPrompt: 'Test',
        negativePrompt: '',
        camera: 'Test',
        soundDesign: '',
        transition: '',
        mode: 'ai-video',
        characterIds: ['character-a'],
        shots: [{
          id: 'shot-mixed',
          order: 1,
          title: 'Mixta',
          durationSeconds: 7,
          visualPrompt: 'Test',
          camera: 'Test',
          spokenText: 'Inicio narrado. A: Hola. B: Sigue.',
          dialogueLines: [
            { id: 'turn-1', speakerId: 'narrator', text: 'Inicio narrado.', startSeconds: 0, endSeconds: 2.333 },
            { id: 'turn-2', speakerId: 'character-a', text: 'Hola.', startSeconds: 2.333, endSeconds: 4.667 },
            { id: 'turn-3', speakerId: 'support-b', text: 'Sigue.', startSeconds: 4.667, endSeconds: 7 }
          ],
          mode: 'video',
          characterIds: ['character-a'],
          status: 'ready',
          videoAsset: 'video/source-segmented-test.mp4'
        }],
        status: 'ready'
      }]
    },
    supportVoices: [{
      id: 'support-b',
      label: 'B',
      voiceInstructions: 'Firme',
      voiceProvider: 'elevenlabs',
      source: 'legacy-support'
    }],
    progress: { phase: 'ready', percent: 100, message: 'Test', updatedAt: '2026-09-06T00:00:00.000Z' },
    productionLog: []
  } as FilmProject;
}

test('preview valida una toma multihablante continua sin imponer mínimo de 4s por turno', () => {
  const project = fixture();
  const scene = project.plan!.scenes[0];
  const shot = scene.shots[0];
  const plan = buildSegmentedShotPlan(project, scene, shot);
  assert.equal(plan.turns.length, 3);
  assert.equal(plan.turns[0].durationSeconds, 2.333);
  assert.ok(plan.turns[1].durationSeconds < 4);
  assert.equal(plan.turns[0].requiresLipSync, false);
  assert.equal(plan.turns[1].requiresLipSync, true);

  const preview = previewSegmentedRenderer(project);
  assert.equal(preview.mixedShots, 1);
  assert.equal(preview.readyShots, 1);
  assert.equal(preview.blockedShots, 0);
  assert.equal(preview.turns, 3);
});

test('plan visual 4.1 separa narrador, hablante y multitud en coberturas distintas', () => {
  const project = fixture();
  project.supportVoices![0].label = 'Multitud';
  const scene = project.plan!.scenes[0];
  const shot = scene.shots[0];

  shot.visualPrompt = 'CONTAMINATED PARENT SHOT. Plano general. NARRADOR: otro texto. MULTITUD: otro texto.';
  const visual = buildSegmentedVisualPlan(project, scene, shot);
  assert.equal(visual.version, '4.1-per-turn-visual');
  assert.equal(visual.turns.length, 3);
  assert.equal(visual.turns[0].role, 'establishing');
  assert.equal(visual.turns[1].role, 'speaker-closeup');
  assert.equal(visual.turns[1].requiresLipSync, true);
  assert.equal(visual.turns[1].visiblePeopleLimit, 2);
  assert.equal(visual.turns[2].role, 'crowd-reaction');
  assert.equal(visual.turns[2].requiresLipSync, false);
  assert.deepEqual(
    visual.turns.map((turn) => turn.providerDurationSeconds),
    [4, 4, 4]
  );
  assert.match(visual.turns[1].prompt, /mouth unobstructed/i);
  assert.match(visual.turns[1].prompt, /Hola\./);
  assert.doesNotMatch(visual.turns[1].prompt, /CONTAMINATED PARENT SHOT/);
  assert.doesNotMatch(visual.turns[1].prompt, /otro texto/);
  assert.deepEqual(visual.turns[1].referenceCharacterIds, ['character-a']);
  assert.match(visual.turns[2].prompt, /representative group/i);
  assert.deepEqual(visual.turns[2].referenceCharacterIds, []);
});

test('plan bloquea huecos temporales antes de renderizar', () => {
  const project = fixture();
  const scene = project.plan!.scenes[0];
  const shot = scene.shots[0];
  shot.dialogueLines[1].startSeconds = 2.5;
  assert.throws(
    () => buildSegmentedShotPlan(project, scene, shot),
    /hueco/i
  );
});

test('render offline recompone 7s en una ruta derivada y conserva SHA256 del MP4 fuente', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'viralcine-segmented-'));
  const previousDataDir = process.env.VIRALCINE_DATA_DIR;
  const previousMode = process.env.PRODUCTION_MODE;
  const previousExternal = process.env.ALLOW_EXTERNAL_API_CALLS;
  const previousPaid = process.env.ALLOW_PAID_GENERATION;
  try {
    process.env.VIRALCINE_DATA_DIR = tempRoot;
    process.env.PRODUCTION_MODE = 'demo';
    process.env.ALLOW_EXTERNAL_API_CALLS = 'false';
    process.env.ALLOW_PAID_GENERATION = 'false';

    const project = fixture();
    await ensureProjectFolders(project.id);
    const sourcePath = path.join(projectAssetDir(project.id, 'video'), 'source-segmented-test.mp4');
    await createSyntheticMotionVideo(7, sourcePath, project.input.aspectRatio);
    const sourceHashBefore = await sha256(sourcePath);
    const projectBefore = JSON.stringify(project);

    const scene = project.plan!.scenes[0];
    const shot = scene.shots[0];
    const result = await renderSegmentedShotOffline(project, scene, shot);

    assert.equal(result.sourcePreserved, true);
    assert.equal(result.sourceSha256Before, sourceHashBefore);
    assert.equal(result.sourceSha256After, sourceHashBefore);
    assert.equal(await sha256(sourcePath), sourceHashBefore);
    assert.notEqual(result.outputPath, sourcePath);
    assert.match(result.outputAsset, /^video\/segmented-v4-offline\//);
    assert.match(result.outputAsset, new RegExp('-src-' + sourceHashBefore.slice(0, 12)));
    assert.ok(result.durationDeltaSeconds <= 0.12);
    assert.equal(result.externalCalls, false);
    assert.equal(result.spendUsd, 0);
    assert.equal(JSON.stringify(project), projectBefore);

    const duration = await probeMediaDurationSeconds(result.outputPath);
    assert.ok(Math.abs(duration - 7) <= 0.12);
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
});

async function sha256(filePath: string) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}
