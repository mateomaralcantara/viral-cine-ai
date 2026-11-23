import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile } from 'node:fs/promises';
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
import { inspectSingleVisualSource } from '@/lib/engine/single-visual-source-v4';
import { assertCinematicSceneVideo, assertCinematicVideoTrack } from '@/lib/media/probe';

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
if (located.shot.dialogueLines.length > 1) {
  throw new Error('La toma es multihablante; usa segments:promote.');
}

const visual = await inspectSingleVisualSource(project, located.scene, located.shot);
if (!visual.referenceReady || !visual.videoReady) {
  throw new Error('Promoción bloqueada: referencia y video single 4.1 deben estar listos.');
}

await assertCinematicVideoTrack(visual.videoPath, located.shot.durationSeconds);

const sourceFingerprint = (await sha256File(visual.videoPath)).slice(0, 12);
const folder =
  'scene-' + pad(located.scene.order) +
  '-shot-' + pad(located.shot.order) +
  '-' + located.shot.id +
  '-src-' + sourceFingerprint;

const finalAsset = 'video/single-v4-real/' + folder + '/final-real.mp4';
const audioAsset = 'audio/single-v4-real/' + folder + '/master-audio.wav';
const finalPath = assetAbsolutePath(project.id, finalAsset);
const audioPath = assetAbsolutePath(project.id, audioAsset);

await access(finalPath);
await access(audioPath);
await assertCinematicSceneVideo(finalPath, located.shot.durationSeconds, {
  requireMotion: true,
  requireAudibleAudio: true
});

const voiceHash = createHash('sha256')
  .update((located.shot.speakerId || 'narrator') + '\0' + located.shot.spokenText.trim())
  .digest('hex')
  .slice(0, 10);
const alignmentPath = path.join(
  projectAssetDir(project.id, 'audio'),
  'single-v4-voice',
  'scene-' + pad(located.scene.order) + '-shot-' + pad(located.shot.order) + '-' + voiceHash + '.alignment.json'
);
const alignmentReady = await fileExists(alignmentPath);
const alignmentAsset = alignmentReady ? assetRelativePath(project.id, alignmentPath) : undefined;

console.log('\nVIRALCINE 4.1 — PROMOCION SINGLE');
console.log('Proyecto: ' + project.id);
console.log('Toma: E' + located.scene.order + '/T' + located.shot.order + ' ' + located.shot.id);
console.log('Estado actual: ' + located.shot.status);
console.log('Pipeline actual: ' + (located.shot.pipelineVersion || 'sin-version'));
console.log('Video actual: ' + (located.shot.videoAsset || 'ninguno'));

console.log('\nASSETS 4.1 VALIDADOS');
console.log('  Referencia: ' + visual.referenceAsset);
console.log('  Fuente Veo: ' + visual.videoAsset);
console.log('  Audio maestro: ' + audioAsset);
console.log('  Alignment: ' + (alignmentAsset || 'NO DISPONIBLE'));
console.log('  Video final: ' + finalAsset);
console.log('  Fingerprint fuente: ' + sourceFingerprint);
console.log('  Video final con audio: VALIDADO');

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: project.json NO se modifica.');
  console.log('  APIs externas: NO');
  console.log('  Gasto: US$0');
  console.log('PROMOTE_SINGLE_4_1_PREVIEW=PASS');
  process.exit(0);
}

const confirmation = rest.join(' ').trim();
if (confirmation !== '--confirm PROMOVER SINGLE 4.1') {
  throw new Error('Promoción bloqueada. Debes usar exactamente: --confirm PROMOVER SINGLE 4.1');
}

const backupDir = path.join(projectRoot(project.id), 'checkpoints');
await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(
  backupDir,
  'project-before-promote-single-e' + located.scene.order +
  '-t' + located.shot.order + '-' + stamp + '.json'
);
await copyFile(path.join(projectRoot(project.id), 'project.json'), backupPath);

const now = new Date().toISOString();
located.shot.imageAsset = visual.referenceAsset;
located.shot.baseVideoAsset = visual.videoAsset;
located.shot.voiceAsset = audioAsset;
located.shot.alignmentAsset = alignmentAsset;
located.shot.lipSyncAsset = undefined;
located.shot.videoAsset = finalAsset;
located.shot.pipelineVersion = '4.1-single-visual';
located.shot.lastProvider = 'single-visual-veo-elevenlabs';
located.shot.lastGenerationState = 'succeeded';
located.shot.lastGenerationAt = now;
located.shot.status = 'ready';
located.shot.error = undefined;

project.productionLog.push(
  now + ' E' + located.scene.order + '/T' + located.shot.order +
  ' promovida oficialmente a ViralCine 4.1 single visual aprobado. Video=' + finalAsset
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
  verifiedShot.baseVideoAsset !== visual.videoAsset ||
  verifiedShot.imageAsset !== visual.referenceAsset ||
  verifiedShot.pipelineVersion !== '4.1-single-visual' ||
  verifiedShot.status !== 'ready'
) {
  throw new Error('Verificación posterior falló: project.json no refleja todos los assets single 4.1 esperados.');
}

console.log('\n==============================================');
console.log(' PROMOCION SINGLE 4.1 COMPLETADA');
console.log('==============================================');
console.log('Estado: ' + verifiedShot.status);
console.log('Pipeline: ' + verifiedShot.pipelineVersion);
console.log('Referencia oficial: ' + verifiedShot.imageAsset);
console.log('Fuente visual oficial: ' + verifiedShot.baseVideoAsset);
console.log('Video oficial: ' + verifiedShot.videoAsset);
console.log('Audio oficial: ' + verifiedShot.voiceAsset);
console.log('Alignment oficial: ' + (verifiedShot.alignmentAsset || 'NO DISPONIBLE'));
console.log('Backup project.json: ' + backupPath);
console.log('APIs externas: NO');
console.log('Gasto adicional: US$0');
console.log('PROMOTE_SINGLE_4_1_APPLY=PASS');

async function sha256File(filePath: string) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function usage() {
  console.log('Uso:');
  console.log('  npm run single:promote -- preview <projectId> <shotId>');
  console.log('  npm run single:promote -- apply <projectId> <shotId> --confirm PROMOVER SINGLE 4.1');
}
