import path from 'node:path';
import { access } from 'node:fs/promises';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  assetRelativePath,
  getProject,
  projectAssetDir
} from '@/lib/storage/project-store';
import { generateSpeech } from '@/lib/providers/openai-media';
import {
  appendSpend,
  estimateOperationCost,
  latestSpendForKey,
  voiceCostUnits
} from '@/lib/engine/spend-ledger';
import {
  applyFifteenDaysCoreVoiceLocksV5
} from '@/lib/engine/fifteen-days-voice-lock-v5';

loadProjectLocalEnvOverride();

const [projectId, confirmation] = process.argv.slice(2);
const EXPECTED = '--confirm-mateo-audition-usd-0.01';

if (!projectId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene5:audition-mateo -- <projectId> ' + EXPECTED
  );
  process.exit(1);
}

delete process.env.FAL_KEY;
process.env.ENABLE_LIPSYNC = 'false';
process.env.ALLOW_PAID_PROVIDER_FALLBACK = 'false';

const project = await getProject(projectId);

if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
  throw new Error('Este comando solo está autorizado para 15 DÍAS.');
}

if (!project.plan || project.plan.scenes.length !== 6) {
  throw new Error('Se esperaba 15 DÍAS short de 6 escenas.');
}

const scene4 = project.plan.scenes.find((item) => item.order === 4);
const scene5 = project.plan.scenes.find((item) => item.order === 5);

if (!scene4 || scene4.status !== 'ready') {
  throw new Error('La Escena 4 debe estar aprobada/ready.');
}
if (!scene5 || scene5.id !== 'scene-15d-short-05') {
  throw new Error('No encuentro Escena 5 short.');
}

applyFifteenDaysCoreVoiceLocksV5(project);

const mateo = project.plan.characters.find(
  (item) => item.id === 'char-v5-mateo-0005'
);
if (!mateo) throw new Error('No encuentro a Mateo.');

if (mateo.voiceProvider !== 'openai' || mateo.voiceId !== 'ash') {
  throw new Error(
    'Voice Lock inesperado para Mateo. Se esperaba OpenAI ash.'
  );
}

const text = '¿Esta es nuestra casa? ¿De verdad?';
const estimate = estimateOperationCost(
  'voice',
  voiceCostUnits(text)
);

if (estimate > 0.01) {
  throw new Error(
    'SAFE COST GATE: la audición estimada cuesta US$' +
      estimate.toFixed(4) +
      ', supera US$0.01.'
  );
}

const outputPath = path.join(
  projectAssetDir(project.id, 'audio'),
  'scene-005-mateo-audition-ash.mp3'
);

if (await exists(outputPath)) {
  console.log('\n==================================================');
  console.log(' MATEO — AUDICION YA EXISTE');
  console.log('==================================================');
  console.log('Archivo: ' + outputPath);
  console.log('Voz: OpenAI ash');
  console.log('Gasto nuevo: US$0');
  console.log('Fal.ai: NO');
  console.log('Runway: NO');
  console.log('MATEO_AUDITION_IDEMPOTENT=PASS');
  process.exit(0);
}

const spendKey = 'v6safe:e5:mateo-audition:ash:1';
const previous = await latestSpendForKey(project.id, spendKey);

if (
  previous &&
  ['submitted', 'succeeded', 'failed-unknown', 'reconciled'].includes(
    previous.state
  )
) {
  throw new Error(
    'SAFE RETRY BLOCK: la audición de Mateo ya tiene estado ' +
      previous.state +
      '. No se reintentará automáticamente.'
  );
}

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — AUDICION MATEO');
console.log('==================================================');
console.log('Texto: ' + text);
console.log('Voz: OpenAI ash');
console.log('Interpretación: niño latino de 7 años');
console.log('Runway: NO');
console.log('Fal.ai: NO');
console.log('Video: NO');
console.log('Costo máximo autorizado: US$0.01');
console.log('Estimación interna: US$' + estimate.toFixed(4));
console.log('');

await appendSpend(project.id, {
  operation: 'voice',
  provider: 'openai',
  model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
  state: 'submitted',
  estimatedUsd: estimate,
  sceneId: scene5.id,
  characterId: mateo.id,
  idempotencyKey: spendKey
});

const oldExternal = process.env.ALLOW_EXTERNAL_API_CALLS;
const oldPaid = process.env.ALLOW_PAID_GENERATION;

try {
  process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
  process.env.ALLOW_PAID_GENERATION = 'true';

  await generateSpeech(
    text,
    [
      'Español latino natural.',
      'Interpretar como niño latino de 7 años.',
      'Voz infantil masculina ligera, espontánea, curiosa y cálida.',
      'Sin impostación adulta y sin tono grave.',
      'Las dos preguntas deben sonar genuinas y emocionadas, nunca teatrales.',
      'Decir exactamente el texto recibido.',
      'No traducir, no parafrasear, no agregar ni omitir palabras.'
    ].join(' '),
    outputPath,
    'ash'
  );

  await appendSpend(project.id, {
    operation: 'voice',
    provider: 'openai',
    model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
    state: 'succeeded',
    estimatedUsd: estimate,
    sceneId: scene5.id,
    characterId: mateo.id,
    idempotencyKey: spendKey,
    outputAsset: assetRelativePath(project.id, outputPath)
  });
} catch (error) {
  await appendSpend(project.id, {
    operation: 'voice',
    provider: 'openai',
    model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
    state: 'failed-unknown',
    estimatedUsd: estimate,
    sceneId: scene5.id,
    characterId: mateo.id,
    idempotencyKey: spendKey,
    error: error instanceof Error ? error.message : String(error)
  });
  throw error;
} finally {
  restoreEnv('ALLOW_EXTERNAL_API_CALLS', oldExternal);
  restoreEnv('ALLOW_PAID_GENERATION', oldPaid);
}

console.log('\n==================================================');
console.log(' AUDICION MATEO LISTA');
console.log('==================================================');
console.log('Archivo: ' + outputPath);
console.log('Voz: OpenAI ash');
console.log('Runway usado: NO');
console.log('Fal.ai usado: NO');
console.log('MATEO_AUDITION_REVIEW_REQUIRED=YES');

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
