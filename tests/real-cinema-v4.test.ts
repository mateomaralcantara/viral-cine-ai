import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectInputSchema } from '../lib/domain/schemas';
import { createDemoPlan } from '../lib/engine/demo-plan';
import { estimateBudget } from '../lib/engine/budget';
import { runFakeProviderStage } from '../lib/providers/fake-cinema';

const input = ProjectInputSchema.parse({
  title: 'Real Cinema Test',
  premise: 'Una productora prueba voces persistentes y sincronizacion antes de permitir una pelicula completa.',
  durationMinutes: 5,
  genre: 'Drama',
  audience: 'Publico general',
  visualStyle: 'Cine realista',
  budgetUsd: 80
});

test('los dialogos demo conservan speakerId hasta los segmentos', () => {
  const plan = createDemoPlan(input);
  const dialogueScenes = plan.scenes.filter((scene) => scene.dialogueTurns.length > 0);
  assert.ok(dialogueScenes.length > 0);
  for (const scene of dialogueScenes) {
    for (const turn of scene.dialogueTurns) {
      assert.ok(plan.characters.some((character) => character.id === turn.speakerId));
    }
    const speakingShots = scene.shots.filter((shot) => shot.spokenText.trim());
    assert.ok(speakingShots.some((shot) => shot.speakerId && shot.dialogueLines.length === 1));
  }
});

test('el presupuesto separa video y lip-sync', () => {
  const plan = createDemoPlan(input);
  const budget = estimateBudget(input, plan);
  assert.ok(budget.breakdown.video > 0);
  assert.ok(budget.breakdown.lipSync > 0);
  assert.ok(budget.notes.some((note) => note.includes('Lip-sync')));
});

test('el simulador 429 falla antes de ejecutar el proveedor', async () => {
  const previousScenario = process.env.FAKE_PROVIDER_SCENARIO;
  const previousStage = process.env.FAKE_PROVIDER_STAGE;
  process.env.FAKE_PROVIDER_SCENARIO = '429';
  process.env.FAKE_PROVIDER_STAGE = 'video';
  let executed = false;
  try {
    await assert.rejects(
      runFakeProviderStage('video', undefined, async () => {
        executed = true;
        return 'ok';
      }),
      /429/
    );
    assert.equal(executed, false);
  } finally {
    restore('FAKE_PROVIDER_SCENARIO', previousScenario);
    restore('FAKE_PROVIDER_STAGE', previousStage);
  }
});

test('accepted-then-timeout ejecuta el trabajo y obliga reconciliacion', async () => {
  const previousScenario = process.env.FAKE_PROVIDER_SCENARIO;
  const previousStage = process.env.FAKE_PROVIDER_STAGE;
  process.env.FAKE_PROVIDER_SCENARIO = 'accepted-then-timeout';
  process.env.FAKE_PROVIDER_STAGE = 'voice';
  let executed = false;
  try {
    await assert.rejects(
      runFakeProviderStage('voice', undefined, async () => {
        executed = true;
        return 'ok';
      }),
      /Requiere reconciliación/
    );
    assert.equal(executed, true);
  } finally {
    restore('FAKE_PROVIDER_SCENARIO', previousScenario);
    restore('FAKE_PROVIDER_STAGE', previousStage);
  }
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
