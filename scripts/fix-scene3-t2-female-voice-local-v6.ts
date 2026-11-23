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
  feminizeEmbeddedVoicePreserveTiming,
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
    'Uso: npm run safe:scene3:fix-female-voice-local -- <projectId>'
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

if (!shot.videoAsset || shot.status !== 'ready') {
  throw new Error(
    'E3/T2 debe estar ready y tener video final antes de corregir únicamente la voz.'
  );
}

const ordered = [...scene.shots].sort((a, b) => a.order - b.order);
if (ordered.length !== 3 || ordered.some((item) => !item.videoAsset)) {
  throw new Error('Escena 3 debe conservar T1, T2 y T3 con video final.');
}

const shotVideo = assetAbsolutePath(project.id, shot.videoAsset);
await access(shotVideo);

const sourceProbe = await probeVideo(shotVideo);
if (!sourceProbe.hasVideo || !sourceProbe.hasAudio) {
  throw new Error('E3/T2 fuente no contiene video+audio utilizables.');
}

const targetDuration = shot.durationSeconds;
const tolerance = Math.max(0.25, targetDuration * 0.05);

if (
  !Number.isFinite(sourceProbe.durationSeconds) ||
  Math.abs(sourceProbe.durationSeconds - targetDuration) > tolerance
) {
  throw new Error(
    'E3/T2 tiene duración inesperada: ' +
      sourceProbe.durationSeconds.toFixed(3) +
      's; esperado=' +
      targetDuration.toFixed(3) +
      's.'
  );
}

