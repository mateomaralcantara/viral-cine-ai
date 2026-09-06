import test from 'node:test';
import assert from 'node:assert/strict';
import type { FilmProject } from '../lib/domain/schemas';
import { applyLegacyTurnStructure, previewLegacyTurnStructure } from '../lib/engine/legacy-turn-structure-v4';

function fixture(): FilmProject {
  return {
    id: 'mixed-turn-project',
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    status: 'ready',
    input: {
      title: 'Turnos temporales',
      premise: 'Prueba de estructuración temporal de varios hablantes sin alterar la media histórica.',
      durationMinutes: 5,
      genre: 'Test',
      audience: 'Equipo',
      visualStyle: 'Cine',
      language: 'es',
      aspectRatio: '16:9',
      budgetUsd: 5,
      burnSubtitles: true,
      generateMusic: false
    },
    plan: {
      logline: 'Test',
      synopsis: 'Test',
      creativeDirection: 'Test',
      musicPrompt: 'Test',
      characters: [{
        id: 'jesus',
        name: 'Jesús',
        role: 'Protagonista',
        age: 33,
        appearance: 'Test',
        wardrobe: 'Test',
        personality: 'Test',
        voiceInstructions: 'Sereno',
        voiceProvider: 'elevenlabs',
        imagePrompt: 'Test'
      }],
      scenes: [{
        id: 'scene-1',
        order: 1,
        act: 1,
        title: 'Escena mixta',
        durationSeconds: 7,
        summary: 'Test',
        narration: 'La multitud guardó silencio.',
        dialogue: 'JESÚS: Padre, perdónalos.; SOLDADO: Continúa.',
        dialogueTurns: [],
        visualPrompt: 'Test',
        negativePrompt: '',
        camera: 'Test',
        soundDesign: '',
        transition: '',
        mode: 'ai-video',
        characterIds: ['jesus'],
        shots: [{
          id: 'shot-mixed',
          order: 1,
          title: 'Mixta',
          durationSeconds: 7,
          visualPrompt: 'Test',
          camera: 'sin cortes',
          spokenText: 'La multitud guardó silencio. JESÚS: Padre, perdónalos. SOLDADO: Continúa.',
          dialogueLines: [],
          mode: 'video',
          characterIds: ['jesus'],
          status: 'ready',
          imageAsset: 'images/existing.png',
          voiceAsset: 'audio/existing.mp3',
          videoAsset: 'video/existing.mp4'
        }],
        status: 'ready'
      }]
    },
    supportVoices: [{
      id: 'support-soldado',
      label: 'Soldado',
      voiceInstructions: 'Firme',
      voiceProvider: 'elevenlabs',
      source: 'legacy-support'
    }],
    progress: { phase: 'ready', percent: 100, message: 'Test', updatedAt: '2026-09-06T00:00:00.000Z' },
    productionLog: []
  } as FilmProject;
}

test('preview reconoce una toma mixta lista y tres turnos temporales', () => {
  const project = fixture();
  const preview = previewLegacyTurnStructure(project);
  assert.equal(preview.mixedShots, 1);
  assert.equal(preview.turns, 3);
  assert.equal(preview.readyShots, 1);
  assert.equal(preview.blockedShots, 0);
  assert.equal(preview.mediaBackedShots, 1);
});

test('apply persiste dialogueLines temporales sin tocar media ni duración', () => {
  const project = fixture();
  const shot = project.plan!.scenes[0].shots[0];
  const mediaBefore = JSON.stringify({
    durationSeconds: shot.durationSeconds,
    imageAsset: shot.imageAsset,
    voiceAsset: shot.voiceAsset,
    videoAsset: shot.videoAsset
  });

  const result = applyLegacyTurnStructure(project);
  assert.equal(result.applied, 1);
  assert.equal(shot.dialogueLines.length, 3);
  assert.deepEqual(shot.dialogueLines.map((line) => line.speakerId), ['narrator', 'jesus', 'support-soldado']);
  assert.equal(shot.dialogueLines[0].startSeconds, 0);
  assert.equal(shot.dialogueLines.at(-1)?.endSeconds, 7);
  assert.equal(shot.speakerId, undefined);
  assert.equal(JSON.stringify({
    durationSeconds: shot.durationSeconds,
    imageAsset: shot.imageAsset,
    voiceAsset: shot.voiceAsset,
    videoAsset: shot.videoAsset
  }), mediaBefore);
});

test('estructuración es idempotente y no duplica turnos', () => {
  const project = fixture();
  const first = applyLegacyTurnStructure(project);
  const second = applyLegacyTurnStructure(project);
  assert.equal(first.applied, 1);
  assert.equal(second.applied, 0);
  assert.equal(project.plan!.scenes[0].shots[0].dialogueLines.length, 3);
  assert.equal(previewLegacyTurnStructure(project).alreadyStructured, 1);
});
