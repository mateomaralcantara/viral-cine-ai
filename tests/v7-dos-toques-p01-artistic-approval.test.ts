import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('E01-P01 approval is only artistic, behind local admin token, after downloaded clip', async () => {
  const code = await readFile(new URL(
    '../app/api/v7/films/[filmId]/e01-p01-approval/route.ts', import.meta.url
  ), 'utf8');
  assert.match(code, /process\.env\.NODE_ENV !== 'development'/);
  assert.match(code, /V7_CINEMA_ADMIN_TOKEN/);
  assert.match(code, /timingSafeEqual/);
  assert.match(code, /record\.status !== 'review-required'/);
  assert.match(code, /record\.candidateName !== FILE/);
  assert.match(code, /record\.providerOperationName/);
  assert.match(code, /body\.confirmWatched !== true/);
  assert.match(code, /body\.confirmArtistic !== true/);
  assert.match(code, /technicalQaStatus: 'pending'/);
  assert.match(code, /continuityQaStatus: 'pending'/);
  assert.match(code, /editingStatus: 'pending'/);
  assert.match(code, /externalApiCalls: 0/);
  assert.match(code, /additionalSpendUsd: 0/);
});

test('approval keeps candidate video and provider ledger untouched and stores unique SHA fingerprint', async () => {
  const code = await readFile(new URL(
    '../app/api/v7/films/[filmId]/e01-p01-approval/route.ts', import.meta.url
  ), 'utf8');
  assert.match(code, /'artistic-approval\.json'/);
  assert.match(code, /'provider-operation\.json'/);
  assert.match(code, /'E01-P01-veo-candidato\.mp4'/);
  assert.match(code, /createHash\('sha256'\)/);
  assert.match(code, /sourceVideoSha256: hash/);
  assert.match(code, /await open\(approvalPath\(\), 'wx', 0o600\)/);
  assert.doesNotMatch(code, /generateVideos\s*\(/);
  assert.doesNotMatch(code, /ai\.operations/);
  assert.doesNotMatch(code, /await (?:unlink|rename|writeFile)\((?:videoPath|candidatePath|recordPath)/);
});

test('the browser requires explicit viewing, confirmation and current admin token before approval', async () => {
  const pane = await readFile(new URL(
    '../components/V7DosToquesShotRenderPanel.tsx', import.meta.url
  ), 'utf8');
  assert.match(pane, /approve-artistic/);
  assert.match(pane, /status\?\.videoReady/);
  assert.match(pane, /!adminToken \|\| !watched \|\| !approveChecked/);
  assert.match(pane, /confirmWatched: true/);
  assert.match(pane, /confirmArtistic: true/);
  assert.match(pane, /Aprobar E01-P01 · Sin costo adicional/);
  assert.match(pane, /artisticApproved/);
});
