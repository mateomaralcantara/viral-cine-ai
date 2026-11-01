import test from 'node:test';
import assert from 'node:assert/strict';
import type { SpendLedgerEntry } from '../lib/engine/spend-ledger';
import { isKnownNoChargeLedgerFailure } from '../lib/engine/spend-ledger';

function entry(overrides: Partial<SpendLedgerEntry> = {}): SpendLedgerEntry {
  return {
    id: '1',
    createdAt: '2026-10-04T00:00:00.000Z',
    projectId: 'p',
    operation: 'video',
    provider: 'Veo',
    state: 'failed-unknown',
    estimatedUsd: 0.8,
    idempotencyKey: 'video:test:v5',
    ...overrides
  };
}

test('reconoce Veo 429 histórico como no-charge reconciliable', () => {
  assert.equal(
    isKnownNoChargeLedgerFailure(
      entry({ error: 'ApiError: code 429 RESOURCE_EXHAUSTED current quota exceeded' })
    ),
    true
  );
});

test('no reconcilia errores Veo desconocidos que podrían haber cobrado', () => {
  assert.equal(
    isKnownNoChargeLedgerFailure(
      entry({ error: 'timeout después de enviar la generación al proveedor' })
    ),
    false
  );
});

test('no reconcilia 429 de otro proveedor ni otra operación', () => {
  assert.equal(
    isKnownNoChargeLedgerFailure(
      entry({ provider: 'OtherProvider', error: '429 rate limit' })
    ),
    false
  );
  assert.equal(
    isKnownNoChargeLedgerFailure(
      entry({ operation: 'image', error: '429 rate limit' })
    ),
    false
  );
});

test('solo aplica sobre failed-unknown', () => {
  assert.equal(
    isKnownNoChargeLedgerFailure(
      entry({ state: 'failed-no-charge', error: '429 RESOURCE_EXHAUSTED' })
    ),
    false
  );
});
