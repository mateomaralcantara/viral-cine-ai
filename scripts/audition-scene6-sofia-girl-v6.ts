import path from 'node:path';
import { access, mkdir } from 'node:fs/promises';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  assetRelativePath,
  getProject,
  projectAssetDir
} from '@/lib/storage/project-store';
import {
  appendSpend,
  estimateOperationCost,
  latestSpendForKey,
  voiceCostUnits
} from '@/lib/engine/spend-ledger';
import { generateSpeech } from '@/lib/providers/openai-media';

loadProjectLocalEnvOverride();

const [projectId, confirmation] = process.argv.slice(2);
const EXPECTED = '--confirm-sofia-girl-auditions-usd-0.01';

if (!projectId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene6:audition-sofia-girl -- <projectId> ' + EXPECTED
  );
  process.exit(1);
}

if (
  process.env.ALLOW_EXTERNAL_API_CALLS === 'true' ||
  process.env.ALLOW_PAID_GENERATION === 'true'
) {
  throw new Error(
    'Las audiciones deben comenzar con APIs pagadas bloqueadas.'
  );
}

const project = await getProject(projectId);

if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
  throw new Error('Solo autorizado para 15 DÍAS.');
}

if (!project.plan || project.plan.scenes.length !== 6) {
  throw new Error('Se esperaba 15 DÍAS short de 6 escenas.');
}

const scene5 = project.plan.scenes.find((item) => item.order === 5);
if (
  !scene5 ||
  scene5.status !== 'ready' ||
  !scene5.qualityOverrideApproved ||
  !scene5.videoAsset?.endsWith(
    'scene-005-wan3-reunion-v6-mateo-true-child.mp4'
  )
) {
  throw new Error(
    'Escena 5 debe seguir aprobada/congelada antes de audicionar a Sofía.'
  );
}

const scene6 = project.plan.scenes.find((item) => item.order === 6);
if (!scene6 || scene6.id !== 'scene-15d-short-06') {
  throw new Error('No encuentro Escena 6 short.');
}

const text = 'Mami, ¿ya terminaste?';
const voices = ['coral', 'nova', 'shimmer'] as const;
const perVoiceEstimate = estimateOperationCost(
  'voice',
  voiceCostUnits(text)
);
const totalEstimate = perVoiceEstimate * voices.length;
const maxUsd = 0.01;

if (totalEstimate > maxUsd) {
  throw new Error(
    'SAFE COST GATE: audiciones Sofía estimadas US$' +
      totalEstimate.toFixed(4) +
      ' > US$0.01.'
  );
}

const audioDir = path.join(
  projectAssetDir(project.id, 'audio'),
  'scene6-v6',
  'sofia-girl-auditions'
);

await mkdir(audioDir, { recursive: true });

const instructions = [
  'Español latino natural.',
  'Interpretar inequívocamente como una niña latina REAL de 10 años.',
  'Debe sonar infantil y femenina desde el primer fonema, no como mujer adulta imitando una niña.',
  'Timbre pequeño, ligero, brillante y juvenil; resonancia corta y natural de niña preadolescente.',
  'Prohibido registro de mujer adulta, locutora, voz madura, sensual, grave o impostada.',
  'Curiosa, cercana, inocente y espontánea; habla con su mamá en casa.',
  'Ritmo conversacional sencillo, sin actuación teatral ni tono publicitario.',
  'Decir exactamente: "Mami, ¿ya terminaste?"',
  'No añadir, quitar, traducir ni parafrasear ninguna palabra.'
].join(' ');

for (const voice of voices) {
  const output = path.join(
    audioDir,
    'scene-006-sofia-girl-' + voice + '.mp3'
  );
  const key =
    'v6safe:e6:sofia-girl-audition:' + voice + ':1';

  if (await exists(output)) {
    console.log(
      'REUSE ' + voice + ': ' + output
    );
    continue;
  }

  const previous = await latestSpendForKey(project.id, key);
  if (
    previous &&
    !['reserved', 'failed-no-charge'].includes(previous.state)
  ) {
    throw new Error(
      'SAFE RETRY BLOCK ' + voice +
      ': estado previo=' + previous.state
    );
  }

  await appendSpend(project.id, {
    operation: 'voice',
    provider: 'openai',
    model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
    state: 'submitted',
    estimatedUsd: perVoiceEstimate,
    sceneId: scene6.id,
    shotId: 'scene-15d-short-06-v6-shot-01',
    characterId: 'char-v5-sofia-0004',
    idempotencyKey: key
  });

  try {
    await withPaidGate(() =>
      generateSpeech(
        text,
        instructions,
        output,
        voice
      )
    );

    await access(output);

    await appendSpend(project.id, {
      operation: 'voice',
      provider: 'openai',
      model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
      state: 'succeeded',
      estimatedUsd: perVoiceEstimate,
      actualUsd: perVoiceEstimate,
      sceneId: scene6.id,
      shotId: 'scene-15d-short-06-v6-shot-01',
      characterId: 'char-v5-sofia-0004',
      idempotencyKey: key,
      outputAsset: assetRelativePath(project.id, output)
    });
  } catch (error) {
    await appendSpend(project.id, {
      operation: 'voice',
      provider: 'openai',
      model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
      state: 'failed-unknown',
      estimatedUsd: perVoiceEstimate,
      sceneId: scene6.id,
      shotId: 'scene-15d-short-06-v6-shot-01',
      characterId: 'char-v5-sofia-0004',
      idempotencyKey: key,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

console.log('\n==================================================');
console.log(' VIRALCINE 6 — SOFIA GIRL AUDITIONS');
console.log('==================================================');
console.log('Texto: Mami, ¿ya terminaste?');
console.log('Edad objetivo: 10 años');
console.log('Procesamiento posterior: NO');
console.log('Pitch shift: NO');
console.log('Runway: NO');
console.log('Fal.ai: NO');
console.log('OpenAI: 3 audiciones máximas');
console.log('Voces base: coral, nova, shimmer');
console.log('Tope autorizado: US$0.01');
console.log('Estimación total: US$' + totalEstimate.toFixed(4));
console.log('AUDITION_DIR=' + audioDir);
console.log('SOFIA_GIRL_AUDITIONS_REVIEW_REQUIRED=YES');

async function withPaidGate<T>(run: () => Promise<T>) {
  const oldExternal = process.env.ALLOW_EXTERNAL_API_CALLS;
  const oldPaid = process.env.ALLOW_PAID_GENERATION;

  process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
  process.env.ALLOW_PAID_GENERATION = 'true';

  try {
    return await run();
  } finally {
    restoreEnv('ALLOW_EXTERNAL_API_CALLS', oldExternal);
    restoreEnv('ALLOW_PAID_GENERATION', oldPaid);
  }
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
