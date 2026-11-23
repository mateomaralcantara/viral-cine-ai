import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  appendSpend,
  readSpendLedger,
  type SpendLedgerEntry
} from '@/lib/engine/spend-ledger';
import {
  getRunwayTaskDetailsFromEnvironment
} from '@/lib/providers/runway-router-v6';

loadProjectLocalEnvOverride();

const [projectId, taskId, confirmation] = process.argv.slice(2);
const EXPECTED = '--confirm-scene4-wan-internal-no-charge';

if (!projectId || !taskId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene4:reconcile-wan-internal -- <projectId> <taskId> ' +
      EXPECTED
  );
  process.exit(1);
}

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — RECONCILIAR WAN INTERNAL E4');
console.log('==================================================');
console.log('Task: ' + taskId);
console.log('Modo: SOLO LECTURA + LEDGER LOCAL');
console.log('Generación nueva: NO');
console.log('Gasto nuevo: US$0');
console.log('Fal.ai: NO');
console.log('');

const task = await getRunwayTaskDetailsFromEnvironment(taskId);

console.log('Status: ' + task.status);
console.log('Failure code: ' + (task.failureCode || 'NONE'));
console.log('Failure: ' + (task.failure || 'NONE'));
console.log('Output count: ' + task.output.length);

if (
  task.status !== 'FAILED' ||
  task.failureCode !== 'INTERNAL' ||
  task.output.length !== 0
) {
  throw new Error(
    'No se cumplen las condiciones de reconciliación: ' +
      'se exige FAILED + INTERNAL + output vacío.'
  );
}

const ledger = await readSpendLedger(projectId);
const failed = findFailedUnknown(ledger, taskId);
const noCharge = findNoCharge(ledger, taskId);

if (!failed && !noCharge) {
  throw new Error(
    'No encuentro este task WAN 3.0 de Escena 4 en el ledger.'
  );
}

if (noCharge) {
  console.log('');
  console.log('WAN_INTERNAL_ALREADY_RECONCILED=YES');
  console.log('Estado ledger: failed-no-charge');
  console.log('Nuevo gasto: US$0');
  process.exit(0);
}

await appendSpend(projectId, {
  operation: failed!.operation,
  provider: failed!.provider,
  model: failed!.model,
  state: 'failed-no-charge',
  estimatedUsd: failed!.estimatedUsd,
  actualUsd: 0,
  sceneId: failed!.sceneId,
  shotId: failed!.shotId,
  characterId: failed!.characterId,
  idempotencyKey: failed!.idempotencyKey,
  providerRequestId: taskId,
  error:
    '[runway-internal-reconciled] FAILED + INTERNAL + output vacío. ' +
    'Intento WAN 3.0 de Escena 4 marcado localmente como failed-no-charge.'
});

console.log('');
console.log('WAN_INTERNAL_RECONCILED=PASS');
console.log('Estado nuevo: failed-no-charge');
console.log('Inferencia exitosa previa: NO');
console.log('Output previo: NO');
console.log('Nuevo gasto por reconciliación: US$0');
console.log('RETRY_NOW_ALLOWED_BY_LEDGER=YES');

function findFailedUnknown(
  entries: SpendLedgerEntry[],
  currentTaskId: string
) {
  return [...entries]
    .reverse()
    .find((entry) =>
      entry.operation === 'video' &&
      entry.provider === 'runway-direct' &&
      entry.model === 'wan3' &&
      entry.state === 'failed-unknown' &&
      /^v6safe:e4:t[12]:wan3-audio-reference:1$/.test(
        entry.idempotencyKey || ''
      ) &&
      (
        entry.providerRequestId === currentTaskId ||
        (entry.error || '').includes(currentTaskId)
      )
    );
}

function findNoCharge(
  entries: SpendLedgerEntry[],
  currentTaskId: string
) {
  return [...entries]
    .reverse()
    .find((entry) =>
      entry.operation === 'video' &&
      entry.provider === 'runway-direct' &&
      entry.model === 'wan3' &&
      entry.state === 'failed-no-charge' &&
      /^v6safe:e4:t[12]:wan3-audio-reference:1$/.test(
        entry.idempotencyKey || ''
      ) &&
      (
        entry.providerRequestId === currentTaskId ||
        (entry.error || '').includes(currentTaskId)
      )
    );
}
