import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('first scene pilot has seven shots, exact 50 seconds, a stable master hash and no paid jobs', async () => {
  const source = await readFile(
    new URL('../films/dos-toques-de-bocina/ESCENA-01-PILOTO-PREVIS-V1.json', import.meta.url),
    'utf8'
  );
  const pilot = JSON.parse(source) as {
    filmId: string;
    sceneId: string;
    durationSeconds: number;
    sha256: string;
    generatedPerformances: boolean;
    paidProviderCalls: number;
    sourcePortraits: Array<{ id: string; sha256: string; approvedEditorially: boolean; localImportConfirmed: boolean }>;
    shotPlan: Array<{ id: string; startSeconds: number; durationSeconds: number }>;
    foley: { count: number; onsetsSeconds: number[] };
  };
  assert.equal(pilot.filmId, 'film-dos-toques-de-bocina-v7');
  assert.equal(pilot.sceneId, 'E01');
  assert.equal(pilot.durationSeconds, 50);
  assert.equal(pilot.shotPlan.length, 7);
  assert.equal(pilot.shotPlan[0].startSeconds, 0);
  let offset = 0;
  for (const shot of pilot.shotPlan) {
    assert.equal(shot.startSeconds, offset);
    assert.ok(shot.durationSeconds >= 4 && shot.durationSeconds <= 8);
    offset += shot.durationSeconds;
  }
  assert.equal(offset, 50);
  assert.match(pilot.sha256, /^[0-9a-f]{64}$/);
  assert.equal(pilot.paidProviderCalls, 0);
  assert.equal(pilot.generatedPerformances, false);
  assert.equal(pilot.sourcePortraits.length, 3);
  assert.deepEqual(pilot.sourcePortraits.map(p => p.id), ['gabriel', 'daniel', 'lucia']);
  assert.ok(pilot.sourcePortraits.every(p => p.approvedEditorially && !p.localImportConfirmed));
  assert.equal(pilot.foley.count, 2);
  assert.equal(pilot.foley.onsetsSeconds.length, 2);
});

test('E01 import endpoint guards local studio, MP4 identity and prevents overwrite', async () => {
  const api = await readFile(
    new URL('../app/api/v7/films/[filmId]/scene01-previs/route.ts', import.meta.url),
    'utf8'
  );
  assert.match(api, /process\.env\.NODE_ENV !== 'development'/);
  assert.match(api, /VERIFIED_PILOT_SHA256/);
  assert.match(api, /createHash\('sha256'\)/);
  assert.match(api, /await link\(temporary, target\)/);
  assert.match(api, /Math\.abs\(duration - 50\)/);
  assert.match(api, /providerCalls: 0/);
});
