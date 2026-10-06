import test from 'node:test';
import assert from 'node:assert/strict';
import { FilmPlanSchema } from '../lib/domain/schemas';
import {
  FIFTEEN_DAYS_SHORT_INPUT_V5,
  buildFifteenDaysShortPlanV5
} from '../lib/production-presets/fifteen-days-short-v5';

test('15 DÍAS short dura exactamente 150 segundos', () => {
  const plan = FilmPlanSchema.parse(buildFifteenDaysShortPlanV5());
  const seconds = plan.scenes.reduce(
    (sum, scene) => sum + scene.durationSeconds,
    0
  );

  assert.equal(FIFTEEN_DAYS_SHORT_INPUT_V5.durationMinutes, 2.5);
  assert.equal(seconds, 150);
  assert.equal(plan.scenes.length, 6);
});

test('15 DÍAS short usa Fal y conserva Real Motion', () => {
  const plan = FilmPlanSchema.parse(buildFifteenDaysShortPlanV5());
  const shots = plan.scenes.flatMap((scene) => scene.shots);

  assert.equal(shots.length, 21);
  assert.deepEqual(plan.realMotion?.providerOrder, ['fal-video', 'wan']);
  assert.ok(
    shots.every(
      (shot) =>
        shot.motionSpec?.preferredProviders?.[0] === 'fal-video' &&
        shot.motionSpec?.allowStillFallbackFinal === false
    )
  );
  assert.equal(shots[0]?.id, 'pilot-15d-01');
});
