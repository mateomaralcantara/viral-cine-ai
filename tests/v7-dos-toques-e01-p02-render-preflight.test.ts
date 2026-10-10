import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('E01-P02 paid render preflight remains disabled and demands separate approval', async () => {
  const p = JSON.parse(await readFile(new URL('../films/dos-toques-de-bocina/E01-P02-RENDER-PREFLIGHT-V1.json', import.meta.url), 'utf8'));
  assert.equal(p.shotId, 'E01-P02');
  assert.equal(p.provider.durationSeconds, 8);
  assert.equal(p.provider.priceSourceVerified, false);
  assert.equal(p.provider.pricePerSecondUsd, null);
  assert.equal(p.authorization.approvedBudgetUsd, 0);
  assert.equal(p.authorization.maxProviderSubmissions, 0);
  assert.equal(p.authorization.automaticRetries, 0);
  assert.equal(p.authorization.allowSubmit, false);
  assert.equal(p.authorization.requiresSeparateExplicitUserApproval, true);
  assert.equal(p.continuity.imageSentToProvider, false);
  assert.equal(p.continuity.noDismountUntil, 'E01-P03');
});
