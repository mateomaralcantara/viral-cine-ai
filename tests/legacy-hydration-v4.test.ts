import test from 'node:test';
import assert from 'node:assert/strict';
import type { FilmProject } from '../lib/domain/schemas';
import { buildLegacyHydrationPreview, parseLegacyDialogue } from '../lib/engine/legacy-hydration-v4';

const characters = [
  {
    id: 'jesus', name: 'Jesús', role: 'Protagonista', age: 33, appearance: 'Test', wardrobe: 'Test', personality: 'Test',
    voiceInstructions: 'Test', voiceProvider: 'elevenlabs' as const, imagePrompt: 'Test'
  },
  {
    id: 'maria', name: 'María', role: 'Secundaria', age: 50, appearance: 'Test', wardrobe: 'Test', personality: 'Test',
    voiceInstructions: 'Test', voiceProvider: 'elevenlabs' as const, imagePrompt: 'Test'
  }
];

test('parsea diálogo legacy etiquetado por nombre sin adivinar', () => {
  const parsed = parseLegacyDialogue(characters, 'Jesús: Padre, perdónalos.\nMaría: Hijo mío.\nTexto sin hablante');
  assert.equal(parsed.turns.length, 2);
  assert.equal(parsed.turns[0].speakerId, 'jesus');
  assert.equal(parsed.turns[1].speakerId, 'maria');
  assert.deepEqual(parsed.unresolved, ['Texto sin hablante']);
});

test('preview detecta media legacy de escena y no modifica el proyecto', () => {
  const project = {
    id: '11111111-1111-4111-8111-111111111111',
    createdAt: '2026-09-05T00:00:00.000Z', updatedAt: '2026-09-05T00:00:00.000Z', status: 'quality-review',
    input: { title: 'Legacy', premise: 'Prueba suficientemente larga para el esquema.', durationMinutes: 5, genre: 'Test', audience: 'Equipo', visualStyle: 'Cine', language: 'es', aspectRatio: '16:9', budgetUsd: 5, burnSubtitles: true, generateMusic: false },
    plan: {
      logline: 'x', synopsis: 'x', creativeDirection: 'x', musicPrompt: 'x', characters,
      scenes: [{
        id: 's1', order: 1, act: 1, title: 'Escena', durationSeconds: 60, summary: 'x',
        narration: 'Esta es una narración suficientemente larga para dividirla en segmentos seguros de voz.',
        dialogue: 'Jesús: Padre, perdónalos.', dialogueTurns: [], visualPrompt: 'x', negativePrompt: '', camera: 'x', soundDesign: '', transition: '', mode: 'ai-video', characterIds: ['jesus'], shots: [], status: 'ready', videoAsset: 'video/legacy-scene.mp4'
      }]
    },
    progress: { phase: 'quality', percent: 80, message: 'x', updatedAt: '2026-09-05T00:00:00.000Z' },
    productionLog: []
  } as FilmProject;
  const before = JSON.stringify(project);
  const preview = buildLegacyHydrationPreview(project);
  assert.equal(preview.totals.scenesWithLegacyMedia, 1);
  assert.equal(preview.scenes[0].legacyMedia[0], 'video=video/legacy-scene.mp4');
  assert.equal(preview.totals.parsedDialogueTurns, 1);
  assert.equal(JSON.stringify(project), before);
});
