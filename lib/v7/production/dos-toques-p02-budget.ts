/** E01-P02 one-shot authorization: creator ceiling USD 0.80; requires a separate authenticated click. */
export const DOS_TOQUES_SECOND_SHOT_BUDGET = Object.freeze({
  filmId: 'film-dos-toques-de-bocina-v7',
  shotId: 'E01-P02',
  model: 'veo-3.1-fast-generate-preview',
  providerSeconds: 8,
  providerRateUsdPerSecond: 0.10,
  maxTotalUsd: 0.80,
  maxProviderSubmissions: 1,
  automaticRetries: 0,
  requiresFinalPanelConfirmation: true,
  executionEnabled: true
} as const);
export function secondShotQuotedUsd(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Tarifa inválida');
  return Math.round(rate * 8 * 100) / 100;
}
export function maySubmitSecondShot(args: {
  shotId: string; model: string; rateUsdPerSecond: number;
  providerSubmissions: number; referenceReady: boolean;
  alreadyReserved: boolean; localCapUsd: number;
}): boolean {
  const b = DOS_TOQUES_SECOND_SHOT_BUDGET;
  return args.shotId === b.shotId && args.model === b.model &&
    args.rateUsdPerSecond === b.providerRateUsdPerSecond &&
    Number.isInteger(args.providerSubmissions) && args.providerSubmissions >= 0 &&
    args.providerSubmissions < b.maxProviderSubmissions &&
    args.referenceReady === true && args.alreadyReserved === false &&
    Number.isFinite(args.localCapUsd) && args.localCapUsd >= secondShotQuotedUsd(args.rateUsdPerSecond) &&
    args.localCapUsd <= b.maxTotalUsd &&
    secondShotQuotedUsd(args.rateUsdPerSecond) <= b.maxTotalUsd;
}
