export type CinemaStatus =
  | 'reserved'
  | 'submitted'
  | 'processing'
  | 'review-required'
  | 'failed-unknown';

export type CinemaRecord = {
  filmId: string;
  shotId: string;
  model: string;
  durationSeconds: number;
  estimatedUsd: number;
  referenceSha256: string;
  status: CinemaStatus;
  createdAt: string;
  updatedAt: string;
  operationName?: string;
  candidateName?: string;
  error?: string;
};

export function veoSeconds(requested: number): 4 | 6 | 8 {
  if (!Number.isFinite(requested) || requested <= 0 || requested > 8) {
    throw new Error('La toma debe tener entre 0 y 8 segundos para Veo.');
  }
  return requested <= 4 ? 4 : requested <= 6 ? 6 : 8;
}

export function estimateVeoUsd(seconds: number, rateUsd: number): number {
  if (!Number.isFinite(rateUsd) || rateUsd <= 0 || rateUsd > 10) {
    throw new Error('Tarifa de Veo sin verificar. Configura V7_VEO_USD_PER_SECOND.');
  }
  return Math.round(veoSeconds(seconds) * rateUsd * 10000) / 10000;
}

export function cinemaExposure(records: readonly CinemaRecord[]): number {
  // Un intento dudoso NO libera el presupuesto: su cobro debe reconciliarse.
  return Math.round(records.reduce((sum, record) => sum + record.estimatedUsd, 0) * 10000) / 10000;
}

export function canSubmitCinema(args: {
  alreadyExists: boolean;
  budgetUsd: number;
  exposureUsd: number;
  estimatedUsd: number;
}) {
  return !args.alreadyExists &&
    args.budgetUsd > 0 &&
    args.estimatedUsd > 0 &&
    args.exposureUsd + args.estimatedUsd <= args.budgetUsd + 0.000001;
}
