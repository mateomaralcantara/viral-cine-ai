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
  replaceAudioPreserveVideo
} from '@/lib/media/ffmpeg';
import { probeVideo } from '@/lib/media/probe';
import {
  appendSpend
} from '@/lib/engine/spend-ledger';
import {
  renderedAssets,
  saveSceneCheckpoint,
  saveShotCheckpoint
} from '@/lib/engine/scene-checkpoints';

loadProjectLocalEnvOverride();

const [projectId] = process.argv.slice(2);

if (!projectId) {
  console.error(
    'Uso: npm run safe:scene3:restore-female-reference-voice -- <projectId>'
  );
  process.exit(1);
}

if (
  process.env.ALLOW_EXTERNAL_API_CALLS === 'true' ||
  process.env.ALLOW_PAID_GENERATION === 'true' ||
  process.env.ALLOW_PAID_PROVIDER_FALLBACK === 'true'
) {
  throw new Error(
    'Las APIs legacy deben permanecer bloqueadas. Esta corrección es 100% local.'
  );
}

const project = await getProject(projectId);
if (!project.plan) throw new Error('El proyecto no tiene plan.');

const scene = project.plan.scenes.find((item) => item.order === 3);
if (!scene) throw new Error('No existe la Escena 3.');

const shot = scene.shots.find((item) => item.order === 2);
if (!shot) throw new Error('No existe E3/T2.');

if (!shot.videoAsset) {
  throw new Error('E3/T2 no tiene video final para conservar.');
}

const shotVideo = assetAbsolutePath(project.id, shot.videoAsset);
await access(shotVideo);

const femaleReferenceVoice = path.join(
  projectAssetDir(project.id, 'audio'),
  'scene-003-shot-02-mariana-cedar.mp3'
);

await access(femaleReferenceVoice);

const videoProbe = await probeVideo(shotVideo);
const voiceProbe = await probeVideo(femaleReferenceVoice);

if (!videoProbe.hasVideo || !videoProbe.hasAudio) {
  throw new Error('El clip E3/T2 no contiene video+audio utilizables.');
}

if (!voiceProbe.hasAudio) {
  throw new Error(
    'La voz de referencia original de Mariana no contiene audio.'
  );
}

if (
  voiceProbe.durationSeconds < 3 ||
  voiceProbe.durationSeconds > shot.durationSeconds + 0.25
) {
  throw new Error(
    'La voz femenina de referencia tiene duración inesperada: ' +
      voiceProbe.durationSeconds.toFixed(3) +
      's. No se modifica el clip.'
  );
}

