import { createHash } from 'node:crypto';
import type { FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import { access, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  assetAbsolutePath,
  assetRelativePath,
  getProject,
  projectAssetDir,
  projectRoot,
  saveProject
} from '@/lib/storage/project-store';
import {
  generateSingleReferenceReal,
  generateSingleVideoReal,
  inspectSingleVisualSource
} from '@/lib/engine/single-visual-source-v4';
import {
  renderSingleShotReal,
  singleVoiceCheckpointPath
} from '@/lib/engine/single-real-renderer-v4';
import { locateVoiceProfile } from '@/lib/engine/voice-casting-v4';
import {
  estimateOperationCost,
  voiceCostUnits
} from '@/lib/engine/spend-ledger';
import {
  hasUsableCredential,
  isUsableCredentialValue
} from '@/lib/engine/production-safety';
import {
  ensureProjectMusicReal,
  inspectProjectMusic,
  shotTimelineOffsetSeconds
} from '@/lib/engine/project-music-v4';
import { mixBackgroundMusic } from '@/lib/media/ffmpeg';
import { probeMediaDurationSeconds } from '@/lib/media/segmented-ffmpeg';
import { assertCinematicSceneVideo } from '@/lib/media/probe';
import { repairPersistentPillarboxInPlace } from '@/lib/media/pillarbox-repair';

loadProjectLocalEnvOverride();

const [command, projectId, shotId, ...rest] = process.argv.slice(2);

if (!command || !projectId || !shotId || !['preview', 'run'].includes(command)) {
  usage();
  process.exit(1);
}

let project = await getProject(projectId);
if (!project.plan) throw new Error('El proyecto no tiene plan.');

let located = locateShot(project, shotId);
if (!located) throw new Error("No existe la toma '" + shotId + "'.");
if (located.shot.dialogueLines.length > 1) {
  throw new Error(
    'La toma es multihablante. Este flujo automático es para tomas single; usa el flujo segmentado 4.1 para esta toma.'
  );
}

const initialVisual = await inspectSingleVisualSource(project, located.scene, located.shot);
const voiceCheckpointPath = singleVoiceCheckpointPath(project, located.scene, located.shot);
const voiceCheckpointReady = await fileExists(voiceCheckpointPath);
const voiceInfo = resolveVoiceReadiness(project, located.shot, voiceCheckpointReady);
const music = await inspectProjectMusic(project);

const blockers = unique([
  !initialVisual.referenceReady && !hasUsableCredential('OPENAI_API_KEY')
    ? 'Falta OPENAI_API_KEY para la referencia visual.'
    : '',
  !initialVisual.videoReady && !hasUsableCredential('GEMINI_API_KEY')
    ? 'Falta GEMINI_API_KEY para Veo.'
    : '',
  ...voiceInfo.blockers,
  music.blocker || ''
].filter(Boolean));

const voiceEstimatedUsd = voiceCheckpointReady || !located.shot.spokenText.trim()
  ? 0
  : estimateOperationCost('voice', voiceCostUnits(located.shot.spokenText.trim()));

const totalEstimatedUsd = money(
  initialVisual.estimatedReferenceUsd +
  initialVisual.estimatedVideoUsd +
  voiceEstimatedUsd +
  music.estimatedUsd
);

printPreview({
  project,
  scene: located.scene,
  shot: located.shot,
  visual: initialVisual,
  voiceCheckpointReady,
  voiceEstimatedUsd,
  voiceProvider: voiceInfo.provider,
  music,
  blockers,
  totalEstimatedUsd
});

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: no modifica project.json, ledger ni media.');
  console.log('  OpenAI=NO | Veo=NO | ElevenLabs=NO | Fal=NO');
  console.log('  Gasto: US$0');
  console.log(blockers.length ? 'SINGLE_FULL_FLOW_PREVIEW=BLOCKED' : 'SINGLE_FULL_FLOW_PREVIEW=PASS');
  process.exit(blockers.length ? 2 : 0);
}

const confirmation = rest.join(' ').trim();
if (confirmation !== '--confirm-paid SI FULL FLOW') {
  throw new Error(
    'Ejecución pagada bloqueada. Debes usar exactamente: --confirm-paid SI FULL FLOW'
  );
}
if (blockers.length) {
  throw new Error('Full flow bloqueado: ' + blockers.join(' | '));
}

