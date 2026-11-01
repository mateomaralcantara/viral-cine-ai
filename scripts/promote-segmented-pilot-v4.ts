import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  assetAbsolutePath,
  getProject,
  projectRoot,
  saveProject
} from '@/lib/storage/project-store';
import {
  inspectSegmentedTurnVisualSources
} from '@/lib/engine/segmented-visual-sources-v4';
import {
  assertCinematicSceneVideo,
  assertCinematicVideoTrack
} from '@/lib/media/probe';

loadProjectLocalEnvOverride();

const [command, projectId, shotId, ...rest] = process.argv.slice(2);

if (!command || !projectId || !shotId || !['preview', 'apply'].includes(command)) {
  usage();
  process.exit(1);
}

const project = await getProject(projectId);
if (!project.plan) throw new Error('El proyecto no tiene plan.');

let located:
  | {
      scene: NonNullable<typeof project.plan>['scenes'][number];
      shot: NonNullable<typeof project.plan>['scenes'][number]['shots'][number];
    }
  | undefined;

for (const scene of project.plan.scenes) {
  const shot = scene.shots.find((item) => item.id === shotId);
  if (shot) {
    located = { scene, shot };
    break;
  }
}

if (!located) throw new Error("No existe la toma '" + shotId + "'.");

const visual = await inspectSegmentedTurnVisualSources(project, located.scene, located.shot);
if (!visual.allReferencesReady || !visual.allVideosReady) {
  throw new Error('Promoción bloqueada: las referencias y videos 4.1 por turno deben estar completamente listos.');
}

for (const turn of visual.turns) {
  await assertCinematicVideoTrack(turn.videoPath, turn.slotDurationSeconds);
}

const sourceParts: string[] = [];
for (const turn of visual.turns) {
  sourceParts.push(turn.index + ':' + await sha256File(turn.videoPath));
}
const sourceFingerprint = createHash('sha256').update(sourceParts.join('|')).digest('hex').slice(0, 12);

const folder =
  'scene-' + pad(located.scene.order) +
  '-shot-' + pad(located.shot.order) +
  '-' + located.shot.id +
  '-src-' + sourceFingerprint;

const finalAsset = 'video/segmented-v4-real/' + folder + '/recomposed-real.mp4';
const audioAsset = 'audio/segmented-v4-real/' + folder + '/master-audio.wav';
const finalPath = assetAbsolutePath(project.id, finalAsset);
const audioPath = assetAbsolutePath(project.id, audioAsset);

await access(finalPath);
await access(audioPath);
await assertCinematicSceneVideo(finalPath, located.shot.durationSeconds, {
  requireMotion: true,
  requireAudibleAudio: true
});

const firstTurn = visual.turns[0];
const imageAsset = visual.turns.find((turn) => turn.referenceReady)?.referenceAsset;
if (!firstTurn?.videoAsset || !imageAsset) {
  throw new Error('Promoción bloqueada: no se pudo determinar la referencia y fuente visual principal.');
}

console.log('\nVIRALCINE 4.1 — PROMOCION DE PILOTO');
console.log('Proyecto: ' + project.id);
console.log('Toma: E' + located.scene.order + '/T' + located.shot.order + ' ' + located.shot.id);
console.log('Estado actual: ' + located.shot.status);
console.log('Pipeline actual: ' + (located.shot.pipelineVersion || 'sin-version'));
console.log('Video actual: ' + (located.shot.videoAsset || 'ninguno'));
console.log('\nASSETS 4.1 VALIDADOS');
console.log('  Referencia principal: ' + imageAsset);
console.log('  Fuente visual principal: ' + firstTurn.videoAsset);
console.log('  Audio maestro: ' + audioAsset);
console.log('  Video final: ' + finalAsset);
console.log('  Fingerprint fuentes: ' + sourceFingerprint);
console.log('  Turnos visuales: ' + visual.turns.length);
console.log('  Videos por turno: LISTOS');
console.log('  Video final con audio: VALIDADO');

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: project.json NO se modifica.');
  console.log('  APIs externas: NO');
  console.log('  Gasto: US$0');
  console.log('PROMOTE_4_1_PREVIEW=PASS');
  process.exit(0);
}

const confirmation = rest.join(' ').trim();
if (confirmation !== '--confirm PROMOVER 4.1') {
  throw new Error('Promoción bloqueada. Debes usar exactamente: --confirm PROMOVER 4.1');
}

const backupDir = path.join(projectRoot(project.id), 'checkpoints');
await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(
  backupDir,
  'project-before-promote-e' + located.scene.order + '-t' + located.shot.order + '-' + stamp + '.json'
);
await copyFile(path.join(projectRoot(project.id), 'project.json'), backupPath);

const now = new Date().toISOString();
located.shot.baseVideoAsset = firstTurn.videoAsset;
located.shot.imageAsset = imageAsset;
located.shot.voiceAsset = audioAsset;
located.shot.lipSyncAsset = finalAsset;
located.shot.videoAsset = finalAsset;
located.shot.pipelineVersion = '4.1-segmented-visual-turns';
located.shot.lastProvider = 'segmented-visual-turns-elevenlabs-fal';
located.shot.lastGenerationState = 'succeeded';
located.shot.lastGenerationAt = now;
located.shot.status = 'ready';
located.shot.error = undefined;

project.productionLog.push(
  now + ' E' + located.scene.order + '/T' + located.shot.order +
  ' promovida oficialmente a ViralCine 4.1 desde piloto segmentado aprobado. ' +
  'Video=' + finalAsset
);

await saveProject(project);

const verified = await getProject(project.id);
const verifiedShot = verified.plan?.scenes
  .find((scene) => scene.id === located!.scene.id)
  ?.shots.find((shot) => shot.id === shotId);

if (!verifiedShot) throw new Error('Promoción guardada pero no pudo verificarse la toma en project.json.');
if (
  verifiedShot.videoAsset !== finalAsset ||
  verifiedShot.voiceAsset !== audioAsset ||
  verifiedShot.pipelineVersion !== '4.1-segmented-visual-turns' ||
  verifiedShot.status !== 'ready'
) {
  throw new Error('Verificación posterior falló: project.json no refleja todos los assets 4.1 esperados.');
}

console.log('\n==============================================');
console.log(' PROMOCION 4.1 COMPLETADA');
console.log('==============================================');
console.log('Estado: ' + verifiedShot.status);
console.log('Pipeline: ' + verifiedShot.pipelineVersion);
console.log('Video oficial: ' + verifiedShot.videoAsset);
console.log('Audio oficial: ' + verifiedShot.voiceAsset);
console.log('Backup project.json: ' + backupPath);
console.log('APIs externas: NO');
console.log('Gasto adicional: US$0');
console.log('PROMOTE_4_1_APPLY=PASS');

async function sha256File(filePath: string) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function usage() {
  console.log('Uso:');
  console.log('  npm run segments:promote -- preview <projectId> <shotId>');
  console.log('  npm run segments:promote -- apply <projectId> <shotId> --confirm PROMOVER 4.1');
}
