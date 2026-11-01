import test from 'node:test';
import assert from 'node:assert/strict';
import type { FilmProject } from '../lib/domain/schemas';
import {
  applySafeSpeakerSuggestions,
  applySpeakerAssignment,
  buildCastingState,
  setCharacterVoice,
  suggestSpeaker
} from '../lib/engine/casting-v4';

function projectFixture(): FilmProject {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
    status: 'planned',
    input: {
      title: 'Casting Test', premise: 'Prueba técnica de reconciliación segura de hablantes y voces persistentes.',
      durationMinutes: 5, genre: 'Test', audience: 'Equipo', visualStyle: 'Cine', language: 'es',
      aspectRatio: '16:9', budgetUsd: 5, burnSubtitles: true, generateMusic: false
    },
    plan: {
      logline: 'Test', synopsis: 'Test', creativeDirection: 'Test', musicPrompt: 'Test',
      characters: [
        {
          id: 'ana', name: 'Ana', role: 'Protagonista', age: 30, appearance: 'Cabello oscuro', wardrobe: 'Negro',
          personality: 'Serena', voiceInstructions: 'Voz cálida', voiceProvider: 'elevenlabs', imagePrompt: 'Ana'
        },
        {
          id: 'bruno', name: 'Bruno', role: 'Secundario', age: 35, appearance: 'Cabello corto', wardrobe: 'Azul',
          personality: 'Directo', voiceInstructions: 'Voz grave', voiceProvider: 'elevenlabs', imagePrompt: 'Bruno'
        }
      ],
      scenes: [{
        id: 'scene-1', order: 1, act: 1, title: 'Encuentro', durationSeconds: 10, summary: 'Test', narration: '',
        dialogue: 'Ana: No voy a volver atrás.\nBruno: Entonces seguimos juntos.',
        dialogueTurns: [
          { speakerId: 'ana', text: 'No voy a volver atrás.' },
          { speakerId: 'bruno', text: 'Entonces seguimos juntos.' }
        ],
        visualPrompt: 'Test', negativePrompt: '', camera: 'Plano medio', soundDesign: '', transition: '', mode: 'ai-video',
        characterIds: ['ana', 'bruno'], status: 'pending', shots: [
          {
            id: 'shot-1', order: 1, title: 'Ana habla', durationSeconds: 5, visualPrompt: 'Ana habla', camera: 'Primer plano',
            spokenText: 'No voy a volver atrás.', dialogueLines: [], mode: 'video', characterIds: ['ana', 'bruno'],
            preflightIssues: ['Migración 4.0: hablante ambiguo. Asigna speakerId manualmente antes de producir este segmento.'],
            promptLocked: false, status: 'pending', videoAsset: 'video/paid-existing.mp4'
          },
          {
            id: 'shot-2', order: 2, title: 'Bruno habla', durationSeconds: 5, visualPrompt: 'Bruno habla', camera: 'Primer plano',
            spokenText: 'Entonces seguimos juntos.', dialogueLines: [], mode: 'video', characterIds: ['bruno'], status: 'pending'
          }
        ]
      }]
    },
    progress: { phase: 'planned', percent: 15, message: 'Test', updatedAt: '2026-09-05T00:00:00.000Z' },
    productionLog: []
  } as FilmProject;
}

test('reconciliador propone hablante por dialogueTurns con alta confianza', () => {
  const project = projectFixture();
  const scene = project.plan!.scenes[0];
  const suggestion = suggestSpeaker(project, scene, scene.shots[0]);
  assert.equal(suggestion.suggestedSpeakerId, 'ana');
  assert.ok(suggestion.confidence >= 0.92);
  assert.equal(suggestion.existingMedia, true);
});

test('aplicación segura resuelve hablantes sin borrar media existente', () => {
  const project = projectFixture();
  const originalVideo = project.plan!.scenes[0].shots[0].videoAsset;
  const applied = applySafeSpeakerSuggestions(project, 0.92);
  assert.equal(applied, 2);
  assert.equal(project.plan!.scenes[0].shots[0].speakerId, 'ana');
  assert.equal(project.plan!.scenes[0].shots[1].speakerId, 'bruno');
  assert.equal(project.plan!.scenes[0].shots[0].videoAsset, originalVideo);
  assert.equal(project.plan!.scenes[0].shots[0].dialogueLines[0].speakerId, 'ana');
  assert.equal(project.plan!.scenes[0].shots[0].preflightIssues, undefined);
});

test('asignación manual conserva el archivo y registra el nuevo hablante', () => {
  const project = projectFixture();
  const shot = project.plan!.scenes[0].shots[0];
  applySpeakerAssignment(project, shot.id, 'bruno');
  assert.equal(shot.speakerId, 'bruno');
  assert.equal(shot.videoAsset, 'video/paid-existing.mp4');
  assert.match(project.productionLog.at(-1) || '', /Media existente preservada/);
});

test('Voice Casting Manager guarda voiceId y parámetros sin generar media', () => {
  const project = projectFixture();
  const beforeVideo = project.plan!.scenes[0].shots[0].videoAsset;
  const character = setCharacterVoice(project, 'ana', {
    provider: 'elevenlabs', voiceId: 'voice_ana_123', stability: 0.55, similarity: 0.8, style: 0.2, speed: 1.05
  });
  assert.equal(character.voiceId, 'voice_ana_123');
  assert.equal(character.voiceProvider, 'elevenlabs');
  assert.equal(character.voiceSpeed, 1.05);
  assert.equal(project.plan!.scenes[0].shots[0].videoAsset, beforeVideo);
});

test('estado de casting contabiliza ambigüedad y voces faltantes', () => {
  const project = projectFixture();
  const state = buildCastingState(project);
  assert.equal(state.totals.spokenShots, 2);
  assert.equal(state.totals.unresolvedShots, 2);
  assert.equal(state.totals.highConfidence, 2);
  assert.equal(state.totals.existingMediaUnresolved, 1);
  assert.equal(state.totals.voicesMissing, 2);
});
