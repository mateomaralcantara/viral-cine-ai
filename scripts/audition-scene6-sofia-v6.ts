import path from 'node:path';
import { access } from 'node:fs/promises';
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
import {
  createYouthfulChildVoicePreserveTiming
} from '@/lib/media/ffmpeg';
import {
  probeMediaDurationSeconds
} from '@/lib/media/segmented-ffmpeg';

loadProjectLocalEnvOverride();

const [projectId, confirmation] = process.argv.slice(2);
const EXPECTED = '--confirm-sofia-audition-usd-0.01';

if (!projectId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene6:audition-sofia -- <projectId> ' + EXPECTED
  );
  process.exit(1);
}

if (
  process.env.ALLOW_EXTERNAL_API_CALLS === 'true' ||
  process.env.ALLOW_PAID_GENERATION === 'true'
) {
  throw new Error(
    'La audición debe comenzar con APIs pagadas bloqueadas.'
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
    'Escena 5 debe estar aprobada/congelada antes de audicionar a Sofía.'
  );
}

const scene6 = project.plan.scenes.find((item) => item.order === 6);
if (!scene6 || scene6.id !== 'scene-15d-short-06') {
  throw new Error('No encuentro Escena 6 short.');
}

const text = 'Mami, ¿ya terminaste?';
const estimate = estimateOperationCost('voice', voiceCostUnits(text));
const maxUsd = 0.01;

if (estimate > maxUsd) {
  throw new Error(
    'SAFE COST GATE: audición Sofía estimada US$' +
      estimate.toFixed(4) +
      ' > US$0.01.'
  );
}

const audioDir = path.join(
  projectAssetDir(project.id, 'audio'),
  'scene6-v6'
);

const raw = path.join(
  audioDir,
  'scene-006-sofia-audition-coral-raw.mp3'
);

const youthful = path.join(
  audioDir,
  'scene-006-sofia-audition-true-child.wav'
);

const spendKey = 'v6safe:e6:sofia-audition:coral-true-child:1';

if (!(await exists(raw))) {
  const previous = await latestSpendForKey(project.id, spendKey);

  if (
    previous &&
    !['reserved', 'failed-no-charge'].includes(previous.state)
  ) {
    throw new Error(
      'SAFE RETRY BLOCK: estado previo=' + previous.state +
      '. No repetir sin reconciliar.'
    );
  }

  await appendSpend(project.id, {
    operation: 'voice',
    provider: 'openai',
    model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
    state: 'submitted',
    estimatedUsd: estimate,
    sceneId: scene6.id,
    shotId: 'scene-15d-short-06-v6-shot-01',
    characterId: 'char-v5-sofia-0004',
    idempotencyKey: spendKey
  });

  try {
    await withPaidGate(() =>
      generateSpeech(
        text,
        [
          'Español latino natural.',
          'Interpretar inequívocamente como una niña latina de 10 años.',
          'Voz femenina infantil, preadolescente, clara, ligera, cálida y espontánea.',
          'Prohibida voz de mujer adulta, locutora, adolescente mayor o registro sensual.',
          'Debe sonar como una niña real hablando naturalmente con su madre.',
          'Curiosa, cercana y sencilla; nada teatral.',
          'Decir exactamente el texto recibido, sin añadir ni cambiar palabras.'
        ].join(' '),
        raw,
        'coral'
      )
    );

    await appendSpend(project.id, {
      operation: 'voice',
      provider: 'openai',
      model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
      state: 'succeeded',
      estimatedUsd: estimate,
      actualUsd: estimate,
      sceneId: scene6.id,
      shotId: 'scene-15d-short-06-v6-shot-01',
      characterId: 'char-v5-sofia-0004',
      idempotencyKey: spendKey,
      outputAsset: assetRelativePath(project.id, raw)
    });
  } catch (error) {
    await appendSpend(project.id, {
      operation: 'voice',
      provider: 'openai',
      model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
      state: 'failed-unknown',
      estimatedUsd: estimate,
      sceneId: scene6.id,
      shotId: 'scene-15d-short-06-v6-shot-01',
      characterId: 'char-v5-sofia-0004',
      idempotencyKey: spendKey,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

const duration = await probeMediaDurationSeconds(raw);

await createYouthfulChildVoicePreserveTiming(
  raw,
  duration,
  youthful,
  1.08
);

await access(youthful);

console.log('\n==================================================');
console.log(' VIRALCINE 6 — AUDICION SOFIA TRUE-CHILD');
console.log('==================================================');
console.log('Texto: Mami, ¿ya terminaste?');
console.log('Base: OpenAI coral');
console.log('Edad objetivo: 10 años');
console.log('Remaster infantil local: 1.08x');
console.log('Runway llamado: NO');
console.log('Fal.ai llamado: NO');
console.log('OpenAI: SOLO 1 VOZ');
console.log('Tope autorizado: US$0.01');
console.log('Estimación: US$' + estimate.toFixed(4));
console.log('AUDITION_FILE=' + youthful);
console.log('SOFIA_AUDITION_REVIEW_REQUIRED=YES');

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
