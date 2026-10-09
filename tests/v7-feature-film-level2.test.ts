import assert from 'node:assert/strict';
import test from 'node:test';
import { FEATURE_LEVELS_MINUTES, makeFeatureFilmPlan } from '../lib/v7/feature-film/level-two-planner';

test('all Level 2 durations produce exact scene/shot totals and no ready-to-generate shots', () => {
  for (const minutes of FEATURE_LEVELS_MINUTES) {
    const plan = makeFeatureFilmPlan({ minutes });
    const scenes = plan.acts.flatMap((a) => a.scenes);
    const shots = scenes.flatMap((scene) => scene.shots);
    assert.equal(plan.targetSeconds, minutes * 60);
    assert.equal(plan.totalScenes, scenes.length);
    assert.equal(plan.totalShots, shots.length);
    assert.equal(plan.acts.reduce((n, a) => n + a.seconds, 0), minutes * 60);
    assert.equal(shots.reduce((n, shot) => n + shot.seconds, 0), minutes * 60);
    assert.ok(shots.every((shot) => shot.seconds > 0 && shot.seconds <= 8));
    assert.ok(shots.every((shot) => [4, 6, 8].includes(shot.providerSeconds)));
    assert.ok(shots.every((shot) => shot.productionStatus === 'not-submitted'));
    assert.ok(scenes.every((scene) => scene.screenplayStatus === 'pending'));
    assert.equal(plan.totalEstimatedVideoCostUsd, null);
    assert.ok(plan.totalScenes <= 200 && plan.totalShots <= 2000);
    assert.ok(plan.providerVideoSecondsEstimate >= plan.targetSeconds);
  }
});

test('ninety-minute planning is structurally feasible but not a generated film', () => {
  const plan = makeFeatureFilmPlan({ minutes: 90 });
  assert.equal(plan.targetSeconds, 5400);
  assert.equal(plan.acts.length, 3);
  assert.ok(plan.totalScenes >= 40);
  assert.ok(plan.totalShots >= 675);
  assert.equal(plan.status, 'structural-blueprint-not-approved-for-generation');
  assert.ok(plan.gates.length >= 5);
});

test('video-only cost requires explicit verified rate, no made-up price', () => {
  const plan = makeFeatureFilmPlan({ minutes: 4, videoRateUsdPerSecond: 0.1 });
  assert.equal(plan.totalEstimatedVideoCostUsd, Number((plan.providerVideoSecondsEstimate * 0.1).toFixed(4)));
  assert.ok(plan.excludes.some((x) => x.includes('voz')));
  assert.throws(() => makeFeatureFilmPlan({ minutes: 7 }));
  assert.throws(() => makeFeatureFilmPlan({ minutes: 60, videoRateUsdPerSecond: 0 }));
});
