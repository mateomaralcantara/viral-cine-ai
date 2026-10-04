import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import type { FilmProject } from '@/lib/domain/schemas';
import {
  assetAbsolutePath,
  assetRelativePath,
  getProject,
  projectRoot,
  saveProject
} from '@/lib/storage/project-store';
import {
  generateSegmentedTurnReferencesReal,
  generateSegmentedTurnVideosReal,
  inspectSegmentedTurnVisualSources,
  turnSourceAssetMap
} from '@/lib/engine/segmented-visual-sources-v4';
import { buildSegmentedRealPreflight } from '@/lib/engine/segmented-real-preflight-v4';
import { renderSegmentedShotReal } from '@/lib/engine/segmented-renderer-v4';
import {
  ensureProjectMusicReal,
  inspectProjectMusic,
  shotTimelineOffsetSeconds
} from '@/lib/engine/project-music-v4';
import { hasUsableCredential } from '@/lib/engine/production-safety';
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
if (located.shot.dialogueLines.length < 2) {
  throw new Error('La toma no es multihablante; usa single:full.');
}

const visual = await inspectSegmentedTurnVisualSources(project, located.scene, located.shot);
const sourceAsset =
  visual.turns.find((turn) => turn.videoReady)?.videoAsset ||
  located.shot.baseVideoAsset ||
  located.shot.videoAsset ||
  'video/pending-segmented-source.mp4';

const effectiveShot = {
  ...located.shot,
  baseVideoAsset: sourceAsset,
  videoAsset: sourceAsset
};

const speech = buildSegmentedRealPreflight(project, located.scene, effectiveShot);
const music = await inspectProjectMusic(project);

const blockers = unique([
  !visual.allReferencesReady && !hasUsableCredential('OPENAI_API_KEY')
    ? 'Falta OPENAI_API_KEY para las referencias visuales por turno.'
    : '',
  !visual.allVideosReady && !hasUsableCredential('GEMINI_API_KEY')
    ? 'Falta GEMINI_API_KEY para los videos Veo por turno.'
    : '',
  ...speech.blockers,
  music.blocker || ''
].filter(Boolean));

const totalEstimatedUsd = money(
  visual.estimatedMissingReferencesUsd +
  visual.estimatedMissingVideosUsd +
  speech.totals.totalEstimatedUsd +
  music.estimatedUsd
);

console.log('\nVIRALCINE 4.2 — FULL FLOW SEGMENTED PREVIEW');
console.log('Proyecto: ' + project.id);
console.log('Toma: E' + located.scene.order + '/T' + located.shot.order + ' ' + located.shot.id);
console.log('Turnos: ' + visual.turns.length);
console.log('Referencias listas: ' + visual.turns.filter((turn) => turn.referenceReady).length + '/' + visual.turns.length);
console.log('Videos listos: ' + visual.turns.filter((turn) => turn.videoReady).length + '/' + visual.turns.length);
console.log('Costo referencias pendiente: US$' + visual.estimatedMissingReferencesUsd.toFixed(4));
console.log('Costo videos pendiente: US$' + visual.estimatedMissingVideosUsd.toFixed(4));
console.log('Costo voces estimado: US$' + speech.totals.voiceEstimatedUsd.toFixed(4));
console.log('Costo lip-sync estimado: US$' + speech.totals.lipSyncEstimatedUsd.toFixed(4));
console.log('Música: ' + (
  !music.enabled ? 'DESHABILITADA' :
  music.ready ? 'LISTA/REUTILIZABLE' : 'PENDIENTE'
));
console.log('Costo música pendiente: US$' + music.estimatedUsd.toFixed(4));
console.log('COSTO MAXIMO PENDIENTE ESTIMADO: US$' + totalEstimatedUsd.toFixed(4));
console.log('Bloqueos: ' + blockers.length);
for (const blocker of blockers) console.log('  - ' + blocker);

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: no modifica project.json, ledger ni media.');
  console.log('  OpenAI=NO | Veo=NO | ElevenLabs=NO | Fal=NO');
  console.log('  Gasto: US$0');
  console.log(blockers.length ? 'SEGMENTED_FULL_FLOW_PREVIEW=BLOCKED' : 'SEGMENTED_FULL_FLOW_PREVIEW=PASS');
  process.exit(blockers.length ? 2 : 0);
}

