import { SpendEntrySchemaV7, type SpendEntryV7 } from '@/lib/v7/domain/spend';

export type SpendLedgerV7 = ReadonlyArray<SpendEntryV7>;

export function appendSpendEntry(ledger: SpendLedgerV7, entry: SpendEntryV7): SpendLedgerV7 {
  const parsed = SpendEntrySchemaV7.parse(entry);
  if (ledger.some((candidate) => candidate.id === parsed.id)) {
    throw new Error('Spend Ledger V7 es append-only: entry id duplicado.');
  }
  return Object.freeze([...ledger, parsed]);
}

export function latestSpendForKey(ledger: SpendLedgerV7, idempotencyKey: string) {
  return [...ledger].reverse().find((entry) => entry.idempotencyKey === idempotencyKey);
}

export function assertRetrySafe(ledger: SpendLedgerV7, idempotencyKey: string) {
  const latest = latestSpendForKey(ledger, idempotencyKey);
  if (!latest) return;
  if (latest.state === 'reserved' || latest.state === 'failed-no-charge') return;
  throw new Error(
    'V7_RETRY_BLOCKED: ' + idempotencyKey + ' state=' + latest.state +
    '. Reconciliar antes de un nuevo intento.'
  );
}

export function summarizeSpend(ledger: SpendLedgerV7) {
  const latest = new Map<string, SpendEntryV7>();
  for (const entry of ledger) latest.set(entry.idempotencyKey, entry);
  let succeededUsd = 0;
  let reservedUsd = 0;
  let unknownRiskUsd = 0;
  for (const entry of latest.values()) {
    if (entry.state === 'succeeded' || entry.state === 'reconciled') {
      succeededUsd += entry.actualUsd ?? entry.estimatedUsd;
    } else if (entry.state === 'reserved' || entry.state === 'submitted') {
      reservedUsd += entry.estimatedUsd;
    } else if (entry.state === 'failed-unknown') {
      unknownRiskUsd += Math.max(entry.riskUsd, entry.estimatedUsd);
    }
  }
  return {
    succeededUsd: round(succeededUsd),
    reservedUsd: round(reservedUsd),
    unknownRiskUsd: round(unknownRiskUsd),
    exposureUsd: round(succeededUsd + reservedUsd + unknownRiskUsd)
  };
}

function round(value: number) {
  return Math.round(value * 10000) / 10000;
}
