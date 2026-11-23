import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FilmPlanSchema,
  ProjectInputSchema
} from '../lib/domain/schemas';
import {
  FIFTEEN_DAYS_INPUT_V5,
  FIFTEEN_DAYS_PILOT_SHOTS_V5,
  buildFifteenDaysPilotPlanV5
} from '../lib/production-presets/fifteen-days-pilot-v5';

test('15 DÍAS v5 valida input, 13 escenas, 5 personajes y 8 tomas piloto', () => {
  const input = ProjectInputSchema.parse(FIFTEEN_DAYS_INPUT_V5);
  const plan = FilmPlanSchema.parse(buildFifteenDaysPilotPlanV5());

  assert.equal(input.durationMinutes, 12);
  assert.equal(plan.scenes.length, 13);
  assert.equal(plan.characters.length, 5);
  assert.equal(plan.realMotion?.characterBible.length, 5);
  assert.equal(plan.realMotion?.pilotShotIds.length, 8);
  assert.equal(FIFTEEN_DAYS_PILOT_SHOTS_V5.length, 8);
  assert.equal(
    plan.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0),
    720
  );
});

test('las 8 tomas piloto son FINAL real-motion y jamás permiten still fallback', () => {
  const plan = buildFifteenDaysPilotPlanV5();
  const pilot = plan.scenes.flatMap((scene) => scene.shots);

  assert.equal(pilot.length, 8);
  assert.equal(pilot.every((shot) => shot.motionSpec?.allowStillFallbackFinal === false), true);
  assert.equal(pilot.every((shot) => shot.pipelineVersion === '5.0-real-motion-pilot'), true);
  assert.equal(pilot.every((shot) => (shot.motionSpec?.preferredProviders.length || 0) >= 2), true);
  assert.equal(pilot.every((shot) => (shot.motionSpec?.minIdentityScore || 0) >= 9), true);
});
