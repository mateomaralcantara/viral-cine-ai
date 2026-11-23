import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicPlanSchema } from '../lib/domain/schemas';
import {
  FIFTEEN_DAYS_SCORE_V5,
  validateFifteenDaysScore
} from '../lib/production-presets/fifteen-days-score-v5';

test('15 DÍAS tiene un score emocional 5.0 válido y original por cues', () => {
  const parsed = MusicPlanSchema.parse(FIFTEEN_DAYS_SCORE_V5);
  assert.equal(parsed.version, '5.0-emotional-score-v1');
  assert.equal(parsed.cues.length, 11);
  assert.equal(parsed.cues.filter((cue) => cue.emotionalPeak).length, 1);
  assert.equal(parsed.cues.find((cue) => cue.emotionalPeak)?.id, 'cue-10-children-home');
  assert.equal(parsed.cues.every((cue) => cue.noVocals), true);
  assert.equal(validateFifteenDaysScore(), true);
});

test('el clímax emocional prioriza a los hijos, no el éxito económico', () => {
  const reunion = FIFTEEN_DAYS_SCORE_V5.cues.find(
    (cue) => cue.id === 'cue-10-children-home'
  );
  const success = FIFTEEN_DAYS_SCORE_V5.cues.find(
    (cue) => cue.id === 'cue-08-new-life'
  );
  assert.ok(reunion);
  assert.ok(success);
  assert.ok(reunion!.intensity > success!.intensity);
  assert.ok(reunion!.dialogueDuckDb < success!.dialogueDuckDb);
});