const videoDir = projectAssetDir(project.id, 'video');
const audioDir = projectAssetDir(project.id, 'audio');
const rejectedDir = path.join(videoDir, 'rejected');
await mkdir(rejectedDir, { recursive: true });
await mkdir(audioDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const shotBackup = path.join(
  rejectedDir,
  'scene-003-shot-02-before-female-voice-' + stamp + '.mp4'
);
const sceneBackup = path.join(
  rejectedDir,
  'scene-003-before-female-voice-' + stamp + '.mp4'
);

await copyFile(shotVideo, shotBackup);

const femaleAudio = path.join(
  audioDir,
  'scene-003-shot-02-mariana-female-local.m4a'
);

const partialShot = path.join(
  videoDir,
  'scene-003-shot-02-female-voice.partial.mp4'
);

const pitchFactorRaw = Number.parseFloat(
  String(process.env.VIRALCINE_FEMALE_PITCH_FACTOR || '1.17')
);
const pitchFactor = Number.isFinite(pitchFactorRaw)
  ? pitchFactorRaw
  : 1.17;

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — E3/T2 SOLO CAMBIO DE VOZ');
console.log('==================================================');
console.log('Video: SE CONSERVA');
console.log('Movimiento/labios: SE CONSERVAN');
console.log('Texto y timing: SE CONSERVAN');
console.log('Cambio: timbre/pitch masculino -> femenino');
console.log('Método: FFmpeg LOCAL sobre el audio embebido existente');
console.log('Pitch factor: ' + pitchFactor.toFixed(3));
console.log('API externa: NO');
console.log('Gasto nuevo: US$0');
console.log('');

await feminizeEmbeddedVoicePreserveTiming(
  shotVideo,
  targetDuration,
  femaleAudio,
  pitchFactor
);

try {
  await replaceAudioPreserveVideo(
    shotVideo,
    femaleAudio,
    targetDuration,
    partialShot
  );

  const fixedProbe = await probeVideo(partialShot);
  if (
    !fixedProbe.hasVideo ||
    !fixedProbe.hasAudio ||
    !Number.isFinite(fixedProbe.durationSeconds) ||
    Math.abs(fixedProbe.durationSeconds - targetDuration) > tolerance
  ) {
    throw new Error(
      'La corrección local produjo un clip inválido. El original permanece respaldado.'
    );
  }

  await rm(shotVideo, { force: true });
  await rename(partialShot, shotVideo);
} finally {
  await rm(partialShot, { force: true });
}

const sceneVideo = scene.videoAsset
  ? assetAbsolutePath(project.id, scene.videoAsset)
  : path.join(videoDir, 'scene-003.mp4');

if (await exists(sceneVideo)) {
  await copyFile(sceneVideo, sceneBackup);
}

const clips = ordered.map((item) => {
  if (!item.videoAsset) throw new Error('Toma sin videoAsset.');
  return assetAbsolutePath(project.id, item.videoAsset);
});

const partialScene = path.join(
  videoDir,
  'scene-003-female-voice.partial.mp4'
);

try {
  await concatenate(clips, partialScene);

  const sceneProbe = await probeVideo(partialScene);
  if (
    !sceneProbe.hasVideo ||
    !sceneProbe.hasAudio ||
    !Number.isFinite(sceneProbe.durationSeconds) ||
    Math.abs(sceneProbe.durationSeconds - 24) > 0.5
  ) {
    throw new Error(
      'La recomposición de Escena 3 no quedó en ~24s. Se conserva el backup.'
    );
  }

  await rm(sceneVideo, { force: true });
  await rename(partialScene, sceneVideo);
} finally {
  await rm(partialScene, { force: true });
}

shot.voiceAsset = assetRelativePath(project.id, femaleAudio);
shot.lastProvider = 'local-ffmpeg-female-voice';
shot.pipelineVersion = '6.0-local-female-voice-only';
shot.status = 'review-required';
shot.error =
  'Corrección LOCAL: solo se cambió el timbre de voz masculino a femenino; video, labios, movimiento y timing visual se conservaron. Revisión humana requerida.';
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
  'E3/T2 corregida localmente SOLO en voz. Video y movimiento labial no fueron regenerados.';

project.status = 'quality-review';
project.error = undefined;
project.progress = {
  phase: 'quality-review',
  percent: 45,
  message:
    'Escena 3 recompuesta: E3/T2 conserva video/labios y sustituye únicamente el timbre de voz por versión femenina local.',
  currentScene: 3,
  totalScenes: project.plan.scenes.length,
  updatedAt: new Date().toISOString()
};

project.productionLog.push(
  new Date().toISOString() +
    ' ViralCine 6 Safe: E3/T2 corrección LOCAL voice-only. ' +
    'Se conservó el stream de video con -c:v copy; se transformó únicamente el audio embebido a timbre femenino manteniendo duración/timing. ' +
    'APIs externas: NO. Gasto adicional: US$0.'
);

await appendSpend(project.id, {
  operation: 'voice',
  provider: 'local-ffmpeg',
  model: 'female-timbre-preserve-timing-v1',
  state: 'reconciled',
  estimatedUsd: 0,
  actualUsd: 0,
  sceneId: scene.id,
  shotId: shot.id,
  characterId: shot.speakerId,
  idempotencyKey: 'v6safe:e3:t2:female-voice-local:1',
  outputAsset: assetRelativePath(project.id, femaleAudio)
});

const shotAssets = renderedAssets(
  project.id,
  shot.mode,
  assetAbsolutePath(project.id, shot.imageAsset!),
  femaleAudio,
  shotVideo
);
await saveShotCheckpoint(project, scene, shot, shotAssets);

const sceneAssets = renderedAssets(
  project.id,
  scene.mode,
  assetAbsolutePath(project.id, scene.imageAsset!),
  femaleAudio,
  sceneVideo
);
await saveSceneCheckpoint(project, scene, sceneAssets);

const saved = await saveProject(project);

console.log('==================================================');
console.log(' E3/T2 — CORRECCION TERMINADA');
console.log('==================================================');
console.log('VIDEO_REGENERADO=NO');
console.log('VIDEO_REENCODED=NO');
console.log('LABIOS_MODIFICADOS=NO');
console.log('MOVIMIENTO_MODIFICADO=NO');
console.log('TEXTO_MODIFICADO=NO');
console.log('TIMING_VISUAL_MODIFICADO=NO');
console.log('VOZ_MASCULINA_A_FEMENINA=SI');
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
