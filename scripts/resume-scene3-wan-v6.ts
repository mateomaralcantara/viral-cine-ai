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
  getRunwayTaskDetailsFromEnvironment,
  wan3VideoCredits,
  grokLiteImageToVideoCredits
} from '@/lib/providers/runway-router-v6';
import {
  produceScene3SynchronizedV6
} from '@/lib/engine/scene3-sync-producer-v6';

loadProjectLocalEnvOverride();

const [projectId, failedTaskId, confirmation] = process.argv.slice(2);
const EXPECTED = '--confirm-scene3-wan-usd-1.05';

if (!projectId || !failedTaskId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene3:resume-wan -- <projectId> <failedTaskId> ' + EXPECTED
  );
  process.exit(1);
}

if (
  process.env.ALLOW_EXTERNAL_API_CALLS === 'true' ||
  process.env.ALLOW_PAID_GENERATION === 'true' ||
  process.env.ALLOW_PAID_PROVIDER_FALLBACK === 'true'
) {
  throw new Error(
    'Las APIs legacy deben permanecer bloqueadas. Scene 3 WAN abre únicamente las llamadas autorizadas.'
  );
}

const wanCredits = wan3VideoCredits(8, '1280:720');
const t3Credits = grokLiteImageToVideoCredits(8, 'auto_720p');
const maxNewUsd = (wanCredits + t3Credits) * 0.01;

if (Math.abs(maxNewUsd - 1.05) > 0.0001) {
  throw new Error(
    'El costo interno cambió a US$' +
      maxNewUsd.toFixed(2) +
      '. Se requiere una nueva autorización.'
  );
}

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — GROK INTERNAL -> WAN 3');
console.log('==================================================');
console.log('Task Grok fallido: ' + failedTaskId);
console.log('T1: reutilizar · US$0 nuevo');
console.log('T2: WAN 3.0 720p + imagen + audio reference · US$0.80 máximo');
console.log('T3: Grok Lite 720p · US$0.25 máximo');
console.log('Voz Mariana: debe existir; NO se autoriza nueva voz');
console.log('Máximo NUEVO: US$1.05');
console.log('Fal.ai: NO');
console.log('Fallback automático: NO');
console.log('');

const task = await getRunwayTaskDetailsFromEnvironment(failedTaskId);

console.log('Estado Grok previo: ' + task.status);
console.log('Failure code: ' + (task.failureCode || 'NONE'));
console.log('Failure: ' + (task.failure || 'NONE'));
console.log('Output count: ' + task.output.length);

if (
  task.status !== 'FAILED' ||
  task.failureCode !== 'INTERNAL' ||
  task.output.length !== 0
) {
  throw new Error(
    'No se cumplen las condiciones para reconciliar el segundo Grok: ' +
      'se exige FAILED + INTERNAL + output vacío.'
  );
}

const project = await getProject(projectId);
const scene3 = project.plan?.scenes.find((item) => item.order === 3);
const t1 = scene3?.shots.find((item) => item.order === 1);

if (!scene3 || !t1?.videoAsset || t1.status !== 'ready') {
  throw new Error('E3/T1 no está ready con video reutilizable.');
}

await access(assetAbsolutePath(project.id, t1.videoAsset));

const voicePath = path.join(
  projectAssetDir(project.id, 'audio'),
  'scene-003-shot-02-mariana-cedar.mp3'
);
await access(voicePath);

const wanRaw = path.join(
  projectAssetDir(project.id, 'video'),
  'scene-003-shot-02-wan3-audio-ref-raw.mp4'
);
if (await exists(wanRaw)) {
  throw new Error(
    'Ya existe un raw WAN de E3/T2. No se autoriza una generación duplicada.'
  );
}

const ledger = await readSpendLedger(project.id);
const failed = findFailedUnknown(ledger, failedTaskId);
const noCharge = findNoCharge(ledger, failedTaskId);

if (!failed && !noCharge) {
  throw new Error(
    'No encuentro el task Grok en el ledger. No se tocará contabilidad ni se generará.'
  );
}

if (!noCharge && failed) {
  await appendSpend(project.id, {
    operation: failed.operation,
    provider: failed.provider,
    model: failed.model,
    state: 'failed-no-charge',
    estimatedUsd: failed.estimatedUsd,
    actualUsd: 0,
    sceneId: failed.sceneId,
    shotId: failed.shotId,
    characterId: failed.characterId,
    idempotencyKey: failed.idempotencyKey,
    providerRequestId: failedTaskId,
    error:
      '[runway-internal-reconciled] FAILED + INTERNAL + output vacío. ' +
      'Se abandona Grok 1.5 para E3/T2 y se cambia explícitamente a WAN 3.0.'
  });
  console.log('Ledger: segundo Grok INTERNAL -> failed-no-charge');
} else {
  console.log('Ledger: segundo Grok ya estaba reconciliado como no-charge');
}

console.log('');
console.log('Proveedor nuevo E3/T2: WAN 3.0');
console.log('Audio-reference: SI');
console.log('Imagen de continuidad: último frame de T1');
console.log('T3 arrancará desde el último frame REAL de T2');
console.log('');

const result = await produceScene3SynchronizedV6(
  project.id,
  { dialogueProvider: 'wan3' }
);

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 3 WAN LISTA');
console.log('==================================================');
console.log('Runway lógico escena completa: ' + result.runwayCredits + ' créditos');
console.log('Video: ' + result.sceneVideo);
console.log('SCENE_REVIEW_REQUIRED=YES');
console.log('REVISAR_MANUALMENTE_LIPSYNC_T2=YES');

function findFailedUnknown(
  entries: SpendLedgerEntry[],
  taskId: string
) {
  return [...entries]
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
}

function findNoCharge(
  entries: SpendLedgerEntry[],
  taskId: string
) {
  return [...entries]
    .reverse()
    .find((entry) =>
      entry.operation === 'video' &&
      entry.provider === 'runway-direct' &&
      entry.model === 'grok_imagine_1_5' &&
      entry.state === 'failed-no-charge' &&
      (
        entry.providerRequestId === taskId ||
        (entry.error || '').includes(taskId)
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
