import {
  appendSpend,
  readSpendLedger
} from '@/lib/engine/spend-ledger';
import {
  getProject,
  saveProject
} from '@/lib/storage/project-store';
import {
  releaseNoChargeGenerationReservation
} from '@/lib/engine/spend-guard';

const [projectId, shotId, confirm] = process.argv.slice(2);

if (!projectId || !shotId || confirm !== '--confirm-upload-403') {
  console.log(
    'Uso: npm run fal:reconcile-upload403 -- <projectId> <shotId> --confirm-upload-403'
  );
  process.exit(1);
}

const entries = await readSpendLedger(projectId);

const candidates = entries.filter((entry) =>
  (entry.operation === 'lip-sync' || entry.operation === 'video') &&
  (
    entry.shotId === shotId ||
    entry.shotId?.startsWith(shotId + ':turn:')
  )
);

const latest = candidates.at(-1);

if (!latest) {
  throw new Error(
    'No existe un intento Fal de video/lip-sync para esa toma.'
  );
}

if (latest.state !== 'failed-unknown') {
  throw new Error(
    'El último estado no es failed-unknown; estado actual: ' + latest.state
  );
}

const errorText = latest.error || '';

if (
  !/subir el recurso/i.test(errorText) ||
  !/HTTP 40[13]/i.test(errorText)
) {
  throw new Error(
    'El fallo no corresponde inequívocamente a autenticación/autorización durante upload.'
  );
}

if (latest.outputAsset) {
  throw new Error(
    'El intento ya tiene outputAsset; no se reconciliará automáticamente.'
  );
}

await appendSpend(projectId, {
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
    'Reconciliado localmente: fallo HTTP 401/403 durante upload, antes de fal.subscribe(); ' +
    'sin inferencia Fal enviada. El posible tratamiento de almacenamiento por Fal no se evalúa aquí.'
});

if (latest.operation === 'video' && latest.shotId) {
  const project = await getProject(projectId);
  const shot = project.plan?.scenes
    .flatMap((scene) => scene.shots)
    .find((item) => item.id === latest.shotId);

  if (!shot) {
    throw new Error(
      'Ledger reconciliado, pero no se encontró la toma en project.json para liberar la reserva.'
    );
  }

  if (
    shot.lastGenerationState === 'failed-unknown' ||
    (shot.generationCount || 0) > 0
  ) {
    releaseNoChargeGenerationReservation(
      shot,
      latest.estimatedUsd
    );
  }

  shot.status = 'pending';
  shot.error = undefined;
  shot.safeFailoverResume = true;
  shot.lastGenerationState = undefined;

  project.status = 'ready';
  project.error = undefined;

  project.productionLog.push(
    new Date().toISOString() +
      ' Reconciliación Fal upload 401/403: ' +
      'toma ' + shot.id +
      ' marcada failed-no-charge, reserva de video liberada y reanudación segura habilitada.'
  );

  await saveProject(project);
}

console.log('FAL_UPLOAD_403_RECONCILED=PASS');
console.log('Operacion: ' + latest.operation);
console.log('Estado nuevo: failed-no-charge');
console.log('Inferencia Fal previa: NO ENVIADA');
console.log('Este comando no llamó Fal.ai ni otra API.');
