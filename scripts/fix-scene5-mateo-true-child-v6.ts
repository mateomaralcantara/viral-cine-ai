import path from 'node:path';
import { access } from 'node:fs/promises';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  assetAbsolutePath,
  assetRelativePath,
  getProject,
  projectAssetDir,
  saveProject
} from '@/lib/storage/project-store';
import {
  appendSpend,
  estimateOperationCost,
  latestSpendForKey,
  voiceCostUnits
} from '@/lib/engine/spend-ledger';
import { generateSpeech } from '@/lib/providers/openai-media';
import {
  concatenate,
  createYouthfulChildVoicePreserveTiming,
  replaceAudioPreserveVideo
} from '@/lib/media/ffmpeg';
import {
  fitAudioToSlot,
  probeMediaDurationSeconds
} from '@/lib/media/segmented-ffmpeg';
import { assertCinematicSceneVideo } from '@/lib/media/probe';

loadProjectLocalEnvOverride();

const [projectId, confirmation] = process.argv.slice(2);
const EXPECTED = '--confirm-mateo-true-child-usd-0.01';

if (!projectId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene5:mateo-true-child -- <projectId> ' + EXPECTED
  );
  process.exit(1);
}

if (
  process.env.ALLOW_EXTERNAL_API_CALLS === 'true' ||
  process.env.ALLOW_PAID_GENERATION === 'true'
) {
  throw new Error('Este flujo debe comenzar con APIs pagadas bloqueadas.');
}

const project = await getProject(projectId);

if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
  throw new Error('Solo autorizado para 15 DÍAS.');
}
if (!project.plan || project.plan.scenes.length !== 6) {
  throw new Error('Se esperaba 15 DÍAS short de 6 escenas.');
}

const scene5 = project.plan.scenes.find((item) => item.order === 5);
if (!scene5) throw new Error('No encuentro Escena 5.');

const videoDir = path.join(projectAssetDir(project.id, 'video'), 'scene5-v6');
const audioDir = path.join(projectAssetDir(project.id, 'audio'), 'scene5-v6');

const targets = [
  {
    order: 3,
    text: '¿Esta es nuestra casa?',
    sourceVideo: path.join(videoDir, 'scene-005-shot-03-wan3-final.mp4'),
    rawVoice: path.join(audioDir, 'scene-005-shot-03-mateo-child2-raw.mp3'),
    fitVoice: path.join(audioDir, 'scene-005-shot-03-mateo-child2-fit.wav'),
    childVoice: path.join(audioDir, 'scene-005-shot-03-mateo-true-child.wav'),
    outputVideo: path.join(videoDir, 'scene-005-shot-03-true-child-final.mp4')
  },
  {
    order: 5,
    text: '¿De verdad?',
    sourceVideo: path.join(videoDir, 'scene-005-shot-05-wan3-final.mp4'),
    rawVoice: path.join(audioDir, 'scene-005-shot-05-mateo-child2-raw.mp3'),
    fitVoice: path.join(audioDir, 'scene-005-shot-05-mateo-child2-fit.wav'),
    childVoice: path.join(audioDir, 'scene-005-shot-05-mateo-true-child.wav'),
    outputVideo: path.join(videoDir, 'scene-005-shot-05-true-child-final.mp4')
  }
];

const maxUsd = 0.01;
const totalEstimate = targets.reduce(
  (sum, item) => sum + estimateOperationCost('voice', voiceCostUnits(item.text)),
  0
);

if (totalEstimate > maxUsd) {
  throw new Error(
    'SAFE COST GATE: voces Mateo estimadas US$' +
      totalEstimate.toFixed(4) +
      ' > US$0.01.'
  );
}

