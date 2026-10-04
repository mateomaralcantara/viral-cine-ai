import test from 'node:test';
import assert from 'node:assert/strict';
import type { SpendLedgerEntry } from '../lib/engine/spend-ledger';
import { summarizeSpendLedger } from '../lib/engine/spend-report-v4';

function entry(
  id: string,
  key: string,
  state: SpendLedgerEntry['state'],
  estimatedUsd: number,
  actualUsd?: number,
  provider = 'TestProvider',
  operation: SpendLedgerEntry['operation'] = 'video'
): SpendLedgerEntry {
  return {
    id,
    createdAt: '2026-10-04T00:00:00.000Z',
    projectId: 'p',
    operation,
    provider,
    state,
    estimatedUsd,
    actualUsd,
    idempotencyKey: key
  };
}

test('deduplica estados por idempotencyKey y usa el ultimo', () => {
  const summary = summarizeSpendLedger([
    entry('1', 'same', 'submitted', 0.8),
    entry('2', 'same', 'succeeded', 0.8),
    entry('3', 'other', 'failed-no-charge', 0.8, 0)
  ]);

  assert.equal(summary.rawEntries, 3);
  assert.equal(summary.uniqueOperations, 2);
  assert.equal(summary.estimatedSuccessfulUsd, 0.8);
  assert.equal(summary.failedNoChargeOperations, 1);
  assert.equal(summary.accountedUsd, 0.8);
});

test('separa actual confirmado, riesgo desconocido y pendiente', () => {
  const summary = summarizeSpendLedger([
    entry('1', 'ok-actual', 'succeeded', 1, 0.92),
    entry('2', 'unknown', 'failed-unknown', 0.5),
    entry('3', 'pending', 'submitted', 0.25)
  ]);

  assert.equal(summary.confirmedActualUsd, 0.92);
  assert.equal(summary.unknownRiskUsd, 0.5);
  assert.equal(summary.pendingUsd, 0.25);
  assert.equal(summary.accountedUsd, 1.42);
});
