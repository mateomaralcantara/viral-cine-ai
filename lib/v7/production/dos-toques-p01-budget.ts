/**
 * Scoped creative-production authorization from the creator.
 * One invocation only. Code approval is NOT an API submission or a bank hold.
 * The provider account can be charged only after the local preflight passes.
 */
export const DOS_TOQUES_FIRST_SHOT_BUDGET = Object.freeze({
  filmId: 'film-dos-toques-de-bocina-v7',
  shotId: 'E01-P01',
  model: 'veo-3.1-fast-generate-preview',
  resolution: '720p',
  aspectRatio: '16:9',
  providerSeconds: 8,
  providerRateUsdPerSecond: 0.10,
  maxTotalUsd: 2.00,
  maxProviderSubmissions: 1,
  automaticRetries: 0,
  requiresReferenceImage: false, // Google Veo image-to-video restricts people to allow_adult; E01 has two children.
  requiresAdminAuthentication: true,
  requiresExplicitLocalAction: true,
  scope: 'one paid generation for E01-P01 only; no extra shots, no retry, no music or voice charges',
} as const);

export function firstShotQuotedUsd(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Tarifa de proveedor inválida.');
  const value = Math.round(rate * DOS_TOQUES_FIRST_SHOT_BUDGET.providerSeconds * 10000) / 10000;
  return value;
}

export function maySubmitFirstShot(args: {
  shotId: string;
  model: string;
  rateUsdPerSecond: number | null;
  providerSubmissions: number;
  referenceReady: boolean;
  alreadyReserved: boolean;
  localCapUsd: number;
}): boolean {
  const auth = DOS_TOQUES_FIRST_SHOT_BUDGET;
  if (args.shotId !== auth.shotId || args.model !== auth.model ||
      args.rateUsdPerSecond === null || !Number.isFinite(args.rateUsdPerSecond) ||
      args.rateUsdPerSecond !== auth.providerRateUsdPerSecond ||
      !Number.isInteger(args.providerSubmissions) || args.providerSubmissions >= auth.maxProviderSubmissions ||
      !args.referenceReady || args.alreadyReserved ||
      !Number.isFinite(args.localCapUsd) || args.localCapUsd < firstShotQuotedUsd(auth.providerRateUsdPerSecond)) {
    return false;
  }
  return firstShotQuotedUsd(args.rateUsdPerSecond) <= auth.maxTotalUsd;
}
