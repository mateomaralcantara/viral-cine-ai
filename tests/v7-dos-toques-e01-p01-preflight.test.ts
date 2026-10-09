import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('E01-P01 real-take plan is 8s, adult-only, consistent with the canonical motor and still unpaid', async () => {
  const contents = await readFile(
    new URL('../films/dos-toques-de-bocina/E01-P01-PRIMERA-TOMA-REAL-V1.json', import.meta.url), 'utf8'
  );
  const plan = JSON.parse(contents) as {
    filmId: string; scene: string; shot: string;
    timelineStartSeconds: number; timelineEndSeconds: number;
    requestedSeconds: number; providerVideoSeconds: number;
    promptVideoEnglish: string;
    audioDesign: { hornBeepCount: number; dialogue: string };
    provider: {
      approvedBudgetUsd: number;
      submitted: boolean;
      externalRequestAuthorized: boolean;
    };
    imageReference: { approvalStatus: string; aspect: string };
    negativeConstraints: string[];
  };
  assert.equal(plan.filmId, 'film-dos-toques-de-bocina-v7');
  assert.equal(plan.scene, 'E01');
  assert.equal(plan.shot, 'E01-P01');
  assert.equal(plan.timelineStartSeconds, 0);
  assert.equal(plan.timelineEndSeconds, 8);
  assert.equal(plan.requestedSeconds, 8);
  assert.equal(plan.providerVideoSeconds, 8);
  assert.match(plan.promptVideoEnglish, /dark-blue commuter motorcycle/i);
  assert.match(plan.promptVideoEnglish, /RIGHT side/);
  assert.match(plan.promptVideoEnglish, /no children visible/i);
  assert.equal(plan.audioDesign.hornBeepCount, 0);
  assert.equal(plan.audioDesign.dialogue, 'Ninguno');
  assert.equal(plan.provider.approvedBudgetUsd, 0);
  assert.equal(plan.provider.submitted, false);
  assert.equal(plan.provider.externalRequestAuthorized, false);
  assert.equal(plan.imageReference.aspect, '16:9');
  assert.equal(plan.imageReference.approvalStatus, 'PENDING_LOCAL_IMPORT_AND_QA');
  assert.ok(plan.negativeConstraints.length >= 4);
});

test('readiness endpoint is local-only and never submits to Veo', async () => {
  const api = await readFile(
    new URL('../app/api/v7/films/[filmId]/e01-p01-preflight/route.ts', import.meta.url), 'utf8'
  );
  assert.match(api, /process\.env\.NODE_ENV !== 'development'/);
  assert.match(api, /V7_VEO_USD_PER_SECOND/);
  assert.match(api, /V7_CINEMA_MAX_USD/);
  assert.match(api, /readyForPaidSubmission: false/);
  assert.match(api, /providerCallsMade: 0/);
  assert.match(api, /await link\(temp, imageFile\)/);
  assert.doesNotMatch(api, /generateVideos\s*\(/);
  assert.doesNotMatch(api, /https:\/\/generativelanguage/);
});
