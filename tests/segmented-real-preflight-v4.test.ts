import test from 'node:test';
import assert from 'node:assert/strict';
import type { FilmProject } from '../lib/domain/schemas';
import { buildSegmentedRealPreflight } from '../lib/engine/segmented-real-preflight-v4';

function fixture(): FilmProject {
  return {
    id: '22222222-3333-4444-8555-666666666666',
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    status: 'ready',
    input: {
      title: 'Segmented Real Preflight Test',
      premise: 'Preflight de una toma multihablante.',
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
    narratorVoice: {
      id: 'narrator',
      label: 'Narrador',
      voiceInstructions: 'Sobria',
      voiceProvider: 'elevenlabs'
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
          videoAsset: 'video/source.mp4'
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

test('preflight real marca autocasting pendiente y no bloquea perfiles ElevenLabs sin voiceId', () => {
  const previousEleven = process.env.ELEVENLABS_API_KEY;
  const previousNarrator = process.env.ELEVENLABS_NARRATOR_VOICE_ID;
  const previousFal = process.env.FAL_KEY;
  const previousLip = process.env.ENABLE_LIPSYNC;
  try {
    process.env.ELEVENLABS_API_KEY = 'eleven-test-secret-123';
    delete process.env.ELEVENLABS_NARRATOR_VOICE_ID;
    process.env.FAL_KEY = 'fal-test-secret-123';
    process.env.ENABLE_LIPSYNC = 'true';

    const project = fixture();
    const before = JSON.stringify(project);
    const scene = project.plan!.scenes[0];
    const shot = scene.shots[0];
    const result = buildSegmentedRealPreflight(project, scene, shot);

    assert.equal(result.totals.turns, 3);
    assert.equal(result.totals.lipSyncTurns, 2);
    assert.equal(result.totals.lipSyncSeconds, 4.667);
    assert.equal(result.totals.profilesRequired, 3);
    assert.equal(result.totals.profilesReady, 0);
    assert.equal(result.totals.profilesAutoCast, 3);
    assert.equal(result.blockers.length, 0);
    assert.ok(result.totals.voiceEstimatedUsd > 0);
    assert.ok(result.totals.lipSyncEstimatedUsd > 0);
    assert.equal(result.totals.totalEstimatedUsd, Number((result.totals.voiceEstimatedUsd + result.totals.lipSyncEstimatedUsd).toFixed(4)));
    assert.equal(JSON.stringify(project), before);
  } finally {
    restore('ELEVENLABS_API_KEY', previousEleven);
    restore('ELEVENLABS_NARRATOR_VOICE_ID', previousNarrator);
    restore('FAL_KEY', previousFal);
    restore('ENABLE_LIPSYNC', previousLip);
  }
});

test('preflight real queda sin bloqueos cuando los tres perfiles y credenciales están listos', () => {
  const previousEleven = process.env.ELEVENLABS_API_KEY;
  const previousFal = process.env.FAL_KEY;
  const previousLip = process.env.ENABLE_LIPSYNC;
  try {
    process.env.ELEVENLABS_API_KEY = 'eleven-test-secret-123';
    process.env.FAL_KEY = 'fal-test-secret-123';
    process.env.ENABLE_LIPSYNC = 'true';

    const project = fixture();
    project.narratorVoice!.voiceId = 'voice-narrator-123';
    project.plan!.characters[0].voiceId = 'voice-character-123';
    project.supportVoices![0].voiceId = 'voice-support-123';

    const scene = project.plan!.scenes[0];
    const result = buildSegmentedRealPreflight(project, scene, scene.shots[0]);
    assert.equal(result.totals.profilesReady, 3);
    assert.equal(result.totals.profilesAutoCast, 0);
    assert.equal(result.totals.blockers, 0);
    assert.deepEqual(result.blockers, []);
  } finally {
    restore('ELEVENLABS_API_KEY', previousEleven);
    restore('FAL_KEY', previousFal);
    restore('ENABLE_LIPSYNC', previousLip);
  }
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
