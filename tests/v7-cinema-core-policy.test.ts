import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canSubmitCinema, cinemaExposure, estimateVeoUsd, veoSeconds,
  type CinemaRecord
} from '../lib/v7/production/cinema-core-policy';

test('Veo rounds shot duration to supported 4/6/8 second generations', () => {
  assert.equal(veoSeconds(3.3), 4);
  assert.equal(veoSeconds(6), 6);
  assert.equal(veoSeconds(7), 8);
  assert.equal(veoSeconds(7.5), 8);
  assert.throws(() => veoSeconds(10));
  assert.equal(estimateVeoUsd(7, 0.10), 0.8);
});

test('Cinema Core blocks missing or unknown pricing', () => {
  assert.throws(() => estimateVeoUsd(7, 0));
  assert.throws(() => estimateVeoUsd(7, Number.NaN));
});

test('an uncertain external request reserves budget and prevents duplicate spending', () => {
  const record: CinemaRecord = {
    filmId: 'v7-film-demo', shotId: 'LS01', model: 'veo-3.1-fast-generate-preview',
    durationSeconds: 8, estimatedUsd: 0.8,
    referenceSha256: 'a'.repeat(64), status: 'failed-unknown',
    createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString()
  };
  assert.equal(cinemaExposure([record]), 0.8);
  assert.equal(canSubmitCinema({
    alreadyExists: true, budgetUsd: 2, exposureUsd: 0.8, estimatedUsd: 0.8
  }), false);
  assert.equal(canSubmitCinema({
    alreadyExists: false, budgetUsd: 1, exposureUsd: 0.8, estimatedUsd: 0.8
  }), false);
});

test('production is disabled with zero authorization cap', () => {
  assert.equal(canSubmitCinema({
    alreadyExists: false, budgetUsd: 0, exposureUsd: 0, estimatedUsd: 0.8
  }), false);
  assert.equal(canSubmitCinema({
    alreadyExists: false, budgetUsd: 2, exposureUsd: 0, estimatedUsd: 0.8
  }), true);
});
