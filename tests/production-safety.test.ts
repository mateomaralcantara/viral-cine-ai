import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateSpeech } from '../lib/providers/openai-media';
import {
  assertProductionCanQueue,
  classifyProductionError,
  hasUsableCredential,
  paidGenerationEnabled,
  ProductionSafetyError,
  safeErrorMessage
} from '../lib/engine/production-safety';
import { ProjectInputSchema } from '../lib/domain/schemas';
import { createDemoPlan } from '../lib/engine/demo-plan';
import { createProject, getProject, updateProject } from '../lib/storage/project-store';

const input = ProjectInputSchema.parse({
  title: 'Prueba offline segura',
  premise: 'Una prueba que demuestra que ningún proveedor externo puede recibir solicitudes sin dos permisos explícitos.',
  durationMinutes: 5,
  genre: 'Prueba',
  audience: 'Equipo interno',
  visualStyle: 'Cinematográfico',
  budgetUsd: 12,
  generateMusic: false
});

test('las credenciales neutralizadas nunca cuentan como configuradas', () => {
  withEnv({ OPENAI_API_KEY: 'DISABLED_OFFLINE' }, () => {
    assert.equal(hasUsableCredential('OPENAI_API_KEY'), false);
  });
});

test('una función de proveedor queda bloqueada antes de tocar la red', async () => {
  await withEnvAsync({
    PRODUCTION_MODE: 'real',
    ALLOW_EXTERNAL_API_CALLS: 'false',
    ALLOW_PAID_GENERATION: 'false',
    OPENAI_API_KEY: 'credencial-de-prueba-que-no-se-envia'
  }, async () => {
    assert.equal(paidGenerationEnabled(), false);
    await assert.rejects(
      generateSpeech('No enviar', 'Prueba', path.join(os.tmpdir(), 'no-debe-existir.mp3')),
      ProductionSafetyError
    );
  });
});

test('un proyecto con historial pagado no se sobrescribe en demo', () => {
  const plan = createDemoPlan(input);
  plan.scenes[0].shots[0].generationCount = 1;
  withEnv({ PRODUCTION_MODE: 'demo' }, () => {
    assert.throws(() => assertProductionCanQueue({ plan }), ProductionSafetyError);
  });
});

test('producción real bloquea cualquier texto hablado sin speakerId', () => {
  const plan = createDemoPlan(input);
  const target = plan.scenes[0].shots[0];
  target.spokenText = 'Esta línea debe tener un hablante inequívoco.';
  target.speakerId = undefined;
  target.dialogueLines = [];
  withEnv({
    PRODUCTION_MODE: 'real',
    ALLOW_EXTERNAL_API_CALLS: 'true',
    ALLOW_PAID_GENERATION: 'true',
    OPENAI_API_KEY: 'openai-test-credential-12345',
    GEMINI_API_KEY: 'gemini-test-credential-12345',
    ELEVENLABS_API_KEY: 'eleven-test-credential-12345',
    ELEVENLABS_NARRATOR_VOICE_ID: 'narrator-test-voice-12345'
  }, () => {
    assert.throws(
      () => assertProductionCanQueue({ plan }),
      (error: unknown) => error instanceof ProductionSafetyError && /hablantes incompleto|speakerId/i.test(error.message)
    );
  });
});

test('producción real exige voiceId también para una voz secundaria persistente', () => {
  const plan = createDemoPlan(input);
  for (const scene of plan.scenes) {
    for (const shot of scene.shots) {
      shot.spokenText = '';
      shot.speakerId = undefined;
      shot.dialogueLines = [];
    }
  }
  const target = plan.scenes[0].shots[0];
  target.spokenText = 'Ahora caminas con él.';
  target.speakerId = 'support-soldado';
  target.dialogueLines = [{ id: 'support-line', speakerId: 'support-soldado', text: target.spokenText, startSeconds: 0 }];
  const supportVoices = [{
    id: 'support-soldado', label: 'Soldado', voiceInstructions: 'Voz militar.', voiceProvider: 'elevenlabs' as const,
    source: 'legacy-support' as const
  }];
  withEnv({
    PRODUCTION_MODE: 'real',
    ALLOW_EXTERNAL_API_CALLS: 'true',
    ALLOW_PAID_GENERATION: 'true',
    OPENAI_API_KEY: 'openai-test-credential-12345',
    GEMINI_API_KEY: 'gemini-test-credential-12345',
    ELEVENLABS_API_KEY: 'eleven-test-credential-12345',
    ELEVENLABS_NARRATOR_VOICE_ID: 'narrator-test-voice-12345'
  }, () => {
    assert.throws(
      () => assertProductionCanQueue({ plan, supportVoices }),
      (error: unknown) => error instanceof ProductionSafetyError && /Soldado: falta voiceId/i.test(error.message)
    );
  });
});

test('los errores de saldo se pausan y los mensajes ocultan credenciales', () => {
  assert.equal(classifyProductionError(new Error('429 insufficient_quota credit_balance_exhausted')), 'billing');
  const message = safeErrorMessage(new Error('authorization: Bearer-secret-token-123456789 set-cookie=abc123'));
  assert.doesNotMatch(message, /secret-token|abc123/);
});

test('las actualizaciones concurrentes de un proyecto no pierden datos', async () => {
  const previousData = process.env.VIRALCINE_DATA_DIR;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'viralcine-lock-'));
  process.env.VIRALCINE_DATA_DIR = directory;
  try {
    const project = await createProject(input);
    await Promise.all(Array.from({ length: 20 }, (_, index) =>
      updateProject(project.id, async (current) => {
        await new Promise((resolve) => setTimeout(resolve, index % 3));
        current.productionLog.push(`concurrente-${index}`);
        return current;
      })
    ));
    const saved = await getProject(project.id);
    for (let index = 0; index < 20; index += 1) {
      assert.ok(saved.productionLog.includes(`concurrente-${index}`));
    }
  } finally {
    restore('VIRALCINE_DATA_DIR', previousData);
    await rm(directory, { recursive: true, force: true });
  }
});

function withEnv(values: Record<string, string>, work: () => void) {
  const previous = applyEnv(values);
  try { work(); } finally { restoreMany(previous); }
}

async function withEnvAsync(values: Record<string, string>, work: () => Promise<void>) {
  const previous = applyEnv(values);
  try { await work(); } finally { restoreMany(previous); }
}

function applyEnv(values: Record<string, string>) {
  const previous: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(values)) {
    previous[name] = process.env[name];
    process.env[name] = value;
  }
  return previous;
}

function restoreMany(values: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(values)) restore(name, value);
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