// La autorización vale solo para este proceso.
process.env.PRODUCTION_MODE = 'real';
process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
process.env.ALLOW_PAID_GENERATION = 'true';
process.env.ALLOW_PAID_PROVIDER_FALLBACK = 'false';

console.log('\n==============================================');
console.log(' VIRALCINE 4.2 — FULL FLOW SINGLE');
console.log('==============================================');
console.log('Confirmación exacta: SI FULL FLOW');
console.log('Reutiliza cualquier checkpoint/asset ya existente.');
console.log('No repite una etapa que ya esté LISTA.');

let visual = await inspectSingleVisualSource(project, located.scene, located.shot);

if (!visual.referenceReady) {
  console.log('\n[1/5] Generando referencia OpenAI...');
  visual = await generateSingleReferenceReal(project, located.scene, located.shot);
  console.log('Referencia: LISTA');
} else {
  console.log('\n[1/5] Referencia: REUTILIZADA');
}

if (!visual.videoReady) {
  console.log('\n[2/5] Generando video Veo...');
  visual = await generateSingleVideoReal(project, located.scene, located.shot);
  console.log('Video Veo: LISTO');
} else {
  console.log('\n[2/5] Video Veo: REUTILIZADO');
}

if (project.input.aspectRatio === '16:9') {
  const pillarboxArchive = path.join(
    projectRoot(project.id),
    'checkpoints',
    'auto-pillarbox',
    'scene-' + pad(located.scene.order) +
    '-shot-' + pad(located.shot.order) +
    '-' + located.shot.id,
    'base-real-original.mp4'
  );
  const pillarbox = await repairPersistentPillarboxInPlace(
    visual.videoPath,
    pillarboxArchive,
    1280,
    720,
    0.35
  );
  if (pillarbox.repaired) {
    console.log(
      'Pillarbox detectado y corregido automáticamente: ' +
      pillarbox.before.bars?.left + 'px/' +
      pillarbox.before.bars?.right + 'px.'
    );
    visual = await inspectSingleVisualSource(project, located.scene, located.shot);
  } else {
    console.log('Pillarbox: NO DETECTADO');
  }
}

console.log('\n[3/5] Preparando voz y render principal...');
const rendered = await renderSingleShotReal(project, located.scene, located.shot);
console.log('Audio maestro: ' + rendered.masterAudioAsset);
console.log('Render voz+video: ' + rendered.outputAsset);
console.log('Velocidad voz: ' + rendered.speedFactor.toFixed(3) + 'x');

console.log('\n[4/5] Preparando música de fondo...');
const readyMusic = await ensureProjectMusicReal(project);
let finalAsset = rendered.outputAsset;
let finalPath = assetAbsolutePath(project.id, rendered.outputAsset);

if (readyMusic.enabled) {
  if (!readyMusic.ready || !readyMusic.path || !readyMusic.asset) {
    throw new Error('La música estaba habilitada pero no quedó lista.');
  }

  const musicDuration = await probeMediaDurationSeconds(readyMusic.path);
  const timelineOffset = shotTimelineOffsetSeconds(project, located.scene.id, located.shot.id);
  const musicOffset = musicDuration > 0 ? timelineOffset % musicDuration : 0;
  const musicOutput = path.join(
    path.dirname(finalPath),
    'final-with-music-' + readyMusic.fingerprint + '.mp4'
  );

  if (!(await fileExists(musicOutput))) {
    await mixBackgroundMusic(finalPath, readyMusic.path, musicOutput, musicOffset);
  }

  await assertCinematicSceneVideo(musicOutput, located.shot.durationSeconds, {
    requireMotion: true,
    requireAudibleAudio: true
  });

  finalPath = musicOutput;
  finalAsset = assetRelativePath(project.id, musicOutput);
  console.log('Banda sonora: ' + readyMusic.asset);
  console.log('Offset musical de continuidad: ' + musicOffset.toFixed(3) + 's');
  console.log('Mezcla final con ducking: LISTA');
} else {
  console.log('Música deshabilitada en el proyecto; se conserva render voz+video.');
}

