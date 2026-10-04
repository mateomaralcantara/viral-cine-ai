import type { SpendLedgerEntry } from '@/lib/engine/spend-ledger';

export type SpendSummaryRow = {
  provider: string;
  operation: string;
  uniqueOperations: number;
  succeededOrReconciled: number;
  failedNoCharge: number;
  failedUnknown: number;
  pending: number;
  confirmedActualUsd: number;
  estimatedSuccessfulUsd: number;
  unknownRiskUsd: number;
  pendingUsd: number;
  accountedUsd: number;
};

export type SpendSummary = {
  rawEntries: number;
  uniqueOperations: number;
  rows: SpendSummaryRow[];
  confirmedActualUsd: number;
  estimatedSuccessfulUsd: number;
  unknownRiskUsd: number;
  pendingUsd: number;
  accountedUsd: number;
  failedNoChargeOperations: number;
};

export function summarizeSpendLedger(entries: SpendLedgerEntry[]): SpendSummary {
  const latest = latestByOperation(entries);
  const groups = new Map<string, SpendSummaryRow>();

  let confirmedActualUsd = 0;
  let estimatedSuccessfulUsd = 0;
  let unknownRiskUsd = 0;
  let pendingUsd = 0;
  let failedNoChargeOperations = 0;

  for (const entry of latest) {
    const key = entry.provider + '\0' + entry.operation;
    const row = groups.get(key) || {
      provider: entry.provider,
      operation: entry.operation,
      uniqueOperations: 0,
      succeededOrReconciled: 0,
      failedNoCharge: 0,
      failedUnknown: 0,
      pending: 0,
      confirmedActualUsd: 0,
      estimatedSuccessfulUsd: 0,
      unknownRiskUsd: 0,
      pendingUsd: 0,
      accountedUsd: 0
    };

    row.uniqueOperations += 1;

    const actual = finiteMoney(entry.actualUsd);
    const estimate = finiteMoney(entry.estimatedUsd);

    if (entry.state === 'succeeded' || entry.state === 'reconciled') {
      row.succeededOrReconciled += 1;
      if (actual !== undefined) {
        row.confirmedActualUsd += actual;
        confirmedActualUsd += actual;
      } else {
        row.estimatedSuccessfulUsd += estimate ?? 0;
        estimatedSuccessfulUsd += estimate ?? 0;
      }
    } else if (entry.state === 'failed-no-charge') {
      row.failedNoCharge += 1;
      failedNoChargeOperations += 1;
    } else if (entry.state === 'failed-unknown') {
      row.failedUnknown += 1;
      const value = actual ?? estimate ?? 0;
      row.unknownRiskUsd += value;
      unknownRiskUsd += value;
    } else if (entry.state === 'reserved' || entry.state === 'submitted') {
      row.pending += 1;
      const value = actual ?? estimate ?? 0;
      row.pendingUsd += value;
      pendingUsd += value;
    }

    row.accountedUsd = roundMoney(
      row.confirmedActualUsd +
      row.estimatedSuccessfulUsd +
      row.unknownRiskUsd
    );

    groups.set(key, row);
  }

  const rows = [...groups.values()]
    .map((row) => ({
      ...row,
      confirmedActualUsd: roundMoney(row.confirmedActualUsd),
      estimatedSuccessfulUsd: roundMoney(row.estimatedSuccessfulUsd),
      unknownRiskUsd: roundMoney(row.unknownRiskUsd),
      pendingUsd: roundMoney(row.pendingUsd),
      accountedUsd: roundMoney(row.accountedUsd)
    }))
    .sort((a, b) =>
      a.provider.localeCompare(b.provider) ||
      a.operation.localeCompare(b.operation)
    );

  return {
    rawEntries: entries.length,
    uniqueOperations: latest.length,
    rows,
    confirmedActualUsd: roundMoney(confirmedActualUsd),
    estimatedSuccessfulUsd: roundMoney(estimatedSuccessfulUsd),
    unknownRiskUsd: roundMoney(unknownRiskUsd),
    pendingUsd: roundMoney(pendingUsd),
    accountedUsd: roundMoney(
      confirmedActualUsd +
      estimatedSuccessfulUsd +
      unknownRiskUsd
    ),
    failedNoChargeOperations
  };
}

export function latestByOperation(entries: SpendLedgerEntry[]) {
  const latest = new Map<string, SpendLedgerEntry>();

  for (const entry of entries) {
    latest.set(entry.idempotencyKey || entry.id, entry);
  }

  return [...latest.values()];
}

function finiteMoney(value: number | undefined) {
  if (value === undefined) return undefined;
  return Number.isFinite(value) ? Math.max(0, value) : undefined;
}

function roundMoney(value: number) {
  return Math.round(value * 10000) / 10000;
}
