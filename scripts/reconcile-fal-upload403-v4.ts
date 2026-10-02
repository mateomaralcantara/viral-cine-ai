import { readSpendLedger, appendSpend } from '@/lib/engine/spend-ledger';

const [projectId, parentShotId, confirm] = process.argv.slice(2);

if (!projectId || !parentShotId || confirm !== '--confirm-upload-403') {
  console.log('Uso: npm run fal:reconcile-upload403 -- <projectId> <parentShotId> --confirm-upload-403');
  process.exit(1);
}

const entries = await readSpendLedger(projectId);
const candidates = entries.filter((entry) =>
  entry.operation === 'lip-sync' &&
  (entry.shotId === parentShotId || entry.shotId?.startsWith(parentShotId + ':turn:'))
);

const latest = candidates.at(-1);
if (!latest) throw new Error('No existe un intento lip-sync para esa toma.');

if (latest.state !== 'failed-unknown') {
  throw new Error('El último estado no es failed-unknown; estado actual: ' + latest.state);
}

const errorText = latest.error || '';
if (!/subir el recurso/i.test(errorText) || !/HTTP 40[13]/i.test(errorText)) {
  throw new Error('El fallo no corresponde inequívocamente a autenticación/autorización durante upload.');
}

if (latest.outputAsset) {
  throw new Error('El intento ya tiene outputAsset; no se reconciliará automáticamente.');
}

await appendSpend(projectId, {
  operation: 'lip-sync',
  provider: latest.provider,
  model: latest.model,
  state: 'failed-no-charge',
  estimatedUsd: latest.estimatedUsd,
  actualUsd: 0,
  sceneId: latest.sceneId,
  shotId: latest.shotId,
  characterId: latest.characterId,
  idempotencyKey: latest.idempotencyKey,
  error:
    'Reconciliado localmente: fallo HTTP 401/403 durante upload, antes de fal.subscribe(); ' +
    'sin inferencia lip-sync enviada. El posible tratamiento de almacenamiento por Fal no se evalúa aquí.'
});

console.log('FAL_UPLOAD_403_RECONCILED=PASS');
console.log('Estado nuevo: failed-no-charge');
console.log('Inferencia lip-sync previa: NO ENVIADA');
console.log('Este comando no llamó Fal.ai ni otra API.');
