import test from 'node:test';
import assert from 'node:assert/strict';
import type { FilmProject } from '../lib/domain/schemas';
import { buildLegacyMixedTurnPlan } from '../lib/engine/legacy-mixed-turns-v4';

function fixture(): FilmProject {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    status: 'ready',
    input: {
      title: 'Turnos mixtos', premise: 'Prueba segura de descomposición de turnos legacy sin alterar medios existentes.',
      durationMinutes: 5, genre: 'Test', audience: 'Equipo', visualStyle: 'Cine', language: 'es',
      aspectRatio: '16:9', budgetUsd: 5, burnSubtitles: true, generateMusic: false
    },
    plan: {
      logline: 'Test', synopsis: 'Test', creativeDirection: 'Test', musicPrompt: 'Test',
      characters: [
        {
          id: 'jesus', name: 'Jesús', role: 'Protagonista', age: 33, appearance: 'Test', wardrobe: 'Test',
          personality: 'Test', voiceInstructions: 'Test', voiceProvider: 'elevenlabs', imagePrompt: 'Test'
        },
        {
          id: 'eliab', name: 'Eliab', role: 'Condenado', age: 40, appearance: 'Test', wardrobe: 'Test',
          personality: 'Test', voiceInstructions: 'Test', voiceProvider: 'elevenlabs', imagePrompt: 'Test'
        }
      ],
      scenes: [{
        id: 'scene-1', order: 1, act: 1, title: 'Escena', durationSeconds: 20, summary: 'Test',
        narration: 'La noche guardó silencio mientras todos miraban hacia la colina.',
        dialogue: 'ELIAB: Nosotros respondemos por nuestros actos. Él no ha hecho ningún mal. Recuérdame cuando llegues a tu reino.; JESÚS: Hoy estarás conmigo en el paraíso.; SOLDADO: Ahora caminas con él.',
        dialogueTurns: [], visualPrompt: 'Test', negativePrompt: '', camera: 'Test', soundDesign: '', transition: '',
        mode: 'ai-video', characterIds: ['jesus', 'eliab'], status: 'ready', shots: [
          {
            id: 'shot-carryover', order: 1, title: 'Continuación', durationSeconds: 8, visualPrompt: 'Test', camera: 'sin cortes',
            spokenText: 'por nuestros actos. Él no ha hecho ningún mal. Recuérdame cuando llegues a tu reino. JESÚS: Hoy estarás conmigo en el paraíso.',
            dialogueLines: [], mode: 'video', characterIds: ['jesus', 'eliab'], status: 'ready',
            voiceAsset: 'audio/existing-1.mp3', videoAsset: 'video/existing-1.mp4'
          },
          {
            id: 'shot-support', order: 2, title: 'Secundario', durationSeconds: 8, visualPrompt: 'Test', camera: 'sin cortes',
            spokenText: 'La noche guardó silencio. SOLDADO: Ahora caminas con él.',
            dialogueLines: [], mode: 'video', characterIds: ['jesus'], status: 'ready',
            voiceAsset: 'audio/existing-2.mp3', videoAsset: 'video/existing-2.mp4'
          }
        ]
      }]
    },
    progress: { phase: 'ready', percent: 100, message: 'Test', updatedAt: '2026-09-06T00:00:00.000Z' },
    productionLog: []
  } as FilmProject;
}

test('planificador recupera continuación de personaje y luego cambia de hablante', () => {
  const project = fixture();
  const before = JSON.stringify(project.plan!.scenes[0].shots[0]);
  const report = buildLegacyMixedTurnPlan(project);
  const row = report.rows.find((item) => item.shotId === 'shot-carryover');
  assert.ok(row);
  assert.equal(row.turns.length, 2);
  assert.equal(row.turns[0].speakerId, 'eliab');
  assert.equal(row.turns[0].source, 'carryover-dialogue');
  assert.equal(row.turns[1].speakerId, 'jesus');
  assert.equal(row.turns[1].source, 'label');
  assert.equal(row.requiresShotSplit, true);
  assert.equal(JSON.stringify(project.plan!.scenes[0].shots[0]), before);
});

test('planificador separa narrador de una voz secundaria sin inventar characterId', () => {
  const project = fixture();
  const report = buildLegacyMixedTurnPlan(project);
  const row = report.rows.find((item) => item.shotId === 'shot-support');
  assert.ok(row);
  assert.equal(row.turns.length, 2);
  assert.equal(row.turns[0].kind, 'narrator');
  assert.equal(row.turns[0].speakerId, 'narrator');
  assert.equal(row.turns[1].kind, 'support');
  assert.equal(row.turns[1].speakerName, 'Soldado');
  assert.equal(row.turns[1].speakerId, undefined);
  assert.deepEqual(report.totals.supportVoiceLabels, ['Soldado']);
  assert.equal(row.originalMedia.includes('video=video/existing-2.mp4'), true);
});
