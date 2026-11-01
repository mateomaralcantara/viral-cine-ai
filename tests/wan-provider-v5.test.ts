import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWanNoChargeFailure,
  WanNoChargeError
} from '../lib/providers/wan';
import { reserveShotGeneration } from '../lib/engine/spend-guard';

test('Wan FAILED confirmado se clasifica como no-cobrable', () => {
  const error = new WanNoChargeError('Wan terminó FAILED.');
  assert.equal(isWanNoChargeFailure(error), true);
  assert.equal(isWanNoChargeFailure(new Error('timeout desconocido')), false);
});

test('reserva específica de Wan usa US$0.15 para 6s sin relajar el guard', () => {
  const project: any = {
    input: { budgetUsd: 45 },
    pilot: {
      enabled: true,
      maxScenes: 1,
      maxShotsPerScene: 1,
      maxSpendUsd: 1.87,
      approvedForFullProduction: false
    },
    plan: {
      realMotion: { version: '5.0-real-motion-v1' },
      scenes: []
    }
  };
  const scene: any = { order: 1, characterIds: [], shots: [] };
  const shot: any = {
    id: 'pilot-15d-01',
    order: 1,
    mode: 'video',
    durationSeconds: 6,
    generationCount: 1,
    estimatedSpendUsd: 0.8,
    qualityForceRegenerate: false,
    safeFailoverResume: true,
    characterIds: []
  };
  scene.shots = [shot];
  project.plan.scenes = [scene];

  const reservation = reserveShotGeneration(project, scene, shot, 0.15);

  assert.equal(reservation.reservedUsd, 0.15);
  assert.equal(shot.generationCount, 2);
  assert.equal(shot.estimatedSpendUsd, 0.95);
});
