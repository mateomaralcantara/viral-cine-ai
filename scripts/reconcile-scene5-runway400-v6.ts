import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  appendSpend,
  readSpendLedger,
  type SpendLedgerEntry
} from '@/lib/engine/spend-ledger';

loadProjectLocalEnvOverride();

const [projectId, confirmation] = process.argv.slice(2);
const EXPECTED = '--confirm-scene5-runway400-no-charge';

if (!projectId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene5:reconcile-runway400 -- <projectId> ' +
      EXPECTED
  );
  process.exit(1);
}

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — RECONCILIAR RUNWAY HTTP 400 E5');
console.log('==================================================');
console.log('Modo: LEDGER LOCAL');
console.log('Llamadas externas: NO');
console.log('Generación: NO');
console.log('Gasto nuevo: US$0');
console.log('Fal.ai: NO');
console.log('');

const ledger = await readSpendLedger(projectId);

const target = [...ledger]
  .reverse()
  .find((entry) =>
    entry.operation === 'video' &&
    entry.provider === 'runway-direct' &&
    entry.model === 'wan3' &&
    entry.state === 'failed-unknown' &&
    /^v6safe:e5:t[3-6]:wan3-audio-reference:1$/.test(
      entry.idempotencyKey || ''
    ) &&
    !entry.providerRequestId &&
    /Runway HTTP 400/i.test(entry.error || '') &&
    /Validation of body failed/i.test(entry.error || '') &&
    /Invalid asset aspect ratio/i.test(entry.error || '')
  );

const already = [...ledger]
  .reverse()
  .find((entry) =>
    entry.operation === 'video' &&
    entry.provider === 'runway-direct' &&
    entry.model === 'wan3' &&
    entry.state === 'failed-no-charge' &&
    /^v6safe:e5:t[3-6]:wan3-audio-reference:1$/.test(
      entry.idempotencyKey || ''
    ) &&
    /Invalid asset aspect ratio/i.test(entry.error || '')
  );

if (already) {
  console.log('SCENE5_RUNWAY400_ALREADY_RECONCILED=YES');
  console.log('Estado: failed-no-charge');
  console.log('Gasto nuevo: US$0');
  process.exit(0);
}

if (!target) {
  throw new Error(
    'No encuentro un failed-unknown WAN E5 por HTTP 400 / Invalid asset aspect ratio sin taskId. No se modificó el ledger.'
  );
}

await appendSpend(projectId, {
  operation: target.operation,
  provider: target.provider,
  model: target.model,
  state: 'failed-no-charge',
  estimatedUsd: target.estimatedUsd,
  actualUsd: 0,
  sceneId: target.sceneId,
  shotId: target.shotId,
  characterId: target.characterId,
  idempotencyKey: target.idempotencyKey,
  error:
    '[runway-http400-reconciled] Rechazo de validación antes de crear task: ' +
    (target.error || '')
});

console.log('SCENE5_RUNWAY400_RECONCILED=PASS');
console.log('Idempotency key: ' + target.idempotencyKey);
console.log('Estado nuevo: failed-no-charge');
console.log('Task creado: NO');
console.log('Output generado: NO');
console.log('Gasto nuevo: US$0');
console.log('RETRY_ALLOWED=YES');