console.log('\n[5/5] Promoviendo automáticamente el resultado validado...');
const backupDir = path.join(projectRoot(project.id), 'checkpoints');
await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(
  backupDir,
  'project-before-full-flow-e' + located.scene.order +
  '-t' + located.shot.order + '-' + stamp + '.json'
);
await copyFile(path.join(projectRoot(project.id), 'project.json'), backupPath);

const alignmentAsset = await resolveAlignmentAsset(project, located.scene.order, located.shot);
const now = new Date().toISOString();

located.shot.imageAsset = visual.referenceAsset;
located.shot.baseVideoAsset = visual.videoAsset;
located.shot.voiceAsset = rendered.masterAudioAsset;
located.shot.alignmentAsset = alignmentAsset;
located.shot.lipSyncAsset = undefined;
located.shot.videoAsset = finalAsset;
located.shot.pipelineVersion = readyMusic.enabled
  ? '4.2-single-full-flow-music'
  : '4.2-single-full-flow';
located.shot.lastProvider = readyMusic.enabled
  ? 'openai-veo-voice-fal-music'
  : 'openai-veo-voice';
located.shot.lastGenerationState = 'succeeded';
located.shot.lastGenerationAt = now;
located.shot.status = 'ready';
located.shot.error = undefined;

project.productionLog.push(
  now +
  ' E' + located.scene.order + '/T' + located.shot.order +
  ' completada por Full Flow 4.2. Video=' + finalAsset +
  (readyMusic.enabled ? ' | música=' + readyMusic.asset : '')
);
project = await saveProject(project);

const verified = locateShot(project, shotId)?.shot;
if (!verified || verified.videoAsset !== finalAsset || verified.status !== 'ready') {
  throw new Error('La promoción automática terminó pero project.json no refleja el resultado esperado.');
}

console.log('\n==============================================');
console.log(' FULL FLOW 4.2 — PASS');
console.log('==============================================');
console.log('Toma: E' + located.scene.order + '/T' + located.shot.order);
console.log('Referencia: ' + visual.referenceAsset);
console.log('Fuente Veo: ' + visual.videoAsset);
console.log('Audio maestro: ' + rendered.masterAudioAsset);
console.log('Música: ' + (readyMusic.asset || 'NO'));
console.log('Video final oficial: ' + finalAsset);
console.log('Duración final: ' + (await probeMediaDurationSeconds(finalPath)).toFixed(3) + 's');
console.log('Pipeline: ' + verified.pipelineVersion);
console.log('Backup project.json: ' + backupPath);
console.log('SINGLE_FULL_FLOW_RUN=PASS');

function resolveVoiceReadiness(
  value: FilmProject,
  shot: FilmShot,
  checkpointReady: boolean
) {
  if (checkpointReady || !shot.spokenText.trim()) {
    return { provider: 'checkpoint', blockers: [] as string[] };
  }

  const speakerId = shot.speakerId || shot.dialogueLines[0]?.speakerId || '';
  if (!speakerId) {
    return { provider: 'unknown', blockers: ['La toma no tiene speakerId resuelto.'] };
  }

  const locatedVoice = locateVoiceProfile(value, speakerId);
  if (!locatedVoice) {
    return {
      provider: 'unknown',
      blockers: ['No existe perfil vocal persistente para ' + speakerId + '.']
    };
  }

  const provider = locatedVoice.profile.voiceProvider || 'elevenlabs';
  const voiceBlockers: string[] = [];

  if (provider === 'elevenlabs') {
    const voiceReady =
      isUsableCredentialValue(locatedVoice.profile.voiceId) ||
      (speakerId === 'narrator' &&
        isUsableCredentialValue(process.env.ELEVENLABS_NARRATOR_VOICE_ID));
    if (!voiceReady) voiceBlockers.push('Falta voiceId persistente para ' + locatedVoice.label + '.');
    if (!hasUsableCredential('ELEVENLABS_API_KEY')) {
      voiceBlockers.push('Falta ELEVENLABS_API_KEY.');
    }
  } else if (provider === 'openai') {
    if (!hasUsableCredential('OPENAI_API_KEY')) {
      voiceBlockers.push('Falta OPENAI_API_KEY para la voz.');
    }
  } else {
    voiceBlockers.push('Proveedor vocal no válido para render real: ' + provider + '.');
  }

  return { provider, blockers: voiceBlockers };
}

