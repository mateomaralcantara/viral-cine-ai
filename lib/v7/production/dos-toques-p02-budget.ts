/** Creator-approved planning ceiling for E01-P02. NOT a final submission authorization. */
export const DOS_TOQUES_SECOND_SHOT_BUDGET = Object.freeze({
  filmId: 'film-dos-toques-de-bocina-v7',
  shotId: 'E01-P02',
  model: 'veo-3.1-fast-generate-preview',
  providerSeconds: 8,
  providerRateUsdPerSecond: 0.10,
  maxTotalUsd: 0.80,
  maxProviderSubmissions: 0, // Final explicit panel confirmation workflow is NOT installed.
  automaticRetries: 0,
  requiresFinalPanelConfirmation: true,
  executionEnabled: false
} as const);
export function secondShotQuotedUsd(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Tarifa inválida');
  return Math.round(rate * 8 * 100) / 100;
}
export function maySubmitSecondShot(_args: unknown): boolean {
  return false; // Fail closed until the audited one-shot authorization flow exists.
}
