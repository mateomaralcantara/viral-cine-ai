import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from '@/lib/storage/project-store';
import { ProductionSafetyError } from '@/lib/engine/production-safety';

export type SpendOperation = 'script' | 'image' | 'voice' | 'video' | 'lip-sync' | 'music' | 'audit';
export type SpendState = 'reserved' | 'submitted' | 'succeeded' | 'failed-no-charge' | 'failed-unknown' | 'reconciled';

export type SpendLedgerEntry = {
  id: string;
  createdAt: string;
  projectId: string;
  operation: SpendOperation;
  provider: string;
  model?: string;
  state: SpendState;
  estimatedUsd: number;
  actualUsd?: number;
  sceneId?: string;
  shotId?: string;
  characterId?: string;
  idempotencyKey?: string;
  providerRequestId?: string;
  outputAsset?: string;
  error?: string;
};

export async function appendSpend(
  projectId: string,
  entry: Omit<SpendLedgerEntry, 'id' | 'createdAt' | 'projectId'>
): Promise<SpendLedgerEntry> {
  const full: SpendLedgerEntry = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    projectId,
    ...entry,
    estimatedUsd: roundMoney(entry.estimatedUsd)
  };
  const file = ledgerPath(projectId);
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(full)}\n`, 'utf8');
  return full;
}

export async function readSpendLedger(projectId: string): Promise<SpendLedgerEntry[]> {
  try {
    const raw = await readFile(ledgerPath(projectId), 'utf8');
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SpendLedgerEntry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function latestSpendForKey(projectId: string, idempotencyKey: string) {
  const entries = await readSpendLedger(projectId);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index].idempotencyKey === idempotencyKey) return entries[index];
  }
  return undefined;
}

export async function assertSpendRetrySafe(
  projectId: string,
  idempotencyKey: string,
  operationLabel: string
) {
  let latest = await latestSpendForKey(projectId, idempotencyKey);
  if (!latest) return;

  // Compatibilidad con ejecuciones anteriores a la clasificación explícita
  // de cuota Veo: un 429/RESOURCE_EXHAUSTED fallaba antes de crear video,
  // pero quedaba registrado como failed-unknown y bloqueaba reintentos futuros.
  if (isKnownNoChargeLedgerFailure(latest)) {
    latest = await appendSpend(projectId, {
      operation: latest.operation,
      provider: latest.provider,
      model: latest.model,
      state: 'failed-no-charge',
      estimatedUsd: latest.estimatedUsd,
      actualUsd: 0,
      sceneId: latest.sceneId,
      shotId: latest.shotId,
      characterId: latest.characterId,
      idempotencyKey: latest.idempotencyKey,
      providerRequestId: latest.providerRequestId,
      error:
        '[auto-reconciled-no-charge] ' +
        (latest.error || 'Veo 429/RESOURCE_EXHAUSTED antes de generar video.')
    });
  }

  if (latest.state === 'reserved' || latest.state === 'failed-no-charge') return;

  if (['submitted', 'succeeded', 'failed-unknown', 'reconciled'].includes(latest.state)) {
    throw new ProductionSafetyError(
      'Bloqueo de reintento de gasto: ' + operationLabel +
      ' ya tiene estado ' + latest.state +
      ' para ' + idempotencyKey +
      '. Verifica el proveedor/asset antes de autorizar otro cobro.'
    );
  }
}

export function isKnownNoChargeLedgerFailure(entry: SpendLedgerEntry) {
  if (entry.state !== 'failed-unknown') return false;
  if (entry.operation !== 'video') return false;
  if (entry.provider.toLowerCase() !== 'veo') return false;

  const detail = (entry.error || '').toUpperCase();
  return (
    /\b429\b/.test(detail) ||
    detail.includes('RESOURCE_EXHAUSTED') ||
    detail.includes('CURRENT QUOTA') ||
    detail.includes('RATE LIMIT')
  );
}

export async function reservedMovieSpend(projectId: string) {
  const entries = await readSpendLedger(projectId);
  const latestByKey = new Map<string, SpendLedgerEntry>();
  for (const entry of entries) latestByKey.set(entry.idempotencyKey || entry.id, entry);
  return roundMoney([...latestByKey.values()]
    .filter((entry) => ['reserved', 'submitted', 'succeeded', 'failed-unknown', 'reconciled'].includes(entry.state))
    .reduce((sum, entry) => sum + (entry.actualUsd ?? entry.estimatedUsd), 0));
}

export function estimateOperationCost(operation: SpendOperation, units = 1) {
  const rates: Record<SpendOperation, number> = {
    script: envNumber('COST_SCRIPT_CALL', 0.08),
    image: envNumber('COST_IMAGE', 0.08),
    voice: envNumber('COST_TTS_1K_CHARS', 0.015),
    video: envNumber('COST_AI_VIDEO_SECOND', 0.10),
    'lip-sync': envNumber('COST_LIPSYNC_SECOND', 8 / 60),
    music: envNumber('COST_MUSIC_SECOND', 0.003),
    audit: envNumber('COST_QUALITY_REVIEW', 0.03)
  };
  return roundMoney(rates[operation] * Math.max(0, units));
}

export function voiceCostUnits(text: string) {
  return Math.max(0.001, text.length / 1000);
}

function ledgerPath(projectId: string) {
  return path.join(projectRoot(projectId), 'checkpoints', 'spend-ledger.jsonl');
}

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const roundMoney = (value: number) => Math.round(value * 10000) / 10000;
