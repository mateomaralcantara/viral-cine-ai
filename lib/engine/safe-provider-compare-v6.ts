export type SafeVideoCandidate = {
  provider: 'runway-router' | 'vertex-ai';
  model: string;
  durationSeconds: number;
  resolution: '720p' | '1080p';
  estimatedUsd: number;
  source: string;
  pricingSnapshotDate: string;
  note?: string;
};

export const VERTEX_VEO_PRICING_SNAPSHOT = {
  date: '2026-10-07',
  source: 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing',
  ratesUsdPerSecond: {
    'veo-3.1-lite-generate-001': {
      '720p': 0.03,
      '1080p': 0.05
    },
    'veo-3.1-fast-generate-001': {
      '720p': 0.08,
      '1080p': 0.10
    },
    'veo-3.1-generate-001': {
      '720p': 0.20,
      '1080p': 0.20
    }
  }
} as const;

export const RUNWAY_CREDIT_USD = 0.01;

export function estimateVertexVideoCandidates(
  durationSeconds: number,
  resolution: '720p' | '1080p' = '720p'
): SafeVideoCandidate[] {
  if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
    throw new Error('durationSeconds debe ser un entero positivo.');
  }

  return Object.entries(
    VERTEX_VEO_PRICING_SNAPSHOT.ratesUsdPerSecond
  ).map(([model, byResolution]) => {
    const rate = byResolution[resolution];
    return {
      provider: 'vertex-ai' as const,
      model,
      durationSeconds,
      resolution,
      estimatedUsd: roundMoney(rate * durationSeconds),
      source: VERTEX_VEO_PRICING_SNAPSHOT.source,
      pricingSnapshotDate: VERTEX_VEO_PRICING_SNAPSHOT.date,
      note: 'Video-only; no incluye audio nativo.'
    };
  });
}

export function candidateFromRunwayDryRun(input: {
  model: string;
  credits: number;
  durationSeconds: number;
  resolution: '720p' | '1080p';
}): SafeVideoCandidate {
  if (!Number.isFinite(input.credits) || input.credits < 0) {
    throw new Error('Créditos Runway inválidos.');
  }

  return {
    provider: 'runway-router',
    model: input.model,
    durationSeconds: input.durationSeconds,
    resolution: input.resolution,
    estimatedUsd: roundMoney(input.credits * RUNWAY_CREDIT_USD),
    source: 'Runway Model Router dryRun',
    pricingSnapshotDate: 'live-dry-run',
    note:
      input.credits +
      ' créditos reportados por dryRun; no se generó asset.'
  };
}

export function rankSafeVideoCandidates(
  candidates: SafeVideoCandidate[],
  maxUsd: number
) {
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) {
    throw new Error('maxUsd debe ser positivo.');
  }

  const eligible = candidates
    .filter((candidate) => candidate.estimatedUsd <= maxUsd + 0.0001)
    .sort((a, b) => {
      if (a.estimatedUsd !== b.estimatedUsd) {
        return a.estimatedUsd - b.estimatedUsd;
      }
      return a.provider.localeCompare(b.provider);
    });

  const rejected = candidates
    .filter((candidate) => candidate.estimatedUsd > maxUsd + 0.0001)
    .sort((a, b) => a.estimatedUsd - b.estimatedUsd);

  return {
    eligible,
    rejected,
    winner: eligible[0]
  };
}

export function assertPricingSnapshotFresh(
  now = new Date(),
  maxAgeDays = 30
) {
  const snapshot = new Date(
    VERTEX_VEO_PRICING_SNAPSHOT.date + 'T00:00:00Z'
  );
  const ageMs = now.getTime() - snapshot.getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);

  if (ageDays > maxAgeDays) {
    throw new Error(
      'Pricing snapshot de Vertex tiene ' +
        Math.floor(ageDays) +
        ' días. Actualiza precios antes de autorizar gasto.'
    );
  }
}

function roundMoney(value: number) {
  return Math.round(value * 10000) / 10000;
}
