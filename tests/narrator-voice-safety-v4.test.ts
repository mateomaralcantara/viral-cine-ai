import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectInputSchema } from '../lib/domain/schemas';
import { createDemoPlan } from '../lib/engine/demo-plan';
import { assertProductionCanQueue, ProductionSafetyError } from '../lib/engine/production-safety';

const input = ProjectInputSchema.parse({
  title: 'Narrador persistente',
  premise: 'Prueba de seguridad para usar un perfil persistente del Narrador antes de producción real.',
  durationMinutes: 5,
  genre: 'Prueba',
  audience: 'Equipo',
  visualStyle: 'Cine',
  budgetUsd: 10,
  generateMusic: false
});

test('producción real acepta voiceId persistente del Narrador sin depender del env legacy', () => {
  const plan = createDemoPlan(input);
  for (const scene of plan.scenes) {
    for (const shot of scene.shots) {
      shot.spokenText = '';
      shot.speakerId = undefined;
      shot.dialogueLines = [];
    }
  }
  const shot = plan.scenes[0].shots[0];
  shot.spokenText = 'Narración de prueba.';
  shot.speakerId = 'narrator';
  shot.dialogueLines = [{ id: 'narrator-line', speakerId: 'narrator', text: shot.spokenText, startSeconds: 0 }];

  withEnv({
    PRODUCTION_MODE: 'real',
    ALLOW_EXTERNAL_API_CALLS: 'true',
    ALLOW_PAID_GENERATION: 'true',
    OPENAI_API_KEY: 'openai-test-credential-12345',
    GEMINI_API_KEY: 'gemini-test-credential-12345',
    ELEVENLABS_API_KEY: 'eleven-test-credential-12345',
    ELEVENLABS_NARRATOR_VOICE_ID: ''
  }, () => {
    assert.doesNotThrow(() => assertProductionCanQueue({
      plan,
      narratorVoice: {
        id: 'narrator',
        label: 'Narrador',
        voiceInstructions: 'Sobrio',
        voiceProvider: 'elevenlabs',
        voiceId: 'persistent-narrator-12345'
      }
    }));
  });
});

test('producción real bloquea Narrador ElevenLabs sin voiceId persistente ni fallback', () => {
  const plan = createDemoPlan(input);
  for (const scene of plan.scenes) {
    for (const shot of scene.shots) {
      shot.spokenText = '';
      shot.speakerId = undefined;
      shot.dialogueLines = [];
    }
  }
  const shot = plan.scenes[0].shots[0];
  shot.spokenText = 'Narración de prueba.';
  shot.speakerId = 'narrator';
  shot.dialogueLines = [{ id: 'narrator-line', speakerId: 'narrator', text: shot.spokenText, startSeconds: 0 }];

  withEnv({
    PRODUCTION_MODE: 'real',
    ALLOW_EXTERNAL_API_CALLS: 'true',
    ALLOW_PAID_GENERATION: 'true',
    OPENAI_API_KEY: 'openai-test-credential-12345',
    GEMINI_API_KEY: 'gemini-test-credential-12345',
    ELEVENLABS_API_KEY: 'eleven-test-credential-12345',
    ELEVENLABS_NARRATOR_VOICE_ID: ''
  }, () => {
    assert.throws(
      () => assertProductionCanQueue({ plan }),
      (error: unknown) => error instanceof ProductionSafetyError && /Narrador: falta voiceId persistente/i.test(error.message)
    );
  });
});

function withEnv(values: Record<string, string>, work: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(values)) {
    previous[name] = process.env[name];
    process.env[name] = value;
  }
  try {
    work();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}
