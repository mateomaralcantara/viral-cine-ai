import { access } from 'node:fs/promises';
import path from 'node:path';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  appendSpend,
  readSpendLedger,
  type SpendLedgerEntry
} from '@/lib/engine/spend-ledger';
import {
  assetAbsolutePath,
  getProject,
  projectAssetDir
} from '@/lib/storage/project-store';
import {
  getRunwayTaskDetailsFromEnvironment
} from '@/lib/providers/runway-router-v6';
import {
  produceScene3SynchronizedV6
} from '@/lib/engine/scene3-sync-producer-v6';

loadProjectLocalEnvOverride();

const [projectId, taskId, confirmation] = process.argv.slice(2);
const EXPECTED = '--confirm-scene3-resume-usd-1.56';
const MIN_RETRY_DELAY_MS = 60_000;

if (!projectId || !taskId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene3:resume-internal -- <projectId> <taskId> ' + EXPECTED
  );
  process.exit(1);
}

if (
  process.env.ALLOW_EXTERNAL_API_CALLS === 'true' ||
  process.env.ALLOW_PAID_GENERATION === 'true' ||
  process.env.ALLOW_PAID_PROVIDER_FALLBACK === 'true'
) {
  throw new Error(
    'Las APIs legacy deben permanecer bloqueadas. Esta ruta abre solo las llamadas explícitas de Scene 3 V6.'
  );
}

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — RECONCILIAR INTERNAL + RESUME');
console.log('==================================================');
console.log('Task previo: ' + taskId);
console.log('Autorización NUEVA máxima: US$1.56');
console.log('Máximo restante previsto: T2 US$1.30 + T3 US$0.25 + voz US$0.01');
console.log('T1: debe existir y se reutiliza');
console.log('Fal.ai: NO');
console.log('Fallback pagado: NO');
console.log('Música: NO');
console.log('');

const task = await getRunwayTaskDetailsFromEnvironment(taskId);

console.log('Estado task previo: ' + task.status);
console.log('Failure code: ' + (task.failureCode || 'NONE'));
console.log('Failure: ' + (task.failure || 'NONE'));
console.log('Output count: ' + task.output.length);

if (task.status !== 'FAILED') {
  throw new Error(
    'El task previo ya no está FAILED. No se reconciliará ni reintentará.'
  );
}

if (task.failureCode !== 'INTERNAL') {
  throw new Error(
    'La ruta de resume solo autoriza failureCode=INTERNAL. Recibido: ' +
      (task.failureCode || 'NONE')
  );
}

if (task.output.length !== 0) {
  throw new Error(
    'El task INTERNAL tiene output. No se considera no-charge automáticamente.'
  );
}

const createdAt = task.createdAt ? Date.parse(task.createdAt) : Number.NaN;
if (Number.isFinite(createdAt)) {
  const ageMs = Date.now() - createdAt;
  if (ageMs < MIN_RETRY_DELAY_MS) {
    throw new Error(
      'Runway recomienda retrasar el retry de INTERNAL. Espera ' +
        Math.ceil((MIN_RETRY_DELAY_MS - ageMs) / 1000) +
        ' segundos y vuelve a ejecutar este comando.'
    );
  }
}

const project = await getProject(projectId);
const scene3 = project.plan?.scenes.find((item) => item.order === 3);
const t1 = scene3?.shots.find((item) => item.order === 1);

if (!scene3 || !t1?.videoAsset || t1.status !== 'ready') {
  throw new Error(
    'Resume bloqueado: E3/T1 no está ready con video reutilizable.'
  );
}

await access(assetAbsolutePath(project.id, t1.videoAsset));

const t2Raw = path.join(
  projectAssetDir(project.id, 'video'),
  'scene-003-shot-02-grok-audio-driven-raw.mp4'
);

if (await exists(t2Raw)) {
  throw new Error(
    'Existe un raw de E3/T2. No se hará retry hasta reconciliar ese asset.'
  );
}

const ledger = await readSpendLedger(project.id);
const matching = [...ledger]
  .reverse()
  .find((entry) =>
    entry.operation === 'video' &&
    entry.provider === 'runway-direct' &&
    entry.model === 'grok_imagine_1_5' &&
    entry.state === 'failed-unknown' &&
    (
      entry.providerRequestId === taskId ||
      (entry.error || '').includes(taskId)
    )
  );

const alreadyNoCharge = latestMatchingNoCharge(ledger, taskId);

if (!matching && !alreadyNoCharge) {
  throw new Error(
    'No encuentro en el ledger el failed-unknown correspondiente a este task. No se modifica contabilidad.'
  );
}

if (!alreadyNoCharge && matching) {
  await appendSpend(project.id, {
    operation: matching.operation,
    provider: matching.provider,
    model: matching.model,
    state: 'failed-no-charge',
    estimatedUsd: matching.estimatedUsd,
    actualUsd: 0,
    sceneId: matching.sceneId,
    shotId: matching.shotId,
    characterId: matching.characterId,
    idempotencyKey: matching.idempotencyKey,
    providerRequestId: taskId,
    error:
      '[runway-internal-refund] Task FAILED con failureCode=INTERNAL y sin output. ' +
      'Runway documenta retry con demora; SAFETY.INPUT es la excepción documentada sin reembolso.'
  });
  console.log('Ledger: failed-unknown -> failed-no-charge');
} else {
  console.log('Ledger: ya estaba reconciliado como failed-no-charge');
}

console.log('');
console.log('RETRY AUTORIZADO: una reanudación controlada de Escena 3.');
console.log('No se regenerará T1 si su checkpoint sigue válido.');
console.log('');

const result = await produceScene3SynchronizedV6(project.id);

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — RESUME COMPLETADO');
console.log('==================================================');
console.log('Runway total lógico de Scene 3: ' + result.runwayCredits + ' créditos');
console.log('Scene video: ' + result.sceneVideo);
console.log('SCENE_REVIEW_REQUIRED=YES');

function latestMatchingNoCharge(
  entries: SpendLedgerEntry[],
  previousTaskId: string
) {
  return [...entries]
    .reverse()
    .find((entry) =>
      entry.operation === 'video' &&
      entry.provider === 'runway-direct' &&
      entry.model === 'grok_imagine_1_5' &&
      entry.state === 'failed-no-charge' &&
      (
        entry.providerRequestId === previousTaskId ||
        (entry.error || '').includes(previousTaskId)
      )
    );
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