const confirmation = rest.join(' ').trim();
if (confirmation !== '--confirm-paid SI FULL FLOW') {
  throw new Error(
    'Ejecución pagada bloqueada. Debes usar exactamente: --confirm-paid SI FULL FLOW'
  );
}
if (blockers.length) {
  throw new Error('Full flow segmentado bloqueado: ' + blockers.join(' | '));
}

process.env.PRODUCTION_MODE = 'real';
process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
process.env.ALLOW_PAID_GENERATION = 'true';
process.env.ALLOW_PAID_PROVIDER_FALLBACK = 'false';

console.log('\n==============================================');
console.log(' VIRALCINE 4.2 — FULL FLOW SEGMENTED');
console.log('==============================================');
console.log('Confirmación exacta: SI FULL FLOW');
console.log('Reutiliza checkpoints y assets existentes.');

let readyVisual = await inspectSegmentedTurnVisualSources(project, located.scene, located.shot);
if (!readyVisual.allReferencesReady) {
  console.log('\n[1/5] Generando referencias por turno...');
  readyVisual = await generateSegmentedTurnReferencesReal(project, located.scene, located.shot);
  console.log('Referencias por turno: LISTAS');
} else {
  console.log('\n[1/5] Referencias por turno: REUTILIZADAS');
}

if (!readyVisual.allVideosReady) {
  console.log('\n[2/5] Generando videos Veo por turno...');
  readyVisual = await generateSegmentedTurnVideosReal(project, located.scene, located.shot);
  console.log('Videos Veo por turno: LISTOS');
} else {
  console.log('\n[2/5] Videos Veo por turno: REUTILIZADOS');
}

if (project.input.aspectRatio === '16:9') {
  let repairedCount = 0;
  for (const turn of readyVisual.turns) {
    const archivePath = path.join(
      projectRoot(project.id),
      'checkpoints',
      'auto-pillarbox',
      'scene-' + pad(located.scene.order) +
      '-shot-' + pad(located.shot.order) +
      '-' + located.shot.id,
      'turn-' + pad(turn.index),
      'base-real-original.mp4'
    );
    const repaired = await repairPersistentPillarboxInPlace(
      turn.videoPath,
      archivePath,
      1280,
      720,
      0.35
    );
    if (repaired.repaired) repairedCount += 1;
  }
  console.log('Pillarbox corregido automáticamente en ' + repairedCount + ' turno(s).');
  readyVisual = await inspectSegmentedTurnVisualSources(project, located.scene, located.shot);
}

const firstTurnAsset = readyVisual.turns[0]?.videoAsset;
if (!firstTurnAsset || !readyVisual.allVideosReady) {
  throw new Error('Las fuentes visuales por turno no quedaron completamente listas.');
}

const renderShot = {
  ...located.shot,
  baseVideoAsset: firstTurnAsset,
  videoAsset: firstTurnAsset
};

const renderPreflight = buildSegmentedRealPreflight(project, located.scene, renderShot);
if (renderPreflight.blockers.length) {
  throw new Error(
    'El render segmentado quedó bloqueado después de preparar visuales: ' +
    renderPreflight.blockers.join(' | ')
  );
}

console.log('\n[3/5] Generando/reutilizando voces, lip-sync y recomposición...');
const rendered = await renderSegmentedShotReal(
  project,
  located.scene,
  renderShot,
  { turnSourceAssets: turnSourceAssetMap(readyVisual) }
);
console.log('Audio maestro: ' + rendered.masterAudioAsset);
console.log('Turnos con lip-sync: ' + rendered.lipSyncTurns);
console.log('Render segmentado: ' + rendered.outputAsset);

console.log('\n[4/5] Preparando música de fondo...');
const readyMusic = await ensureProjectMusicReal(project);
let finalAsset = rendered.outputAsset;
let finalPath = rendered.outputPath;