async function resolveAlignmentAsset(
  value: FilmProject,
  sceneOrder: number,
  shot: FilmShot
) {
  const voiceHash = createHash('sha256')
    .update((shot.speakerId || 'narrator') + '\0' + shot.spokenText.trim())
    .digest('hex')
    .slice(0, 10);
  const alignmentPath = path.join(
    projectAssetDir(value.id, 'audio'),
    'single-v4-voice',
    'scene-' + pad(sceneOrder) +
    '-shot-' + pad(shot.order) +
    '-' + voiceHash + '.alignment.json'
  );
  return await fileExists(alignmentPath)
    ? assetRelativePath(value.id, alignmentPath)
    : undefined;
}

function locateShot(value: FilmProject, id: string) {
  for (const scene of value.plan?.scenes || []) {
    const shot = scene.shots.find((item) => item.id === id);
    if (shot) return { scene, shot };
  }
  return undefined;
}

function printPreview(value: {
  project: FilmProject;
  scene: FilmScene;
  shot: FilmShot;
  visual: Awaited<ReturnType<typeof inspectSingleVisualSource>>;
  voiceCheckpointReady: boolean;
  voiceEstimatedUsd: number;
  voiceProvider: string;
  music: Awaited<ReturnType<typeof inspectProjectMusic>>;
  blockers: string[];
  totalEstimatedUsd: number;
}) {
  console.log('\nVIRALCINE 4.2 — FULL FLOW PREVIEW');
  console.log('Proyecto: ' + value.project.id);
  console.log('Toma: E' + value.scene.order + '/T' + value.shot.order + ' ' + value.shot.id);
  console.log('');
  console.log('IMAGEN');
  console.log('  Estado: ' + (value.visual.referenceReady ? 'LISTA/REUTILIZABLE' : 'PENDIENTE'));
  console.log('  Costo pendiente: US$' + value.visual.estimatedReferenceUsd.toFixed(4));
  console.log('VIDEO');
  console.log('  Estado: ' + (value.visual.videoReady ? 'LISTO/REUTILIZABLE' : 'PENDIENTE'));
  console.log('  Costo pendiente: US$' + value.visual.estimatedVideoUsd.toFixed(4));
  console.log('VOZ');
  console.log('  Provider: ' + value.voiceProvider);
  console.log('  Checkpoint: ' + (value.voiceCheckpointReady ? 'LISTO/REUTILIZABLE' : 'PENDIENTE'));
  console.log('  Costo pendiente: US$' + value.voiceEstimatedUsd.toFixed(4));
  console.log('MUSICA');
  console.log('  Estado: ' + (
    !value.music.enabled ? 'DESHABILITADA' :
    value.music.ready ? 'LISTA/REUTILIZABLE' : 'PENDIENTE'
  ));
  console.log('  Duración soundtrack: ' + value.music.durationSeconds + 's');
  console.log('  Costo pendiente: US$' + value.music.estimatedUsd.toFixed(4));
  console.log('');
  console.log('COSTO MAXIMO PENDIENTE ESTIMADO: US$' + value.totalEstimatedUsd.toFixed(4));
  console.log('Bloqueos: ' + value.blockers.length);
  if (value.blockers.length) {
    for (const blocker of value.blockers) console.log('  - ' + blocker);
  } else {
    console.log('  ninguno');
  }
  console.log('');
  console.log('TEXTO');
  console.log(value.shot.spokenText.trim() || '(sin texto hablado)');
  if (value.music.enabled) {
    console.log('');
    console.log('MUSIC-PROMPT');
    console.log(value.music.prompt);
  }
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function money(value: number) {
  return Math.round(value * 10000) / 10000;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function usage() {
  console.log('Uso:');
  console.log('  npm run single:full -- preview <projectId> <shotId>');
  console.log('  npm run single:full -- run <projectId> <shotId> --confirm-paid SI FULL FLOW');
}
