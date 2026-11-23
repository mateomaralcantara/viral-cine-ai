import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoPlan } from '../lib/engine/demo-plan';
import { ProjectInputSchema } from '../lib/domain/schemas';
import { hasMultipleDialogueSpeakers, resolveSingleSpeakerId } from '../lib/engine/speaker-resolution';
import { assertProductionCanQueue, ProductionSafetyError } from '../lib/engine/production-safety';

const input = ProjectInputSchema.parse({
  title: 'Prueba multihablante',
  premise: 'Valida que un segmento con dos hablantes no pueda entrar al pipeline de voz y lip-sync como si fuera monohablante.',
  durationMinutes: 5,
  genre: 'Test',
  audience: 'Equipo',
  visualStyle: 'Cine',
  budgetUsd: 5,
  generateMusic: false
});

test('resolver monohablante devuelve undefined si dialogueLines contienen dos voces', () => {
  const plan = createDemoPlan(input);
  const shot = plan.scenes[0].shots[0];
  shot.speakerId = undefined;
  shot.spokenText = 'Primera voz. Segunda voz.';
  shot.dialogueLines = [
    { id: 'a', speakerId: 'speaker-a', text: 'Primera voz.', startSeconds: 0 },
    { id: 'b', speakerId: 'speaker-b', text: 'Segunda voz.', startSeconds: 2 }
  ];
  assert.equal(hasMultipleDialogueSpeakers(shot), true);
  assert.equal(resolveSingleSpeakerId(shot), undefined);
});

test('producción real bloquea un segmento multihablante antes de habilitar gasto', () => {
  const plan = createDemoPlan(input);
  const shot = plan.scenes[0].shots[0];
  shot.speakerId = undefined;
  shot.spokenText = 'Primera voz. Segunda voz.';
  shot.dialogueLines = [
    { id: 'a', speakerId: 'speaker-a', text: 'Primera voz.', startSeconds: 0 },
    { id: 'b', speakerId: 'speaker-b', text: 'Segunda voz.', startSeconds: 2 }
  ];

  const previous = {
    PRODUCTION_MODE: process.env.PRODUCTION_MODE,
    ALLOW_EXTERNAL_API_CALLS: process.env.ALLOW_EXTERNAL_API_CALLS,
    ALLOW_PAID_GENERATION: process.env.ALLOW_PAID_GENERATION,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY
  };
  Object.assign(process.env, {
    PRODUCTION_MODE: 'real',
    ALLOW_EXTERNAL_API_CALLS: 'true',
    ALLOW_PAID_GENERATION: 'true',
    OPENAI_API_KEY: 'openai-test-credential-12345',
    GEMINI_API_KEY: 'gemini-test-credential-12345'
  });
  try {
    assert.throws(
      () => assertProductionCanQueue({ plan }),
      (error: unknown) => error instanceof ProductionSafetyError && /varios hablantes|monohablante|segmentación/i.test(error.message)
    );
  } finally {
    restore('PRODUCTION_MODE', previous.PRODUCTION_MODE);
    restore('ALLOW_EXTERNAL_API_CALLS', previous.ALLOW_EXTERNAL_API_CALLS);
    restore('ALLOW_PAID_GENERATION', previous.ALLOW_PAID_GENERATION);
    restore('OPENAI_API_KEY', previous.OPENAI_API_KEY);
    restore('GEMINI_API_KEY', previous.GEMINI_API_KEY);
  }
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
