import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FilmProject } from '../lib/domain/schemas';
import {
  applyFifteenDaysCoreVoiceLocksV5
} from '../lib/engine/fifteen-days-voice-lock-v5';
import {
  buildSceneReviewManifestV5,
  markSceneForIntegratedRun
} from '../lib/engine/scene-review-v5';

function fixture(): FilmProject {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    createdAt: '2026-10-06T00:00:00.000Z',
    updatedAt: '2026-10-06T00:00:00.000Z',
    status: 'ready',
    input: {
      title: '15 DÍAS',
      premise: 'Test',
      durationMinutes: 2.5,
      genre: 'Drama',
      audience: 'Adulto',
      visualStyle: 'Cine',
      language: 'es',
      aspectRatio: '16:9',
      budgetUsd: 20,
      burnSubtitles: false,
      generateMusic: false
    },
    plan: {
      logline: 'Test',
      synopsis: 'Test',
      creativeDirection: 'Test',
      musicPrompt: 'Test',
      realMotion: {
        version: '5.0-real-motion-v1',
        finalMode: 'real-motion',
        allowStillFallbackFinal: false,
        providerOrder: ['fal-video', 'wan'],
        circuitBreaker: { failureThreshold: 3, cooldownSeconds: 900 },
        pilotShotIds: ['scene2-shot1'],
        characterBible: [],
        qualityRule: 'Test'
      },
      characters: [
        {
          id: 'char-v5-elena-0001',
          name: 'Elena',
          role: 'Protagonista',
          age: 36,
          appearance: 'Mujer latina',
          wardrobe: 'Ropa sobria',
          personality: 'Resiliente',
          voiceInstructions: 'Pendiente',
          voiceProvider: 'elevenlabs',
          imagePrompt: 'Elena'
        },
        {
          id: 'char-v5-raul-0002',
          name: 'Raúl',
          role: 'Esposo',
          age: 40,
          appearance: 'Hombre latino',
          wardrobe: 'Camisa',
          personality: 'Contenido',
          voiceInstructions: 'Pendiente',
          voiceProvider: 'elevenlabs',
          imagePrompt: 'Raúl'
        }
      ],
      scenes: [
        {
          id: 'scene-1',
          order: 1,
          act: 1,
          title: 'La caída',
          durationSeconds: 6,
          summary: 'Test',
          narration: '',
          dialogue: '',
          dialogueTurns: [],
          visualPrompt: 'Test',
          negativePrompt: '',
          camera: 'Test',
          soundDesign: 'Test',
          transition: 'cut',
          mode: 'ai-video',
          characterIds: ['char-v5-elena-0001'],
          shots: [{
            id: 'scene1-shot1',
            order: 1,
            title: 'Aprobada',
            durationSeconds: 6,
            visualPrompt: 'Test',
            camera: 'Test',
            spokenText: '',
            dialogueLines: [],
            mode: 'video',
            characterIds: ['char-v5-elena-0001'],
            status: 'ready',
            videoAsset: 'video/scene1.mp4'
          }],
          status: 'ready'
        },
        {
          id: 'scene-2',
          order: 2,
          act: 1,
          title: 'La primera página',
          durationSeconds: 6,
          summary: 'Test',
          narration: 'Pensé que lo peor era perder a mi esposo.',
          dialogue: '',
          dialogueTurns: [],
          visualPrompt: 'Test',
          negativePrompt: '',
          camera: 'Test',
          soundDesign: 'Páginas y calle',
          transition: 'cut',
          mode: 'ai-video',
          characterIds: ['char-v5-elena-0001'],
          shots: [{
            id: 'scene2-shot1',
            order: 1,
            title: 'Primera página',
            durationSeconds: 6,
            visualPrompt: 'Elena escribe',
            camera: 'Plano medio',
            spokenText: 'Pensé que lo peor era perder a mi esposo.',
            speakerId: 'narrator',
            dialogueLines: [{
              id: 'line1',
              speakerId: 'narrator',
              text: 'Pensé que lo peor era perder a mi esposo.',
              startSeconds: 0
            }],
            mode: 'video',
            characterIds: ['char-v5-elena-0001'],
            status: 'pending',
            motionSpec: {
              version: '5.0-real-motion-v1',
              intention: 'Elena escribe.',
              startState: 'Elena sentada.',
              endState: 'Elena termina una línea.',
              bodyMotion: 'Una sola acción.',
              environmentMotion: 'Movimiento leve.',
              cameraMotion: 'Plano estable.',
              shotClass: 'standard',
              preferredProviders: ['fal-video'],
              minMotionScore: 8,
              minIdentityScore: 9,
              minContinuityScore: 9,
              minAnatomyScore: 8,
              minCameraScore: 8,
              allowStillFallbackFinal: false
            },
            preflightIssues: []
          }],
          status: 'pending'
        }
      ]
    },
    progress: {
      phase: 'ready',
      percent: 20,
      message: 'Test',
      updatedAt: '2026-10-06T00:00:00.000Z'
    },
    productionLog: []
  } as unknown as FilmProject;
}

async function withTempData(run: () => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'viralcine-scene-review-'));
  const previous = process.env.VIRALCINE_DATA_DIR;
  try {
    process.env.VIRALCINE_DATA_DIR = root;
    await run();
  } finally {
    if (previous === undefined) delete process.env.VIRALCINE_DATA_DIR;
    else process.env.VIRALCINE_DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
}

test('Voice Lock 5.0 fija español exacto y voces por personaje', () => {
  const project = fixture();
  applyFifteenDaysCoreVoiceLocksV5(project);

  assert.equal(project.narratorVoice?.voiceProvider, 'openai');
  assert.equal(project.narratorVoice?.voiceId, 'marin');
  assert.match(project.narratorVoice?.voiceInstructions || '', /No traduzcas/i);

  const raul = project.plan!.characters.find((item) => item.id === 'char-v5-raul-0002');
  assert.equal(raul?.voiceProvider, 'openai');
  assert.equal(raul?.voiceId, 'onyx');
  assert.match(raul?.voiceInstructions || '', /masculina/i);
});

test('manifest de escena completa queda listo cuando la escena previa y Voice Lock están listos', async () => {
  await withTempData(async () => {
    const project = fixture();
    applyFifteenDaysCoreVoiceLocksV5(project);

    const manifest = await buildSceneReviewManifestV5(project, 2);

    assert.equal(manifest.ready, true);
    assert.equal(manifest.sceneOrder, 2);
    assert.equal(manifest.shotCount, 1);
    assert.equal(manifest.voices[0]?.exactLockReady, true);
    assert.equal(manifest.sound.dialogueAndLipSync, 'integrated');
  });
});

test('Scene Review arma una sola escena sin borrar tomas ya listas', () => {
  const project = fixture();
  const scene = project.plan!.scenes[1];
  scene.shots[0].status = 'ready';
  scene.shots[0].videoAsset = 'video/existing.mp4';

  markSceneForIntegratedRun(project, 2);

  assert.equal(project.status, 'queued');
  assert.equal(scene.status, 'pending');
  assert.equal(scene.shots[0].status, 'ready');
  assert.equal(scene.shots[0].videoAsset, 'video/existing.mp4');
});
