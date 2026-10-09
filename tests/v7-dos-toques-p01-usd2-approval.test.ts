import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DOS_TOQUES_FIRST_SHOT_BUDGET, firstShotQuotedUsd, maySubmitFirstShot
} from '../lib/v7/production/dos-toques-p01-budget';

test('creator authorization caps one E01-P01 Fast 720p submission to US$2', () => {
  const a = DOS_TOQUES_FIRST_SHOT_BUDGET;
  assert.equal(a.filmId, 'film-dos-toques-de-bocina-v7');
  assert.equal(a.shotId, 'E01-P01');
  assert.equal(a.maxTotalUsd, 2);
  assert.equal(a.maxProviderSubmissions, 1);
  assert.equal(a.automaticRetries, 0);
  assert.equal(a.model, 'veo-3.1-fast-generate-preview');
  assert.equal(a.providerSeconds, 8);
  assert.equal(a.resolution, '720p');
  assert.equal(firstShotQuotedUsd(a.providerRateUsdPerSecond), 0.8);
  assert.throws(() => firstShotQuotedUsd(0));
});

test('budget cannot be reused for another shot, another model, an attempt, or an incorrect tariff', () => {
  const options = {
    shotId: 'E01-P01',
    model: 'veo-3.1-fast-generate-preview',
    rateUsdPerSecond: 0.10,
    providerSubmissions: 0,
    referenceReady: true,
    alreadyReserved: false,
    localCapUsd: 2
  };
  assert.equal(maySubmitFirstShot(options), true);
  assert.equal(maySubmitFirstShot({ ...options, shotId: 'E01-P02' }), false);
  assert.equal(maySubmitFirstShot({ ...options, model: 'veo-3.1-generate-preview' }), false);
  assert.equal(maySubmitFirstShot({ ...options, rateUsdPerSecond: 0.12 }), false);
  assert.equal(maySubmitFirstShot({ ...options, rateUsdPerSecond: null }), false);
  assert.equal(maySubmitFirstShot({ ...options, providerSubmissions: 1 }), false);
  assert.equal(maySubmitFirstShot({ ...options, alreadyReserved: true }), false);
  assert.equal(maySubmitFirstShot({ ...options, referenceReady: false }), false);
  assert.equal(maySubmitFirstShot({ ...options, localCapUsd: 0.5 }), false);
});

test('approval is declared in preflight; import is never a paid generation endpoint', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL(
    '../app/api/v7/films/[filmId]/e01-p01-preflight/route.ts', import.meta.url
  ), 'utf8');
  assert.match(source, /scopedApprovalUsd/);
  assert.match(source, /creatorApprovalRecorded: true/);
  assert.match(source, /approvedAutomaticRetries/);
  assert.match(source, /readyForPaidSubmission: false/);
  assert.doesNotMatch(source, /generateVideos\s*\(/);
});
