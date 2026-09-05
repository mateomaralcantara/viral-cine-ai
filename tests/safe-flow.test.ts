import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectInputSchema, type FilmProject } from '../lib/domain/schemas';
import { createDemoPlan } from '../lib/engine/demo-plan';
import { reserveShotGeneration } from '../lib/engine/spend-guard';
import { shouldUseFalAvatar } from '../lib/engine/producer';

const input = ProjectInputSchema.parse({
  title: 'Flujo seguro',
  premise: 'Una prueba valida el limite de gasto y el uso correcto del proveedor de avatares.',
  durationMinutes: 5,
  genre: 'Prueba',
  audience: 'Equipo interno',
  visualStyle: 'Cinematografico',
  budgetUsd: 50
});

function projectFixture(): FilmProject {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'planned',
    input,
    plan: createDemoPlan(input),
    progress: { phase: 'planned', percent: 10, message: 'Listo', updatedAt: new Date().toISOString() },
    productionLog: []
  };
}

test('el cortafuegos reserva antes de generar y bloquea el tercer cobro del mismo plano', () => {
  const project = projectFixture();
  if (!project.plan) throw new Error('Plan ausente');
  const scene = project.plan.scenes[0];
  const shot = scene.shots[0];
  const previous = process.env.SHOT_MAX_TOTAL_GENERATIONS;
  process.env.SHOT_MAX_TOTAL_GENERATIONS = '2';
  try {
    reserveShotGeneration(project, scene, shot);
    reserveShotGeneration(project, scene, shot);
    assert.equal(shot.generationCount, 2);
    assert.throws(() => reserveShotGeneration(project, scene, shot), /Bloqueo de gasto/);
  } finally {
    restore('SHOT_MAX_TOTAL_GENERATIONS', previous);
  }
});

test('Fal Avatar queda prohibido para una escena con varios personajes', () => {
  const project = projectFixture();
  if (!project.plan) throw new Error('Plan ausente');
  const scene = project.plan.scenes[0];
  const shot = scene.shots[0];
  shot.mode = 'avatar-video';
  shot.camera = 'primer plano cinematografico';
  scene.characterIds = ['personaje-1', 'personaje-2'];
  shot.characterIds = ['personaje-1', 'personaje-2'];
  assert.equal(shouldUseFalAvatar(scene, shot), false);
});

test('Fal Avatar solo puede ser respaldo de un primer plano individual', () => {
  const project = projectFixture();
  if (!project.plan) throw new Error('Plan ausente');
  const scene = project.plan.scenes[0];
  const shot = scene.shots[0];
  shot.mode = 'avatar-video';
  shot.camera = 'primer plano del protagonista hablando';
  scene.characterIds = ['personaje-1'];
  shot.characterIds = ['personaje-1'];
  assert.equal(shouldUseFalAvatar(scene, shot), true);
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
