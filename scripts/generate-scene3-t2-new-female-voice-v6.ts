import { access, copyFile, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  assetAbsolutePath,
  assetRelativePath,
  getProject,
  projectAssetDir,
  saveProject
} from '@/lib/storage/project-store';
import {
  concatenate,
  fitSpeechAudioToExactDuration,
  replaceAudioPreserveVideo
} from '@/lib/media/ffmpeg';
import { probeVideo } from '@/lib/media/probe';
import { generateSpeech } from '@/lib/providers/openai-media';
import {
  appendSpend,
  estimateOperationCost,
  latestSpendForKey,
  voiceCostUnits
} from '@/lib/engine/spend-ledger';
import {
  renderedAssets,
  saveSceneCheckpoint,
  saveShotCheckpoint
} from '@/lib/engine/scene-checkpoints';
import {
  SCENE3_DIALOGUE_V6,
  SCENE3_MARIANA_ID_V6
} from '@/lib/engine/scene3-sync-plan-v6';

loadProjectLocalEnvOverride();

const [projectId, confirmation] = process.argv.slice(2);
const EXPECTED = '--confirm-female-voice-usd-0.01';
const MAX_VOICE_USD = 0.01;

if (!projectId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene3:new-female-voice -- <projectId> ' + EXPECTED
  );
  process.exit(1);
}

if (
  process.env.ALLOW_EXTERNAL_API_CALLS === 'true' ||
  process.env.ALLOW_PAID_GENERATION === 'true' ||
  process.env.ALLOW_PAID_PROVIDER_FALLBACK === 'true'
) {
  throw new Error(
    'Las APIs legacy deben permanecer bloqueadas. Esta ruta abre una única llamada TTS explícitamente autorizada.'
  );
}

let project = await getProject(projectId);
if (!project.plan) throw new Error('El proyecto no tiene plan.');

const scene = project.plan.scenes.find((item) => item.order === 3);
if (!scene) throw new Error('No existe la Escena 3.');

const shot = scene.shots.find((item) => item.order === 2);
if (!shot?.videoAsset) {
  throw new Error('E3/T2 no tiene video final para conservar.');
}

const shotVideo = assetAbsolutePath(project.id, shot.videoAsset);
await access(shotVideo);

const currentProbe = await probeVideo(shotVideo);
if (!currentProbe.hasVideo || !currentProbe.hasAudio) {
  throw new Error('E3/T2 fuente debe contener video+audio.');
}

const originalReference = path.join(
  projectAssetDir(project.id, 'audio'),
  'scene-003-shot-02-mariana-cedar.mp3'
);
await access(originalReference);

const referenceProbe = await probeVideo(originalReference);
if (!referenceProbe.hasAudio || !Number.isFinite(referenceProbe.durationSeconds)) {
  throw new Error('No se pudo medir la referencia temporal original de Mariana.');
}

const targetVoiceSeconds = referenceProbe.durationSeconds;
if (targetVoiceSeconds < 3 || targetVoiceSeconds > 8) {
  throw new Error(
    'Timing original de Mariana fuera de rango: ' +
      targetVoiceSeconds.toFixed(3) +
      's.'
  );
}

const estimate = estimateOperationCost(
  'voice',
  voiceCostUnits(SCENE3_DIALOGUE_V6)
);

if (estimate > MAX_VOICE_USD) {
  throw new Error(
    'SAFE COST GATE: la estimación TTS US$' +
      estimate.toFixed(4) +
      ' supera US$0.01.'
  );
}

const spendKey = 'v6safe:e3:t2:true-female-shimmer:1';
const prior = await latestSpendForKey(project.id, spendKey);
if (
  prior &&
  ['submitted', 'succeeded', 'failed-unknown', 'reconciled'].includes(prior.state)
) {
  throw new Error(
    'SAFE RETRY BLOCK: ya existe estado ' +
      prior.state +
      ' para la nueva voz femenina. No se cobrará otra vez automáticamente.'
  );
}

const audioDir = projectAssetDir(project.id, 'audio');
const videoDir = projectAssetDir(project.id, 'video');
const rejectedDir = path.join(videoDir, 'rejected');

await mkdir(audioDir, { recursive: true });
await mkdir(rejectedDir, { recursive: true });

