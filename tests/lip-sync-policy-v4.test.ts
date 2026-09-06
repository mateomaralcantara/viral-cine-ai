import test from 'node:test';
import assert from 'node:assert/strict';
import type { FilmProject } from '../lib/domain/schemas';
import { requiresLipSyncForSpeaker } from '../lib/engine/lip-sync-policy-v4';

function projectFixture(): FilmProject {
  return {
    id: '33333333-4444-4555-8666-777777777777',
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    status: 'ready',
    input: {
      title: 'Lip Sync Policy Test',
      premise: 'Prueba de política de sincronización facial por tipo de voz.',
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
      logline: 'Test', synopsis: 'Test', creativeDirection: 'Test', musicPrompt: 'Test',
      characters: [{
        id: 'pilato', name: 'Pilato', role: 'Gobernador', age: 50,
        appearance: 'Test', wardrobe: 'Test', personality: 'Test',
        voiceInstructions: 'Autoritaria', voiceProvider: 'elevenlabs', imagePrompt: 'Test'
      }],
      scenes: []
    },
    supportVoices: [
      { id: 'multitud', label: 'Multitud', voiceInstructions: 'Colectiva', voiceProvider: 'elevenlabs', source: 'legacy-support' },
      { id: 'soldado', label: 'Soldado', voiceInstructions: 'Firme', voiceProvider: 'elevenlabs', source: 'legacy-support' }
    ],
    progress: { phase: 'ready', percent: 100, message: 'Test', updatedAt: '2026-09-06T00:00:00.000Z' },
    productionLog: []
  } as FilmProject;
}

test('Narrador y Multitud no requieren lip-sync facial', () => {
  const project = projectFixture();
  assert.equal(requiresLipSyncForSpeaker(project, 'narrator'), false);
  assert.equal(requiresLipSyncForSpeaker(project, 'multitud'), false);
});

test('personaje principal y Soldado sí requieren lip-sync facial', () => {
  const project = projectFixture();
  assert.equal(requiresLipSyncForSpeaker(project, 'pilato'), true);
  assert.equal(requiresLipSyncForSpeaker(project, 'soldado'), true);
});
