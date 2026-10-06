import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoPlan } from '../lib/engine/demo-plan';
import { estimateBudget } from '../lib/engine/budget';
import { ProjectInputSchema } from '../lib/domain/schemas';

const input = ProjectInputSchema.parse({
  title: 'La prueba del mañana',
  premise: 'Una emprendedora dominicana reconstruye su vida mientras crea una plataforma que transforma su comunidad.',
  durationMinutes: 10,
  genre: 'Drama inspirador',
  audience: 'Jóvenes emprendedores',
  visualStyle: 'Cinematográfico realista',
  budgetUsd: 80
});

test('el plan demo respeta duración, límites y continuidad básica', () => {
  const plan = createDemoPlan(input);
  assert.equal(plan.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0), 600);
  assert.ok(plan.scenes.length >= 12 && plan.scenes.length <= 120);
  assert.ok(plan.characters.length >= 1);
  assert.ok(plan.scenes.every((scene) => scene.characterIds.length >= 1));
  assert.ok(plan.scenes.some((scene) => scene.mode === 'ai-video'));
  assert.ok(plan.scenes.some((scene) => scene.mode === 'avatar'));
  assert.ok(plan.scenes.every((scene) => scene.mode !== 'animated-image'));
  assert.ok(plan.scenes.every((scene) => scene.shots.length >= 1));
  assert.ok(plan.scenes.every((scene) => scene.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0) === scene.durationSeconds));
  assert.ok(plan.scenes.every((scene) => scene.shots.every((shot) => shot.durationSeconds >= 4 && shot.durationSeconds <= 8)));
  assert.ok(plan.scenes.every((scene) => scene.shots.every((shot) => ['video', 'avatar-video'].includes(shot.mode))));
});

test('acepta cortos desde 1 minuto, 2.5 minutos y películas hasta 120 minutos', () => {
  for (const durationMinutes of [1, 2.5, 5, 120]) {
    const boundaryInput = ProjectInputSchema.parse({ ...input, durationMinutes });
    const plan = createDemoPlan(boundaryInput);
    assert.equal(
      plan.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0),
      durationMinutes * 60
    );

    if (durationMinutes <= 3) {
      assert.ok(plan.scenes.length >= 4 && plan.scenes.length <= 8);
    } else {
      assert.ok(plan.scenes.length >= 12 && plan.scenes.length <= 120);
    }

    assert.ok(
      plan.scenes.every(
        (scene) => scene.durationSeconds >= 5 && scene.durationSeconds <= 90
      )
    );
    assert.equal(
      plan.scenes
        .flatMap((scene) => scene.shots)
        .reduce((sum, shot) => sum + shot.durationSeconds, 0),
      durationMinutes * 60
    );
  }

  assert.equal(
    ProjectInputSchema.safeParse({ ...input, durationMinutes: 0.5 }).success,
    false
  );
  assert.equal(
    ProjectInputSchema.safeParse({ ...input, durationMinutes: 121 }).success,
    false
  );
});

test('el presupuesto preventivo entrega desglose y comparación', () => {
  const plan = createDemoPlan(input);
  const budget = estimateBudget(input, plan);
  const total = Object.values(budget.breakdown).reduce((sum, value) => sum + value, 0);
  assert.equal(budget.estimatedUsd, Math.round(total * 100) / 100);
  assert.equal(budget.targetUsd, 80);
  assert.equal(budget.withinBudget, budget.estimatedUsd <= 80);
});

test('el presupuesto estricto reserva el máximo de intentos configurado', () => {
  const previousMode = process.env.PRODUCTION_MODE;
  const previousQuality = process.env.SCENE_QUALITY_MODE;
  const previousAttempts = process.env.SCENE_QUALITY_MAX_ATTEMPTS;
  process.env.PRODUCTION_MODE = 'real';
  process.env.SCENE_QUALITY_MODE = 'strict';
  process.env.SCENE_QUALITY_MAX_ATTEMPTS = '3';
  try {
    const plan = createDemoPlan(input);
    const budget = estimateBudget(input, plan);
    assert.ok(budget.breakdown.quality > 0);
    assert.ok(budget.notes.some((note) => note.includes('hasta 3 intentos')));
  } finally {
    restore('PRODUCTION_MODE', previousMode);
    restore('SCENE_QUALITY_MODE', previousQuality);
    restore('SCENE_QUALITY_MAX_ATTEMPTS', previousAttempts);
  }
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