if (readyMusic.enabled) {
  if (!readyMusic.ready || !readyMusic.path || !readyMusic.asset) {
    throw new Error('La música estaba habilitada pero no quedó lista.');
  }

  const musicDuration = await probeMediaDurationSeconds(readyMusic.path);
  const timelineOffset = shotTimelineOffsetSeconds(project, located.scene.id, located.shot.id);
  const musicOffset = musicDuration > 0 ? timelineOffset % musicDuration : 0;
  const musicOutput = path.join(
    path.dirname(rendered.outputPath),
    'recomposed-with-music-' + readyMusic.fingerprint + '.mp4'
  );

  if (!(await fileExists(musicOutput))) {
    await mixBackgroundMusic(rendered.outputPath, readyMusic.path, musicOutput, musicOffset);
  }

  await assertCinematicSceneVideo(musicOutput, located.shot.durationSeconds, {
    requireMotion: true,
    requireAudibleAudio: true
  });

  finalPath = musicOutput;
  finalAsset = assetRelativePath(project.id, musicOutput);
  console.log('Banda sonora: ' + readyMusic.asset);
  console.log('Offset musical de continuidad: ' + musicOffset.toFixed(3) + 's');
  console.log('Mezcla con ducking: LISTA');
} else {
  console.log('Música deshabilitada en el proyecto.');
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

const now = new Date().toISOString();
const imageAsset = readyVisual.turns.find((turn) => turn.referenceReady)?.referenceAsset;
if (!imageAsset) throw new Error('No se pudo determinar la referencia visual principal.');

located.shot.imageAsset = imageAsset;
located.shot.baseVideoAsset = firstTurnAsset;
located.shot.voiceAsset = rendered.masterAudioAsset;
located.shot.lipSyncAsset = rendered.lipSyncTurns > 0 ? rendered.outputAsset : undefined;
located.shot.videoAsset = finalAsset;
located.shot.pipelineVersion = readyMusic.enabled
  ? '4.2-segmented-full-flow-music'
  : '4.2-segmented-full-flow';
located.shot.lastProvider = readyMusic.enabled
  ? 'segmented-openai-veo-voice-fal-lipsync-music'
  : 'segmented-openai-veo-voice-fal-lipsync';
located.shot.lastGenerationState = 'succeeded';
located.shot.lastGenerationAt = now;
located.shot.status = 'ready';
located.shot.error = undefined;

project.productionLog.push(
  now +
  ' E' + located.scene.order + '/T' + located.shot.order +
  ' completada por Full Flow segmentado 4.2. Video=' + finalAsset +
  (readyMusic.enabled ? ' | música=' + readyMusic.asset : '')
);
project = await saveProject(project);

const verified = locateShot(project, shotId)?.shot;
if (!verified || verified.videoAsset !== finalAsset || verified.status !== 'ready') {
  throw new Error('La promoción automática segmentada no quedó reflejada en project.json.');
}

console.log('\n==============================================');
console.log(' SEGMENTED FULL FLOW 4.2 — PASS');
console.log('==============================================');
console.log('Toma: E' + located.scene.order + '/T' + located.shot.order);
console.log('Referencias por turno: ' + readyVisual.turns.length);
console.log('Videos por turno: ' + readyVisual.turns.length);
console.log('Audio maestro: ' + rendered.masterAudioAsset);
console.log('Lip-sync turns: ' + rendered.lipSyncTurns);
console.log('Música: ' + (readyMusic.asset || 'NO'));
console.log('Video final oficial: ' + finalAsset);
console.log('Duración final: ' + (await probeMediaDurationSeconds(finalPath)).toFixed(3) + 's');
console.log('Pipeline: ' + verified.pipelineVersion);
console.log('Backup project.json: ' + backupPath);
console.log('SEGMENTED_FULL_FLOW_RUN=PASS');

function locateShot(value: FilmProject, id: string) {
  for (const scene of value.plan?.scenes || []) {
    const shot = scene.shots.find((item) => item.id === id);
    if (shot) return { scene, shot };
  }
  return undefined;
}

async function fileExists(filePath: string) {
  try {
    await import('node:fs/promises').then(({ access }) => access(filePath));
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
  console.log('  npm run segments:full -- preview <projectId> <shotId>');
  console.log('  npm run segments:full -- run <projectId> <shotId> --confirm-paid SI FULL FLOW');
}
