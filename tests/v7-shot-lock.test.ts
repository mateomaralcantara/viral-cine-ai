import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isLocked, lockShot, unlockShot } from '../lib/v7/production/shot-lock';

test('tomas fijadas: se fijan, se reconocen y solo el autor las suelta', async () => {
  const dir = path.join(await mkdtemp(path.join(os.tmpdir(), 'fijada-')), 'e02-p08');
  assert.equal(await isLocked(dir), false);
  await lockShot(dir, 'aprobada por el revisor');
  assert.equal(await isLocked(dir), true);
  await unlockShot(dir);
  assert.equal(await isLocked(dir), false);
});
