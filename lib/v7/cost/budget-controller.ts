import type { GenerationJob } from '@/lib/v7/domain/job';

export type BudgetEnvelope = {
  limitUsd: number;
  succeededUsd: number;
  reservedUsd: number;
  unknownRiskUsd: number;
};

export function budgetExposure(envelope: BudgetEnvelope) {
  return round(envelope.succeededUsd + envelope.reservedUsd + envelope.unknownRiskUsd);
}

export function canReserve(envelope: BudgetEnvelope, nextEstimatedUsd: number) {
  return nextEstimatedUsd >= 0 &&
    budgetExposure(envelope) + nextEstimatedUsd <= envelope.limitUsd;
}

export function assertCanReserve(envelope: BudgetEnvelope, nextEstimatedUsd: number) {
  if (!canReserve(envelope, nextEstimatedUsd)) {
    throw new Error(
      'V7_BUDGET_BLOCKED: exposure=' + budgetExposure(envelope).toFixed(2) +
      ' next=' + nextEstimatedUsd.toFixed(2) +
      ' limit=' + envelope.limitUsd.toFixed(2)
    );
  }
}

export function estimateJobs(jobs: GenerationJob[]) {
  return round(jobs.reduce((sum, job) => sum + job.estimatedCostUsd, 0));
}

function round(value: number) {
  return Math.round(value * 10000) / 10000;
}
