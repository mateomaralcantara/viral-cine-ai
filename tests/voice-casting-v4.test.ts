import test from 'node:test';
import assert from 'node:assert/strict';
import type { FilmProject } from '../lib/domain/schemas';
import { buildVoiceCastingState, setVoiceProfile } from '../lib/engine/voice-casting-v4';

function fixture(): FilmProject {
  return {
    id: 'voice-casting-project',
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    status: 'ready',
    input: {
      title: 'Voice Casting',
      premise: 'Prueba de perfiles vocales persistentes sin tocar recursos multimedia del proyecto.',
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
        title: 'Escena',
        durationSeconds: 8,
        summary: 'Test',
        narration: 'Narración.',
        dialogue: 'JESÚS: Hola.',
        dialogueTurns: [],
        visualPrompt: 'Test',
        negativePrompt: '',
        camera: 'Test',
        soundDesign: '',
        transition: '',
        mode: 'ai-video',
        characterIds: ['jesus'],
        shots: [{
          id: 'shot-1',
          order: 1,
          title: 'Shot',
          durationSeconds: 8,
          visualPrompt: 'Test',
          camera: 'Test',
          spokenText: 'Hola.',
          speakerId: 'jesus',
          dialogueLines: [{ id: 'line-1', speakerId: 'jesus', text: 'Hola.', startSeconds: 0, endSeconds: 8 }],
          mode: 'video',
          characterIds: ['jesus'],
          status: 'ready',
          voiceAsset: 'audio/existing.mp3',
          videoAsset: 'video/existing.mp4'
        }],
        status: 'ready'
      }]
    },
    supportVoices: [{
      id: 'support-soldado',
      label: 'Soldado',
      voiceInstructions: 'Voz firme',
      voiceProvider: 'elevenlabs',
      source: 'legacy-support'
    }],
    progress: { phase: 'ready', percent: 100, message: 'Test', updatedAt: '2026-09-06T00:00:00.000Z' },
    productionLog: []
  } as FilmProject;
}

test('Voice Casting unifica Narrador, personajes y secundarios', () => {
  const project = fixture();
  const state = buildVoiceCastingState(project);
  assert.equal(state.totals.profiles, 3);
  assert.deepEqual(state.profiles.map((profile) => profile.id), ['narrator', 'jesus', 'support-soldado']);
  assert.equal(state.totals.ready, 0);
});

test('guardar Narrador persistente conserva toda la media', () => {
  const project = fixture();
  const before = JSON.stringify(project.plan!.scenes[0].shots[0]);
  setVoiceProfile(project, 'narrator', {
    provider: 'elevenlabs',
    voiceId: 'narrator-voice-12345678',
    stability: 0.55,
    similarity: 0.8,
    style: 0.2,
    speed: 1
  });
  assert.equal(project.narratorVoice?.voiceId, 'narrator-voice-12345678');
  assert.equal(project.narratorVoice?.id, 'narrator');
  assert.equal(JSON.stringify(project.plan!.scenes[0].shots[0]), before);
  assert.equal(buildVoiceCastingState(project).totals.narratorReady, true);
});

test('guardar voz secundaria reutiliza su perfil y no la convierte en personaje', () => {
  const project = fixture();
  setVoiceProfile(project, 'support-soldado', {
    provider: 'elevenlabs',
    voiceId: 'soldado-voice-12345678'
  });
  assert.equal(project.supportVoices?.[0].voiceId, 'soldado-voice-12345678');
  assert.equal(project.plan!.characters.length, 1);
  const state = buildVoiceCastingState(project);
  assert.equal(state.totals.supportReady, 1);
  assert.equal(state.totals.supportTotal, 1);
});
