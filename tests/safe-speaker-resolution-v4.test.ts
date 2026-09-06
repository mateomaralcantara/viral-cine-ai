import test from 'node:test';
import assert from 'node:assert/strict';
import type { FilmProject } from '../lib/domain/schemas';
import { applySafeNarratorResolution, previewSafeNarratorResolution } from '../lib/engine/safe-speaker-resolution-v4';

function fixture(): FilmProject {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    createdAt: '2026-09-05T00:00:00.000Z', updatedAt: '2026-09-05T00:00:00.000Z', status: 'ready',
    input: {
      title: 'Narrador seguro', premise: 'Prueba', durationMinutes: 5, genre: 'Test', audience: 'Equipo',
      visualStyle: 'Cine', language: 'es', aspectRatio: '16:9', budgetUsd: 5, burnSubtitles: true, generateMusic: false
    },
    plan: {
      logline: 'Test', synopsis: 'Test', creativeDirection: 'Test', musicPrompt: 'Test',
      characters: [{
        id: 'jesus', name: 'Jesús', role: 'Protagonista', age: 33, appearance: 'Test', wardrobe: 'Test',
        personality: 'Test', voiceInstructions: 'Test', voiceProvider: 'elevenlabs', imagePrompt: 'Test'
      }],
      scenes: [{
        id: 'scene-1', order: 1, act: 1, title: 'Escena', durationSeconds: 16, summary: 'Test',
        narration: 'El viento cruzó la colina mientras todos guardaban silencio.',
        dialogue: 'Jesús: Padre, perdónalos.', dialogueTurns: [], visualPrompt: 'Test', negativePrompt: '', camera: 'Test',
        soundDesign: '', transition: '', mode: 'ai-video', characterIds: ['jesus'], status: 'ready',
        videoAsset: 'video/scene-001.mp4', shots: [
          {
            id: 'narrator-shot', order: 1, title: 'Narración', durationSeconds: 8, visualPrompt: 'Test', camera: 'sin cortes',
            spokenText: 'El viento cruzó la colina mientras todos guardaban silencio.', dialogueLines: [], mode: 'video',
            characterIds: ['jesus'], status: 'ready', voiceAsset: 'audio/narrator.mp3', videoAsset: 'video/narrator.mp4',
            imageAsset: 'images/narrator.png', preflightIssues: ['Migración 4.0: hablante ambiguo. Asigna speakerId manualmente antes de producir este segmento.']
          },
          {
            id: 'mixed-shot', order: 2, title: 'Mixta', durationSeconds: 8, visualPrompt: 'Test', camera: 'sin cortes',
            spokenText: 'La escena termina. JESÚS: Padre, perdónalos.', dialogueLines: [], mode: 'video',
            characterIds: ['jesus'], status: 'ready', voiceAsset: 'audio/mixed.mp3', videoAsset: 'video/mixed.mp4'
          }
        ]
      }]
    },
    progress: { phase: 'ready', percent: 100, message: 'Test', updatedAt: '2026-09-05T00:00:00.000Z' }, productionLog: []
  } as FilmProject;
}

test('preview solo selecciona narración inequívoca', () => {
  const project = fixture();
  const preview = previewSafeNarratorResolution(project);
  assert.equal(preview.eligibleCount, 1);
  assert.deepEqual(preview.eligibleShotIds, ['narrator-shot']);
  assert.equal(preview.remainingNonNarratorSpoken, 1);
});

test('aplicar narrador conserva todos los assets y deja la toma mixta sin tocar', () => {
  const project = fixture();
  const before = JSON.stringify(project.plan!.scenes.map((scene) => ({
    videoAsset: scene.videoAsset,
    shots: scene.shots.map((shot) => ({ id: shot.id, imageAsset: shot.imageAsset, voiceAsset: shot.voiceAsset, videoAsset: shot.videoAsset }))
  })));
  const result = applySafeNarratorResolution(project);
  const after = JSON.stringify(project.plan!.scenes.map((scene) => ({
    videoAsset: scene.videoAsset,
    shots: scene.shots.map((shot) => ({ id: shot.id, imageAsset: shot.imageAsset, voiceAsset: shot.voiceAsset, videoAsset: shot.videoAsset }))
  })));
  assert.equal(result.applied, 1);
  assert.equal(project.plan!.scenes[0].shots[0].speakerId, 'narrator');
  assert.equal(project.plan!.scenes[0].shots[0].dialogueLines[0].speakerId, 'narrator');
  assert.equal(project.plan!.scenes[0].shots[1].speakerId, undefined);
  assert.equal(before, after);
  assert.match(project.productionLog.at(-1) || '', /No se modificó ni regeneró media/);
});
