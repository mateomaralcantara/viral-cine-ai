import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  DOS_TOQUES_FIRST_SHOT_BUDGET as AUTH,
  maySubmitFirstShot
} from '../lib/v7/production/dos-toques-p01-budget';

test('the new Veo first-shot endpoint honors one-shot budget and stores reservation first', async () => {
  const source = await readFile(new URL(
    '../app/api/v7/films/[filmId]/e01-p01-render/route.ts', import.meta.url
  ), 'utf8');
  assert.equal(AUTH.maxTotalUsd, 2);
  assert.equal(AUTH.maxProviderSubmissions, 1);
  assert.equal(AUTH.automaticRetries, 0);
  assert.match(source, /const MODEL = 'veo-3\.1-fast-generate-preview'/);
  assert.match(source, /const RATE = 0\.10/);
  assert.match(source, /V7_DOS_TOQUES_P01_PAID_ENABLED/);
  assert.match(source, /V7_CINEMA_PAID_ENABLED !== 'true'/);
  assert.match(source, /ALLOW_PAID_GENERATION !== 'true'/);
  assert.match(source, /ALLOW_EXTERNAL_API_CALLS !== 'true'/);
  assert.match(source, /status: 'reserved'/);
  assert.match(source, /flag: 'wx'/);
  const reservation = source.indexOf('await writeFile(recordPath()');
  const paidCall = source.indexOf('ai.models.generateVideos(');
  assert.ok(reservation >= 0 && reservation < paidCall, 'reservation must precede paid API call');
  assert.match(source, /if \(existing\) throw new Error\(/);
  assert.match(source, /maySubmitFirstShot/);
  assert.match(source, /if \(!envCapEnough\(\)\)/);
  assert.match(source, /body\.approvedEstimateUsd !== firstShotQuotedUsd\(RATE\)/);
  assert.match(source, /if \(!requestAllowed\(request\) \|\| !authorized\(request\)\)/);
  assert.match(source, /process\.env\.NODE_ENV !== 'development'/);
  assert.match(source, /ai\.operations\.getVideosOperation\(/);
  assert.match(source, /record\.providerOperationName = operation\.name/);
  assert.match(source, /status = 'failed-unknown'/);
  assert.ok(!source.includes('retry:'));
});

test('auth policy rejects additional scenes and second attempt even when budget allows', () => {
  const base = {
    shotId: 'E01-P01',
    model: 'veo-3.1-fast-generate-preview',
    rateUsdPerSecond: 0.1,
    providerSubmissions: 0, referenceReady: true,
    alreadyReserved: false, localCapUsd: 2
  };
  assert.equal(maySubmitFirstShot(base), true);
  assert.equal(maySubmitFirstShot({ ...base, shotId: 'E01-P02' }), false);
  assert.equal(maySubmitFirstShot({ ...base, providerSubmissions: 1 }), false);
  assert.equal(maySubmitFirstShot({ ...base, alreadyReserved: true }), false);
});

test('render candidate only streams from a recorded completed operation', async () => {
  const source = await readFile(new URL(
    '../app/api/v7/films/[filmId]/e01-p01-render/video/route.ts', import.meta.url
  ), 'utf8');
  assert.match(source, /record\.status !== 'review-required'/);
  assert.match(source, /'Content-Type': 'video\/mp4'/);
  assert.match(source, /createFileByteRangeStream/);
  assert.match(source, /process\.env\.NODE_ENV !== 'development'/);
});