for (const target of targets) {
  await mustExist(target.sourceVideo, 'video WAN T' + target.order);

  const estimate = estimateOperationCost('voice', voiceCostUnits(target.text));
  const spendKey = 'v6safe:e5:t' + target.order + ':mateo-true-child:alloy:1';

  if (!(await exists(target.rawVoice))) {
    const previous = await latestSpendForKey(project.id, spendKey);
    if (
      previous &&
      !['reserved', 'failed-no-charge'].includes(previous.state)
    ) {
      throw new Error(
        'SAFE RETRY BLOCK T' +
          target.order +
          ': estado previo=' +
          previous.state
      );
    }

    await appendSpend(project.id, {
      operation: 'voice',
      provider: 'openai',
      model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
      state: 'submitted',
      estimatedUsd: estimate,
      sceneId: scene5.id,
      shotId: scene5.shots.find((s) => s.order === target.order)?.id,
      characterId: 'char-v5-mateo-0005',
      idempotencyKey: spendKey
    });

    try {
      await withPaidGate(() =>
        generateSpeech(
          target.text,
          [
            'Español latino natural.',
            'Interpretar inequívocamente como un niño prepubescente latino de 7 años.',
            'Timbre pequeño, ligero, juvenil y claramente infantil.',
            'Sin resonancia de pecho adulta, sin graves masculinos adultos y sin voz de adolescente.',
            'Debe sonar como un niño real hablando espontáneamente con su madre.',
            'Masculino infantil, no femenino.',
            'Curioso, emocionado, inocente y natural; nada teatral.',
            'Dicción simple de niño, respiración ligera y tono medio-alto natural.',
            'Decir exactamente el texto recibido, sin añadir ni cambiar palabras.'
          ].join(' '),
          target.rawVoice,
          'alloy'
        )
      );

      await appendSpend(project.id, {
        operation: 'voice',
        provider: 'openai',
        model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
        state: 'succeeded',
        estimatedUsd: estimate,
        actualUsd: estimate,
        sceneId: scene5.id,
        shotId: scene5.shots.find((s) => s.order === target.order)?.id,
        characterId: 'char-v5-mateo-0005',
        idempotencyKey: spendKey,
        outputAsset: assetRelativePath(project.id, target.rawVoice)
      });
    } catch (error) {
      await appendSpend(project.id, {
        operation: 'voice',
        provider: 'openai',
        model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
        state: 'failed-unknown',
        estimatedUsd: estimate,
        sceneId: scene5.id,
        shotId: scene5.shots.find((s) => s.order === target.order)?.id,
        characterId: 'char-v5-mateo-0005',
        idempotencyKey: spendKey,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  const duration = await probeMediaDurationSeconds(target.rawVoice);
  const speedFactor = Math.max(1, duration / 4);

  if (speedFactor > 1.2) {
    throw new Error(
      'Mateo T' + target.order +
      ' necesita ' + speedFactor.toFixed(3) +
      'x para caber; no se forzará.'
    );
  }

  await fitAudioToSlot(target.rawVoice, speedFactor, 4, target.fitVoice);

  await createYouthfulChildVoicePreserveTiming(
    target.fitVoice,
    4,
    target.childVoice,
    1.14
  );

  await replaceAudioPreserveVideo(
    target.sourceVideo,
    target.childVoice,
    4,
    target.outputVideo
  );

  await assertCinematicSceneVideo(
    target.outputVideo,
    4,
    { requireMotion: true, requireAudibleAudio: true }
  );

  const shot = scene5.shots.find((item) => item.order === target.order);
  if (!shot) throw new Error('No encuentro E5/T' + target.order);

  shot.videoAsset = assetRelativePath(project.id, target.outputVideo);
  shot.voiceAsset = assetRelativePath(project.id, target.childVoice);
  shot.status = 'ready';
  shot.error = undefined;
  shot.lastProvider = 'OpenAI alloy + local youthful remaster';
  shot.pipelineVersion = '6.0-scene5-mateo-true-child';
}

const ordered = [...scene5.shots].sort((a, b) => a.order - b.order);
const clips = ordered.map((shot) => {
  if (!shot.videoAsset) {
    throw new Error('E5/T' + shot.order + ' no tiene video.');
  }
  return assetAbsolutePath(project.id, shot.videoAsset);
});

for (const clip of clips) {
  await mustExist(clip, 'clip Escena 5');
}

const finalPath = path.join(
  projectAssetDir(project.id, 'video'),
  'scene-005-wan3-reunion-v6-mateo-true-child.mp4'
);

await concatenate(clips, finalPath);

await assertCinematicSceneVideo(
  finalPath,
  30,
  { requireMotion: true, requireAudibleAudio: true }
);

scene5.videoAsset = assetRelativePath(project.id, finalPath);
scene5.status = 'review-required';
scene5.error =
  'Mateo recasteado con OpenAI alloy + remaster infantil local en T3/T5. Revisión humana requerida.';

project.productionLog.push(
  new Date().toISOString() +
    ' ViralCine 6 Safe: Mateo E5 recasteado a alloy con instrucciones prepubescentes y remaster infantil local 1.14x; T3/T5 video WAN preservado.'
);

await saveProject(project);

console.log('\n==================================================');
console.log(' VIRALCINE 6 — MATEO TRUE CHILD');
console.log('==================================================');
console.log('Base: OpenAI alloy');
console.log('Edad objetivo: 7 años / prepubescente');
console.log('Remaster local: pitch/formant ligero 1.14x');
console.log('T3 video WAN: PRESERVADO');
console.log('T5 video WAN: PRESERVADO');
console.log('Runway llamado: NO');
console.log('Fal.ai llamado: NO');
console.log('OpenAI: SOLO VOZ');
console.log('Tope autorizado: US$0.01');
console.log('Estimación voz: US$' + totalEstimate.toFixed(4));
console.log('SCENE_VIDEO=' + finalPath);
console.log('MATEO_TRUE_CHILD_REVIEW_REQUIRED=YES');

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

async function mustExist(filePath: string, label: string) {
  if (!(await exists(filePath))) {
    throw new Error('Falta ' + label + ': ' + filePath);
  }
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
