import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectInputSchema } from '../lib/domain/schemas';
import { createDemoPlan } from '../lib/engine/demo-plan';
import { ensurePlanShots, preflightPlan } from '../lib/engine/shot-plan';

const input = ProjectInputSchema.parse({
  title: 'Preflight cinematografico',
  premise: 'Una pelicula evita prompts contradictorios antes de consumir una generacion costosa de video.',
  durationMinutes: 5,
  genre: 'Drama',
  audience: 'Publico general',
  visualStyle: 'Cine realista',
  budgetUsd: 50
});

test('el preflight convierte cada toma en una instruccion filmable 10/10', () => {
  const plan = createDemoPlan(input);
  const scene = plan.scenes[0];
  scene.mode = 'avatar';
  scene.dialogue = 'La protagonista responde con serenidad.';
  scene.visualPrompt = [
    'Patio de piedra al amanecer.',
    'Alternar plano general, plano medio, detalle de manos y primeros planos.',
    'Viento suave mueve las telas.'
  ].join(' ');
  scene.camera = 'Travelling lateral; contrapicado; primeros planos; plano general';
  scene.shots = [];

  ensurePlanShots(plan);
  const result = preflightPlan(plan);

  assert.equal(result.passed, true);
  assert.equal(result.score, 10);
  assert.ok(scene.shots.every((shot) => shot.preflightScore === 10 && shot.promptLocked));
  assert.ok(scene.shots.every((shot) => shot.characterIds.length <= 2));
  assert.ok(scene.shots.every((shot) => shot.mode === 'video'));
  assert.ok(scene.shots.every((shot) => !/alternar plano|varios angulos|cambio de plano/i.test(shot.visualPrompt)));
  assert.ok(scene.shots.every((shot) => /sin cortes/i.test(shot.camera)));
});

test('cada toma conserva un reparto propio en vez de heredar toda la escena', () => {
  const plan = createDemoPlan(input);
  const scene = plan.scenes[0];
  const secondCharacter = plan.characters[1];
  if (!secondCharacter) throw new Error('Falta el segundo personaje de prueba.');
  scene.characterIds = [plan.characters[0].id, secondCharacter.id];
  scene.shots = [];
  ensurePlanShots(plan);

  assert.ok(scene.shots.every((shot) => shot.characterIds.length >= 1));
  assert.ok(scene.shots.every((shot) => shot.characterIds.length <= 2));
  assert.ok(scene.shots.some((shot) => shot.characterIds.length === 1));
});