const videoDir = projectAssetDir(project.id, 'video');
const rejectedDir = path.join(videoDir, 'rejected');
await mkdir(rejectedDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const shotBackup = path.join(
  rejectedDir,
  'scene-003-shot-02-before-true-female-reference-' + stamp + '.mp4'
);
const sceneBackup = path.join(
  rejectedDir,
  'scene-003-before-true-female-reference-' + stamp + '.mp4'
);

await copyFile(shotVideo, shotBackup);

const partialShot = path.join(
  videoDir,
  'scene-003-shot-02-true-female-reference.partial.mp4'
);

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — RESTAURAR VOZ FEMENINA REAL TTS');
console.log('==================================================');
console.log('Fuente de voz: scene-003-shot-02-mariana-cedar.mp3');
console.log('Esta es la voz femenina ORIGINAL usada como referencia de audio para T2.');
console.log('Pitch-shift masculino: NO');
console.log('Regenerar voz: NO');
console.log('Regenerar video: NO');
console.log('Modificar labios: NO');
console.log('Modificar movimiento: NO');
console.log('API externa: NO');
console.log('Gasto nuevo: US$0');
console.log('Duración voz referencia: ' + voiceProbe.durationSeconds.toFixed(3) + 's');
console.log('');

try {
  await replaceAudioPreserveVideo(
    shotVideo,
    femaleReferenceVoice,
    shot.durationSeconds,
    partialShot
  );

  const fixedProbe = await probeVideo(partialShot);
  if (!fixedProbe.hasVideo || !fixedProbe.hasAudio) {
    throw new Error(
      'El remux con la voz femenina produjo un clip inválido.'
    );
  }

  await rm(shotVideo, { force: true });
  await rename(partialShot, shotVideo);
} finally {
  await rm(partialShot, { force: true });
}

const ordered = [...scene.shots].sort((a, b) => a.order - b.order);
if (ordered.length !== 3 || ordered.some((item) => !item.videoAsset)) {
  throw new Error('Escena 3 debe conservar T1, T2 y T3.');
}

const sceneVideo = scene.videoAsset
  ? assetAbsolutePath(project.id, scene.videoAsset)
  : path.join(videoDir, 'scene-003.mp4');

if (await exists(sceneVideo)) {
  await copyFile(sceneVideo, sceneBackup);
}

const clips = ordered.map((item) =>
  assetAbsolutePath(project.id, item.videoAsset!)
);

const partialScene = path.join(
  videoDir,
  'scene-003-true-female-reference.partial.mp4'
);

try {
  await concatenate(clips, partialScene);

  const sceneProbe = await probeVideo(partialScene);
  if (
    !sceneProbe.hasVideo ||
    !sceneProbe.hasAudio ||
    Math.abs(sceneProbe.durationSeconds - 24) > 0.5
  ) {
    throw new Error(
      'La recomposición de Escena 3 no quedó en ~24s.'
    );
  }

  await rm(sceneVideo, { force: true });
  await rename(partialScene, sceneVideo);
} finally {
  await rm(partialScene, { force: true });
}

shot.voiceAsset = assetRelativePath(project.id, femaleReferenceVoice);
shot.lastProvider = 'openai-female-reference-remux-local';
shot.pipelineVersion = '6.0-female-reference-voice-remux';
shot.status = 'review-required';
shot.error =
  'Corrección LOCAL: se sustituyó la voz masculina embebida por la voz femenina ORIGINAL de Mariana usada como referenceAudio. Video/labios/movimiento no fueron regenerados.';
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
  'E3/T2 usa ahora la voz femenina original de Mariana; revisión humana de voz/labios requerida.';

project.status = 'quality-review';
project.error = undefined;
project.progress = {
  phase: 'quality-review',
  percent: 45,
  message:
    'E3/T2: voz femenina original de Mariana restaurada sobre el mismo video. Revisar timbre y sincronía.',
  currentScene: 3,
  totalScenes: project.plan.scenes.length,
  updatedAt: new Date().toISOString()
};

project.productionLog.push(
  new Date().toISOString() +
    ' ViralCine 6 Safe: E3/T2 voice-only LOCAL. ' +
    'Se descartó el pitch-shift del audio masculino y se restauró la voz femenina ORIGINAL scene-003-shot-02-mariana-cedar.mp3, que fue la referenceAudio de la generación. ' +
    'Video conservado con -c:v copy. APIs externas: NO. Gasto adicional: US$0.'
);

await appendSpend(project.id, {
  operation: 'voice',
  provider: 'local-remux',
  model: 'restore-original-female-reference-voice',
  state: 'reconciled',
  estimatedUsd: 0,
  actualUsd: 0,
  sceneId: scene.id,
  shotId: shot.id,
  characterId: shot.speakerId,
  idempotencyKey: 'v6safe:e3:t2:restore-female-reference:1',
  outputAsset: assetRelativePath(project.id, femaleReferenceVoice)
});

const shotAssets = renderedAssets(
  project.id,
  shot.mode,
  assetAbsolutePath(project.id, shot.imageAsset!),
  femaleReferenceVoice,
  shotVideo
);
await saveShotCheckpoint(project, scene, shot, shotAssets);

const sceneAssets = renderedAssets(
  project.id,
  scene.mode,
  assetAbsolutePath(project.id, scene.imageAsset!),
  femaleReferenceVoice,
  sceneVideo
);
await saveSceneCheckpoint(project, scene, sceneAssets);

const saved = await saveProject(project);

console.log('==================================================');
console.log(' E3/T2 — VOZ FEMENINA ORIGINAL RESTAURADA');
console.log('==================================================');
console.log('PITCH_SHIFT=NO');
console.log('VOICE_SOURCE=scene-003-shot-02-mariana-cedar.mp3');
console.log('VIDEO_REGENERADO=NO');
console.log('VIDEO_REENCODED=NO');
console.log('LABIOS_MODIFICADOS=NO');
console.log('MOVIMIENTO_MODIFICADO=NO');
console.log('API_EXTERNA=NO');
console.log('GASTO_NUEVO=US$0');
console.log('SHOT_BACKUP=' + shotBackup);
console.log('SCENE_BACKUP=' + sceneBackup);
console.log('SCENE_VIDEO=' + sceneVideo);
console.log('ESTADO=' + saved.status);
console.log('REVISION_HUMANA=SI');

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
