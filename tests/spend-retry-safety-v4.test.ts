import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  appendSpend,
  assertSpendRetrySafe,
  latestSpendForKey
} from '../lib/engine/spend-ledger';
import { ProductionSafetyError } from '../lib/engine/production-safety';

test('permite reintento tras reserved pero bloquea submitted/failed-unknown/succeeded', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'viralcine-spend-retry-'));
  const previousDataDir = process.env.VIRALCINE_DATA_DIR;
  const projectId = '44444444-5555-4666-8777-888888888888';
  const key = 'lip-sync:test-shot:2.9';

  try {
    process.env.VIRALCINE_DATA_DIR = tempRoot;

    await appendSpend(projectId, {
      operation: 'lip-sync',
      provider: 'fal',
      state: 'reserved',
      estimatedUsd: 0.4,
      idempotencyKey: key
    });
    await assert.doesNotReject(() => assertSpendRetrySafe(projectId, key, 'lip-sync'));

    await appendSpend(projectId, {
      operation: 'lip-sync',
      provider: 'fal',
      state: 'submitted',
      estimatedUsd: 0.4,
      idempotencyKey: key
    });

    await assert.rejects(
      () => assertSpendRetrySafe(projectId, key, 'lip-sync'),
      (error: unknown) => error instanceof ProductionSafetyError && /Bloqueo de reintento de gasto/i.test(error.message)
    );

    const latest = await latestSpendForKey(projectId, key);
    assert.equal(latest?.state, 'submitted');
  } finally {
    if (previousDataDir === undefined) delete process.env.VIRALCINE_DATA_DIR;
    else process.env.VIRALCINE_DATA_DIR = previousDataDir;
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('failed-no-charge permite un nuevo intento', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'viralcine-spend-safe-'));
  const previousDataDir = process.env.VIRALCINE_DATA_DIR;
  const projectId = '55555555-6666-4777-8888-999999999999';
  const key = 'voice:test:narrator:10';

  try {
    process.env.VIRALCINE_DATA_DIR = tempRoot;
    await appendSpend(projectId, {
      operation: 'voice',
      provider: 'elevenlabs',
      state: 'failed-no-charge',
      estimatedUsd: 0.01,
      idempotencyKey: key
    });
    await assert.doesNotReject(() => assertSpendRetrySafe(projectId, key, 'voz'));
  } finally {
    if (previousDataDir === undefined) delete process.env.VIRALCINE_DATA_DIR;
    else process.env.VIRALCINE_DATA_DIR = previousDataDir;
    await rm(tempRoot, { recursive: true, force: true });
  }
});
