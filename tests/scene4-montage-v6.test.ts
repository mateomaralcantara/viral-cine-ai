import test from 'node:test';
import assert from 'node:assert/strict';
import type { FilmProject } from '@/lib/domain/schemas';
import { buildFifteenDaysShortPlanV5 } from '@/lib/production-presets/fifteen-days-short-v5';
import {
  planScene4MontageV6,
  validateScene4MontageV6,
  SCENE4_NARRATION_V6
} from '@/lib/engine/scene4-montage-plan-v6';
import { grokLiteImageToVideoCredits } from '@/lib/providers/runway-router-v6';

function fixture(): FilmProject {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z',
    status: 'ready',
    input: {
      title: '15 DÍAS',
      premise: 'Una historia de reconstrucción personal.',
      durationMinutes: 2.5,
      genre: 'Drama',
      audience: 'Adulto',
      visualStyle: 'Cine realista',
      language: 'es',
      aspectRatio: '16:9',
      budgetUsd: 20,
      burnSubtitles: false,
      generateMusic: false
    },
    plan: buildFifteenDaysShortPlanV5(),
    progress: {
      phase: 'ready',
      percent: 50,
      message: 'Test',
      updatedAt: '2026-10-07T00:00:00.000Z'
    },
    productionLog: []
  } as FilmProject;
}

test('Escena 4 V6 queda en montaje 5x6s con narración única en off', () => {
  const project = fixture();
  const scene = planScene4MontageV6(project);
  const plan = validateScene4MontageV6(project);

  assert.equal(scene.shots.length, 5);
  assert.deepEqual(scene.shots.map((shot) => shot.durationSeconds), [6, 6, 6, 6, 6]);
  assert.equal(plan.durationSeconds, 30);
  assert.equal(plan.visibleDialogue, false);
  assert.equal(plan.lipSyncRequired, false);
  assert.equal(scene.narration, SCENE4_NARRATION_V6);
  assert.ok(scene.shots.every((shot) => shot.spokenText === ''));
  assert.ok(scene.shots.every((shot) => shot.dialogueLines.length === 0));
});

test('Escena 4 V6 conserva progresión narrativa de día 1 a primera venta', () => {
  const project = fixture();
  const scene = planScene4MontageV6(project);
  const titles = scene.shots.map((shot) => shot.title);

  assert.match(titles[0], /Día 1/);
  assert.match(titles[1], /Día 4/);
  assert.match(titles[2], /Día 8/);
  assert.match(titles[3], /Día 12/);
  assert.match(titles[4], /Día 15/);
  assert.match(titles[4], /primera venta/i);
});

test('Grok Lite 6s 720p fija 19 créditos por toma y 95 para las cinco', () => {
  const perShot = grokLiteImageToVideoCredits(6, 'auto_720p');
  assert.equal(perShot, 19);
  assert.equal(perShot * 5, 95);
});
