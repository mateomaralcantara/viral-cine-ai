import test from 'node:test';
import assert from 'node:assert/strict';
import { preflightPlan } from '../lib/engine/shot-plan';
import { buildFifteenDaysPilotPlanV5 } from '../lib/production-presets/fifteen-days-pilot-v5';

test('preflight 4.x no reescribe una toma Real Motion 5.0 authored', () => {
  const plan = buildFifteenDaysPilotPlanV5();
  const shot = plan.scenes[0].shots[0];

  const original = {
    visualPrompt: shot.visualPrompt,
    camera: shot.camera,
    characterIds: [...shot.characterIds],
    stateIds: { ...(shot.characterStateIds || {}) },
    providers: [...(shot.motionSpec?.preferredProviders || [])]
  };

  const result = preflightPlan({
    ...plan,
    scenes: [{
      ...plan.scenes[0],
      shots: [shot],
      durationSeconds: shot.durationSeconds
    }]
  });

  assert.equal(result.passed, true);
  assert.equal(shot.visualPrompt, original.visualPrompt);
  assert.equal(shot.camera, original.camera);
  assert.deepEqual(shot.characterIds, original.characterIds);
  assert.deepEqual(shot.characterStateIds, original.stateIds);
  assert.deepEqual(
    shot.motionSpec?.preferredProviders,
    original.providers
  );
});
