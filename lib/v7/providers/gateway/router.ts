export type ProviderCandidate = {
  providerId: string;
  estimatedCostUsd: number;
  successRate: number;
  averageQuality: number;
  averageLatencyMs: number;
  consecutiveSafeFailures: number;
  circuitOpen: boolean;
  capabilityMatch: number;
};

export function rankProviderCandidates(candidates: ProviderCandidate[]) {
  return [...candidates]
    .map((candidate) => ({
      ...candidate,
      score: candidate.circuitOpen
        ? Number.NEGATIVE_INFINITY
        : round(
            candidate.capabilityMatch * 4 +
            candidate.successRate * 3 +
            candidate.averageQuality * 0.6 -
            Math.min(5, candidate.averageLatencyMs / 60000) -
            candidate.estimatedCostUsd * 2 -
            candidate.consecutiveSafeFailures
          )
    }))
    .sort((a, b) => b.score - a.score);
}

export function selectProviderCandidate(candidates: ProviderCandidate[]) {
  const ranked = rankProviderCandidates(candidates);
  const selected = ranked.find((candidate) => Number.isFinite(candidate.score));
  if (!selected) throw new Error('V7_PROVIDER_UNAVAILABLE: no hay candidato utilizable.');
  return selected;
}

function round(value: number) {
  return Math.round(value * 10000) / 10000;
}
