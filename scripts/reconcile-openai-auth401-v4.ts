import { appendSpend, readSpendLedger } from '@/lib/engine/spend-ledger';

const [projectId, shotId, confirm] = process.argv.slice(2);

if (!projectId || !shotId || confirm !== '--confirm-auth401') {
  console.log('Uso: npm run openai:reconcile-auth401 -- <projectId> <shotId> --confirm-auth401');
  process.exit(1);
}

const entries = await readSpendLedger(projectId);
const candidates = entries.filter((entry) =>
  entry.operation === 'image' &&
  entry.provider === 'openai' &&
  entry.idempotencyKey === 'image:' + shotId
);

const latest = candidates.at(-1);
if (!latest) throw new Error('No existe un intento OpenAI image para esa toma.');

if (latest.state === 'failed-no-charge') {
  console.log('OPENAI_AUTH401_RECONCILED=ALREADY_OK');
  console.log('Estado actual: failed-no-charge');
  console.log('Este comando no llamó OpenAI ni otra API.');
  process.exit(0);
}

if (latest.state !== 'failed-unknown') {
  throw new Error('El último estado no es failed-unknown; estado actual: ' + latest.state);
}

const errorText = latest.error || '';
if (!/401/i.test(errorText) && !/invalid[_ ]api[_ ]key/i.test(errorText) && !/incorrect api key/i.test(errorText)) {
  throw new Error('El fallo no corresponde inequívocamente a una autenticación OpenAI 401.');
}

if (latest.outputAsset) {
  throw new Error('El intento ya tiene outputAsset; no se reconciliará automáticamente.');
}

await appendSpend(projectId, {
  operation: 'image',
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
    'Reconciliado localmente: OpenAI respondió HTTP 401/invalid_api_key antes de una generación aceptada.'
});

console.log('OPENAI_AUTH401_RECONCILED=PASS');
console.log('Estado nuevo: failed-no-charge');
console.log('Este comando no llamó OpenAI ni otra API.');
