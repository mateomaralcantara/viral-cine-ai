import { createHash } from 'node:crypto';
import { envFlag } from '@/lib/engine/production-safety';

export type SafeRunwayModel =
  | 'gen4_turbo'
  | 'h3_max_480'
  | 'wan3_480'
  | 'gen4.5';

export type SafeCostTicketInput = {
  projectId: string;
  sceneOrder: number;
  shotOrder: number;
  shotId: string;
  durationSeconds: number;
  model?: SafeRunwayModel;
  ratio?: '1280:720' | '720:1280';
};

export type SafeCostTicket = {
  version: '6.0-safe-v1';
  provider: 'runway';
  model: SafeRunwayModel;
  projectId: string;
  sceneOrder: number;
  shotOrder: number;
  shotId: string;
  durationSeconds: number;
  ratio: '1280:720' | '720:1280';
  creditsPerSecond: number;
  credits: number;
  usdPerCredit: number;
  maxUsd: number;
  ticketId: string;
  exactConfirmation: string;
  pricingSnapshotDate: '2026-10-06';
  pricingSource: 'https://docs.dev.runwayml.com/guides/pricing/';
};

const PRICE: Record<SafeRunwayModel, number> = {
  gen4_turbo: 5,
  h3_max_480: 5,
  wan3_480: 5,
  'gen4.5': 12
};

const USD_PER_CREDIT = 0.01;

export function createSafeRunwayCostTicket(
  input: SafeCostTicketInput
): SafeCostTicket {
  const model = input.model || 'gen4_turbo';
  const creditsPerSecond = PRICE[model];

  if (!creditsPerSecond) {
    throw new Error('Modelo Runway no autorizado por ViralCine 6 Safe.');
  }
  if (!Number.isInteger(input.durationSeconds) || input.durationSeconds < 2 || input.durationSeconds > 10) {
    throw new Error(
      'ViralCine 6 Safe limita cada preview Runway a 2-10 segundos.'
    );
  }

  const credits = input.durationSeconds * creditsPerSecond;
  const maxUsd = roundMoney(credits * USD_PER_CREDIT);
  const ratio = input.ratio || '1280:720';

  const fingerprint = [
    '6.0-safe-v1',
    'runway',
    model,
    input.projectId,
    input.sceneOrder,
    input.shotOrder,
    input.shotId,
    input.durationSeconds,
    ratio,
    credits,
    maxUsd.toFixed(2)
  ].join('|');

  const ticketId = createHash('sha256')
    .update(fingerprint)
    .digest('hex')
    .slice(0, 12)
    .toUpperCase();

  return {
    version: '6.0-safe-v1',
    provider: 'runway',
    model,
    projectId: input.projectId,
    sceneOrder: input.sceneOrder,
    shotOrder: input.shotOrder,
    shotId: input.shotId,
    durationSeconds: input.durationSeconds,
    ratio,
    creditsPerSecond,
    credits,
    usdPerCredit: USD_PER_CREDIT,
    maxUsd,
    ticketId,
    exactConfirmation:
      'AUTORIZO US$' + maxUsd.toFixed(2) + ' ' + ticketId,
    pricingSnapshotDate: '2026-10-06',
    pricingSource: 'https://docs.dev.runwayml.com/guides/pricing/'
  };
}

export function assertSafeCostAuthorization(
  ticket: SafeCostTicket,
  confirmation: string | undefined
) {
  if (!envFlag('ALLOW_EXTERNAL_API_CALLS')) {
    throw new Error(
      'SAFE COST GATE: ALLOW_EXTERNAL_API_CALLS=false. No se puede tocar ninguna API.'
    );
  }
  if (!envFlag('ALLOW_PAID_GENERATION')) {
    throw new Error(
      'SAFE COST GATE: ALLOW_PAID_GENERATION=false. No se puede ejecutar una llamada pagada.'
    );
  }

  const configuredLimit = Number(
    process.env.SAFE_MAX_SINGLE_CALL_USD || '0.50'
  );
  if (!Number.isFinite(configuredLimit) || configuredLimit <= 0) {
    throw new Error('SAFE_MAX_SINGLE_CALL_USD es inválido.');
  }
  if (ticket.maxUsd > configuredLimit + 0.0001) {
    throw new Error(
      'SAFE COST GATE: costo US$' +
        ticket.maxUsd.toFixed(2) +
        ' supera el máximo por llamada US$' +
        configuredLimit.toFixed(2) +
        '.'
    );
  }

  if ((confirmation || '').trim() !== ticket.exactConfirmation) {
    throw new Error(
      'SAFE COST GATE: autorización incorrecta. Debe coincidir exactamente con el ticket.'
    );
  }
}

export function runwayCreditsPerSecond(model: SafeRunwayModel) {
  return PRICE[model];
}

function roundMoney(value: number) {
  return Math.round(value * 10000) / 10000;
}
