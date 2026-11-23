import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  appendSpend,
  latestSpendForKey
} from '@/lib/engine/spend-ledger';

loadProjectLocalEnvOverride();

const [projectId, confirmation] = process.argv.slice(2);
const EXPECTED = '--reconcile-sofia-audition-local-write-failure';

if (!projectId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene6:reconcile-sofia-audition -- <projectId> ' + EXPECTED
  );
  process.exit(1);
}

if (
  process.env.ALLOW_EXTERNAL_API_CALLS === 'true' ||
  process.env.ALLOW_PAID_GENERATION === 'true'
) {
  throw new Error(
    'La reconciliación exige APIs pagadas bloqueadas.'
  );
}

const key = 'v6safe:e6:sofia-audition:coral-true-child:1';
const latest = await latestSpendForKey(projectId, key);

if (!latest) {
  throw new Error(
    'No existe intento previo de audición Sofía para reconciliar.'
  );
}

if (latest.state === 'reconciled') {
  console.log('SOFIA_AUDITION_RECONCILE=ALREADY_DONE');
  process.exit(0);
}

if (latest.state !== 'failed-unknown') {
  throw new Error(
    'Estado no reconciliable: ' + latest.state
  );
}

const error = latest.error || '';
const exactLocalWriteFailure =
  error.includes('ENOENT') &&
  error.includes('scene-006-sofia-audition-coral-raw.mp3');

if (!exactLocalWriteFailure) {
  throw new Error(
    'El fallo no coincide con el ENOENT local esperado. No se modificó el ledger.'
  );
}

await appendSpend(projectId, {
  operation: latest.operation,
  provider: latest.provider,
  model: latest.model,
  state: 'reconciled',
  estimatedUsd: latest.estimatedUsd,
  actualUsd: latest.estimatedUsd,
  sceneId: latest.sceneId,
  shotId: latest.shotId,
  characterId: latest.characterId,
  idempotencyKey: latest.idempotencyKey,
  providerRequestId: latest.providerRequestId,
  error:
    '[reconciled-provider-response-local-write-failed] ' +
    'OpenAI respondió; el fallo ocurrió al escribir localmente el MP3. ' +
    'Se asume cobro por seguridad. No reutilizar esta idempotencyKey.'
});

console.log('\n==================================================');
console.log(' VIRALCINE 6 — RECONCILIACION AUDICION SOFIA');
console.log('==================================================');
console.log('Estado anterior: failed-unknown');
console.log('Estado nuevo: reconciled');
console.log('Clasificación: proveedor respondió / escritura local falló');
console.log('Cobro asumido por seguridad: US$' + latest.estimatedUsd.toFixed(4));
console.log('Nueva llamada ejecutada: NO');
console.log('Runway: NO');
console.log('OpenAI: NO');
console.log('Fal.ai: NO');
console.log('SOFIA_AUDITION_RECONCILE=PASS');
