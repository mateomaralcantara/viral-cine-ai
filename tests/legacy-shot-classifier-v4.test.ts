import test from 'node:test';
import assert from 'node:assert/strict';
import type { FilmProject } from '../lib/domain/schemas';
import { classifyLegacyProjectShots } from '../lib/engine/legacy-shot-classifier-v4';

function fixture(): FilmProject {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
    status: 'ready',
    input: {
      title: 'Clasificador legacy', premise: 'Proyecto de prueba para distinguir narrador de personaje sin modificar media.',
      durationMinutes: 5, genre: 'Test', audience: 'Equipo', visualStyle: 'Cine', language: 'es',
      aspectRatio: '16:9', budgetUsd: 5, burnSubtitles: true, generateMusic: false
    },
    plan: {
      logline: 'Test', synopsis: 'Test', creativeDirection: 'Test', musicPrompt: 'Test',
      characters: [{
        id: 'jesus', name: 'Jesús', role: 'Protagonista', age: 33, appearance: 'Test', wardrobe: 'Test',
        personality: 'Test', voiceInstructions: 'Test', voiceProvider: 'elevenlabs', imagePrompt: 'Test'
      }],
      scenes: [{
        id: 'scene-1', order: 1, act: 1, title: 'Escena', durationSeconds: 20, summary: 'Test',
        narration: 'La multitud guarda silencio mientras el viento recorre lentamente la colina bajo un cielo oscuro.',
        dialogue: 'Jesús: Padre, en tus manos entrego mi espíritu.', dialogueTurns: [], visualPrompt: 'Test', negativePrompt: '',
        camera: 'Test', soundDesign: '', transition: '', mode: 'ai-video', characterIds: ['jesus'], status: 'ready', shots: [
          {
            id: 'shot-narrator', order: 1, title: 'Narración', durationSeconds: 8, visualPrompt: 'Test', camera: 'sin cortes',
            spokenText: 'La multitud guarda silencio mientras el viento recorre lentamente la colina', dialogueLines: [], mode: 'video',
            characterIds: ['jesus'], status: 'ready', videoAsset: 'video/narrator.mp4'
          },
          {
            id: 'shot-jesus', order: 2, title: 'Jesús habla', durationSeconds: 8, visualPrompt: 'Test', camera: 'sin cortes',
            spokenText: 'Padre, en tus manos entrego mi espíritu.', dialogueLines: [], mode: 'video', characterIds: ['jesus'], status: 'ready'
          },
          {
            id: 'shot-ambiguous', order: 3, title: 'Dudosa', durationSeconds: 4, visualPrompt: 'Test', camera: 'sin cortes',
            spokenText: 'bajo el cielo', dialogueLines: [], mode: 'video', characterIds: ['jesus'], status: 'ready'
          }
        ]
      }]
    },
    progress: { phase: 'ready', percent: 100, message: 'Test', updatedAt: '2026-09-05T00:00:00.000Z' },
    productionLog: []
  } as FilmProject;
}

test('clasificador legacy distingue narración, personaje y caso manual sin tocar media', () => {
  const project = fixture();
  const originalVideo = project.plan!.scenes[0].shots[0].videoAsset;
  const report = classifyLegacyProjectShots(project);
  assert.equal(report.totals.spokenShots, 3);
  assert.equal(report.totals.narrator, 1);
  assert.equal(report.totals.character, 1);
  assert.equal(report.totals.ambiguous, 1);
  assert.equal(report.rows[0].suggestedSpeakerId, 'narrator');
  assert.equal(report.rows[1].suggestedSpeakerId, 'jesus');
  assert.equal(project.plan!.scenes[0].shots[0].videoAsset, originalVideo);
  assert.equal(project.plan!.scenes[0].shots[0].speakerId, undefined);
});