const rawVoice = path.join(
  audioDir,
  'scene-003-shot-02-mariana-shimmer-female-raw.mp3'
);
const fittedVoice = path.join(
  audioDir,
  'scene-003-shot-02-mariana-shimmer-female.m4a'
);
const partialShot = path.join(
  videoDir,
  'scene-003-shot-02-shimmer-female.partial.mp4'
);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const shotBackup = path.join(
  rejectedDir,
  'scene-003-shot-02-before-shimmer-female-' + stamp + '.mp4'
);
const sceneBackup = path.join(
  rejectedDir,
  'scene-003-before-shimmer-female-' + stamp + '.mp4'
);

await copyFile(shotVideo, shotBackup);

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — NUEVA VOZ FEMENINA REALISTA');
console.log('==================================================');
console.log('Personaje: Mariana');
console.log('Voice: OpenAI shimmer');
console.log('Objetivo: voz inequívocamente femenina de mujer adulta');
console.log('Texto: EXACTO');
console.log('Timing objetivo: ' + targetVoiceSeconds.toFixed(3) + 's');
console.log('Video: SE CONSERVA');
console.log('Labios/movimiento: SE CONSERVAN');
console.log('Nueva generación de video: NO');
console.log('Máximo TTS autorizado: US$0.01');
console.log('');

await appendSpend(project.id, {
  operation: 'voice',
  provider: 'openai',
  model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
  state: 'submitted',
  estimatedUsd: estimate,
  sceneId: scene.id,
  shotId: shot.id,
  characterId: SCENE3_MARIANA_ID_V6,
  idempotencyKey: spendKey
});

const oldExternal = process.env.ALLOW_EXTERNAL_API_CALLS;
const oldPaid = process.env.ALLOW_PAID_GENERATION;

try {
  process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
  process.env.ALLOW_PAID_GENERATION = 'true';

  await generateSpeech(
    SCENE3_DIALOGUE_V6,
    [
      'Español latino natural.',
      'Habla como una MUJER adulta de aproximadamente 45 a 50 años.',
      'La voz debe sonar inequívocamente FEMENINA, humana, natural, cálida y clara.',
      'Registro femenino medio, no grave.',
      'No uses timbre masculino, andrógino, áspero ni de locutor varón.',
      'Mantén autoridad tranquila y empatía.',
      'Di exactamente el texto recibido, sin agregar, quitar, traducir ni parafrasear palabras.',
      'La interpretación debe durar aproximadamente ' +
        targetVoiceSeconds.toFixed(2) +
        ' segundos para conservar la sincronía visual existente.'
    ].join(' '),
    rawVoice,
    'shimmer'
  );

  await appendSpend(project.id, {
    operation: 'voice',
    provider: 'openai',
    model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
    state: 'succeeded',
    estimatedUsd: estimate,
    sceneId: scene.id,
    shotId: shot.id,
    characterId: SCENE3_MARIANA_ID_V6,
    idempotencyKey: spendKey,
    outputAsset: assetRelativePath(project.id, rawVoice)
  });
} catch (error) {
  await appendSpend(project.id, {
    operation: 'voice',
    provider: 'openai',
    model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
    state: 'failed-unknown',
    estimatedUsd: estimate,
    sceneId: scene.id,
    shotId: shot.id,
    characterId: SCENE3_MARIANA_ID_V6,
    idempotencyKey: spendKey,
    error: error instanceof Error ? error.message : String(error)
  });
  throw error;
} finally {
  restoreEnv('ALLOW_EXTERNAL_API_CALLS', oldExternal);
  restoreEnv('ALLOW_PAID_GENERATION', oldPaid);
}

await fitSpeechAudioToExactDuration(
  rawVoice,
  targetVoiceSeconds,
  fittedVoice
);

try {
  await replaceAudioPreserveVideo(
    shotVideo,
    fittedVoice,
    shot.durationSeconds,
    partialShot
  );

  const fixedProbe = await probeVideo(partialShot);
  if (!fixedProbe.hasVideo || !fixedProbe.hasAudio) {
    throw new Error('El clip final con voz femenina no es válido.');
  }

  await rm(shotVideo, { force: true });
  await rename(partialShot, shotVideo);
} finally {
  await rm(partialShot, { force: true });
}

