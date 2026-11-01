import { existsSync } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { getProject, assetAbsolutePath, projectAssetDir } from '@/lib/storage/project-store';
import { createSceneContactSheet } from '@/lib/media/ffmpeg';
import { probeMediaDurationSeconds, probeVideoStreamInfo } from '@/lib/media/segmented-ffmpeg';
import { inspectMixedShotVisualSource } from '@/lib/engine/producer-v4';

loadLocalEnvSafely();

const [projectId, shotId] = process.argv.slice(2);
if (!projectId || !shotId) {
  console.log('Uso: npm run visual:audit -- <projectId> <shotId>');
  process.exit(1);
}

const project = await getProject(projectId);
if (!project.plan) throw new Error('El proyecto no tiene plan.');

let located:
  | { scene: NonNullable<typeof project.plan>['scenes'][number]; shot: NonNullable<typeof project.plan>['scenes'][number]['shots'][number] }
  | undefined;

for (const scene of project.plan.scenes) {
  const shot = scene.shots.find((item) => item.id === shotId);
  if (shot) {
    located = { scene, shot };
    break;
  }
}
if (!located) throw new Error('No existe la toma solicitada.');

const sourceInspection = await inspectMixedShotVisualSource(project, located.scene, located.shot);
const sourceAsset = sourceInspection.selectedAsset || located.shot.baseVideoAsset || located.shot.videoAsset;
if (!sourceAsset) throw new Error('La toma no tiene MP4 fuente.');

const sourcePath = assetAbsolutePath(project.id, sourceAsset);
const folder = 'scene-' + pad(located.scene.order) + '-shot-' + pad(located.shot.order) + '-' + located.shot.id;
const segmentedRoot = path.join(projectAssetDir(project.id, 'video'), 'segmented-v4-real');
const finalPath = await resolveLatestSegmentedOutput(segmentedRoot, folder);
if (!finalPath) throw new Error('No existe recomposed-real.mp4 para esta toma.');

const selectedFolder = path.basename(path.dirname(finalPath));
const qualityDir = path.join(projectAssetDir(project.id, 'quality'), 'visual-audit-v4', selectedFolder);
await mkdir(qualityDir, { recursive: true });

const sourceDuration = await probeMediaDurationSeconds(sourcePath);
const finalDuration = await probeMediaDurationSeconds(finalPath);
const sourceVideo = await probeVideoStreamInfo(sourcePath);
const finalVideo = await probeVideoStreamInfo(finalPath);

console.log('\nVISUAL AUDIT 4.0 — SOLO LOCAL / SIN APIS');
print('FUENTE', sourcePath, sourceDuration, sourceVideo);
print('FINAL', finalPath, finalDuration, finalVideo);

let sourceSheet: string | undefined;
let finalSheet: string | undefined;

if (sourceVideo.hasVideo) {
  sourceSheet = path.join(qualityDir, 'source-contact-sheet.jpg');
  await createSceneContactSheet(sourcePath, sourceDuration, sourceSheet);
}
if (finalVideo.hasVideo) {
  finalSheet = path.join(qualityDir, 'final-contact-sheet.jpg');
  await createSceneContactSheet(finalPath, finalDuration, finalSheet);
}

console.log('\nCONTACT SHEETS');
console.log('Fuente: ' + (sourceSheet || 'NO GENERADA'));
console.log('Final : ' + (finalSheet || 'NO GENERADA'));

console.log('\nDIAGNOSTICO');
if (!sourceVideo.hasVideo) {
  console.log('RESULTADO=SOURCE_AUDIO_ONLY');
  console.log('El problema ya está en el MP4 fuente.');
} else if (!finalVideo.hasVideo) {
  console.log('RESULTADO=RECOMPOSED_AUDIO_ONLY');
  console.log('La fuente sí tiene video pero la recomposición perdió la pista visual.');
} else {
  console.log('RESULTADO=VIDEO_STREAM_PRESENT');
  console.log('Fuente y salida tienen pista de video. Hay que comparar las dos contact sheets para detectar negro/imagen congelada/player.');
}
console.log('APIs externas: 0');
console.log('Gasto nuevo: US$0');

function print(label: string, filePath: string, duration: number, info: Awaited<ReturnType<typeof probeVideoStreamInfo>>) {
  console.log('\n' + label);
  console.log('Ruta: ' + filePath);
  console.log('Duración: ' + duration.toFixed(3) + 's');
  console.log('Video: ' + (info.hasVideo ? 'SI' : 'NO'));
  if (info.hasVideo) {
    console.log('Codec: ' + (info.codecName || 'N/D'));
    console.log('Resolución: ' + (info.width || 0) + 'x' + (info.height || 0));
    console.log('Pixel format: ' + (info.pixelFormat || 'N/D'));
    console.log('FPS: ' + (info.avgFrameRate || 'N/D'));
  }
}

async function resolveLatestSegmentedOutput(root: string, baseFolder: string) {
  if (!existsSync(root)) return undefined;
  const candidates: Array<{ file: string; mtimeMs: number }> = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name !== baseFolder && !entry.name.startsWith(baseFolder + '-src-')) continue;
    const file = path.join(root, entry.name, 'recomposed-real.mp4');
    if (!existsSync(file)) continue;
    const info = await stat(file);
    candidates.push({ file, mtimeMs: info.mtimeMs });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.file;
}

function loadLocalEnvSafely() {
  for (const name of ['.env.local', '.env']) {
    const file = path.resolve(process.cwd(), name);
    if (!existsSync(file)) continue;
    loadEnvFile(file);
    break;
  }
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}
