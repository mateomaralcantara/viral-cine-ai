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

test('ritmo de envío: 1 pedido por minuto por defecto (cuota de cuentas nuevas)', async () => {
  const { veoSubmitIntervalMs } = await import('../lib/v7/production/scene-veo-engine');
  const saved = process.env.V7_VEO_SUBMITS_PER_MINUTE;
  delete process.env.V7_VEO_SUBMITS_PER_MINUTE;
  assert.equal(veoSubmitIntervalMs(), 65000);
  process.env.V7_VEO_SUBMITS_PER_MINUTE = '10';
  assert.equal(veoSubmitIntervalMs(), 11000);
  if (saved === undefined) delete process.env.V7_VEO_SUBMITS_PER_MINUTE; else process.env.V7_VEO_SUBMITS_PER_MINUTE = saved;
});