const ordered = [...scene.shots].sort((a, b) => a.order - b.order);
const sceneVideo = scene.videoAsset
  ? assetAbsolutePath(project.id, scene.videoAsset)
  : path.join(videoDir, 'scene-003.mp4');

if (await exists(sceneVideo)) {
  await copyFile(sceneVideo, sceneBackup);
}

const clips = ordered.map((item) => {
  if (!item.videoAsset) throw new Error('Escena 3 contiene una toma sin videoAsset.');
  return assetAbsolutePath(project.id, item.videoAsset);
});

const partialScene = path.join(
  videoDir,
  'scene-003-shimmer-female.partial.mp4'
);

try {
  await concatenate(clips, partialScene);
  const sceneProbe = await probeVideo(partialScene);
  if (
    !sceneProbe.hasVideo ||
    !sceneProbe.hasAudio ||
    Math.abs(sceneProbe.durationSeconds - 24) > 0.5
  ) {
    throw new Error('Escena 3 recompuesta no quedó en ~24 segundos.');
  }

  await rm(sceneVideo, { force: true });
  await rename(partialScene, sceneVideo);
} finally {
  await rm(partialScene, { force: true });
}

shot.voiceAsset = assetRelativePath(project.id, fittedVoice);
shot.lastProvider = 'OpenAI shimmer / female voice replacement';
shot.pipelineVersion = '6.0-shimmer-female-voice-only';
shot.status = 'review-required';
shot.error =
  'Nueva voz femenina Shimmer generada y ajustada al timing original. Video/labios/movimiento no fueron regenerados.';
shot.qualityScore = undefined;
shot.qualityAttempts = undefined;
shot.qualityIssues = undefined;
shot.qualityReportAsset = undefined;
shot.qualityOverrideApproved = false;
shot.qualityForceRegenerate = false;

scene.videoAsset = assetRelativePath(project.id, sceneVideo);
scene.voiceAsset = shot.voiceAsset;
scene.status = 'review-required';
scene.error =
  'E3/T2 usa nueva voz femenina Shimmer. Revisar timbre femenino y sincronía labial.';

project.status = 'quality-review';
project.error = undefined;
project.progress = {
  phase: 'quality-review',
  percent: 45,
  message:
    'E3/T2 actualizada con nueva voz femenina Shimmer; revisar voz y sincronía.',
  currentScene: 3,
  totalScenes: project.plan.scenes.length,
  updatedAt: new Date().toISOString()
};

project.productionLog.push(
  new Date().toISOString() +
    ' ViralCine 6 Safe: E3/T2 recibió NUEVA voz OpenAI shimmer con instrucciones inequívocamente femeninas. ' +
    'Audio ajustado al timing original de ' +
    targetVoiceSeconds.toFixed(3) +
    's; video conservado sin regeneración.'
);

const shotAssets = renderedAssets(
  project.id,
  shot.mode,
  assetAbsolutePath(project.id, shot.imageAsset!),
  fittedVoice,
  shotVideo
);
await saveShotCheckpoint(project, scene, shot, shotAssets);

const sceneAssets = renderedAssets(
  project.id,
  scene.mode,
  assetAbsolutePath(project.id, scene.imageAsset!),
  fittedVoice,
  sceneVideo
);
await saveSceneCheckpoint(project, scene, sceneAssets);

project = await saveProject(project);

console.log('==================================================');
console.log(' E3/T2 — NUEVA VOZ FEMENINA APLICADA');
console.log('==================================================');
console.log('VOICE=shimmer');
console.log('FEMALE_INSTRUCTIONS=STRICT');
console.log('TIMING_TARGET=' + targetVoiceSeconds.toFixed(3) + 's');
console.log('VIDEO_REGENERADO=NO');
console.log('LABIOS_REGENERADOS=NO');
console.log('MOVIMIENTO_REGENERADO=NO');
console.log('MAX_TTS_AUTH=US$0.01');
console.log('SCENE_VIDEO=' + sceneVideo);
console.log('SHOT_BACKUP=' + shotBackup);
console.log('SCENE_BACKUP=' + sceneBackup);
console.log('ESTADO=' + project.status);
console.log('REVISION_HUMANA=SI');

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
