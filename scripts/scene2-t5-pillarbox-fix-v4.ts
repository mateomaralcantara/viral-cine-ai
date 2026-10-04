import { access, copyFile, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { getProject, projectRoot, saveProject } from '@/lib/storage/project-store';
import {
  buildPillarboxRepairFilter,
  detectSymmetricBlackSideBars
} from '@/lib/media/pillarbox';

loadProjectLocalEnvOverride();

const [command, projectId, ...rest] = process.argv.slice(2);
if (!command || !projectId || !['preview', 'apply'].includes(command)) {
  usage();
  process.exit(1);
}

const project = await getProject(projectId);
if (!project.plan) throw new Error('El proyecto no tiene plan.');

const scene = project.plan.scenes.find((item) => item.order === 2);
const shot = scene?.shots.find((item) => item.order === 5);
if (!scene || !shot) throw new Error('No se encontró E2/T5.');

const root = projectRoot(project.id);
const folder = 'scene-02-shot-05-' + shot.id;
const videoPath = path.join(root, 'video', 'single-v4-sources', folder, 'base-real.mp4');

if (!(await exists(videoPath))) {
  throw new Error('No existe el video Veo activo de E2/T5.');
}

const probe = await probeVideo(videoPath);
if (probe.width !== 1280 || probe.height !== 720) {
  throw new Error(
    'E2/T5 no tiene resolución 1280x720; resolución detectada: ' +
    probe.width + 'x' + probe.height + '.'
  );
}

const sampleTimes = [
  Math.min(0.5, probe.durationSeconds * 0.1),
  Math.max(0, probe.durationSeconds * 0.5),
  Math.max(0, probe.durationSeconds - 0.5)
];

const frames: Uint8Array[] = [];
for (const time of sampleTimes) {
  frames.push(await captureGrayFrame(videoPath, time, probe.width, probe.height));
}

const bars = detectSymmetricBlackSideBars(frames, probe.width, probe.height);
if (!bars) {
  throw new Error('No se detectó pillarbox negro simétrico persistente en E2/T5.');
}

const filter = buildPillarboxRepairFilter(bars, 1280, 720, 0.35);

console.log('\nVIRALCINE 4.1 — REPARACION PILLARBOX E2/T5');
console.log('Proyecto: ' + project.id);
console.log('Toma: E2/T5 ' + shot.id);
console.log('Fuente: ' + videoPath);
console.log('Duración: ' + probe.durationSeconds.toFixed(3) + 's');
console.log('Resolución: ' + probe.width + 'x' + probe.height);
console.log('Borde negro izquierdo persistente: ' + bars.left + 'px');
console.log('Borde negro derecho persistente: ' + bars.right + 'px');
console.log('Crop seguro: x=' + bars.cropX + ' width=' + bars.cropWidth);
console.log('Filtro FFmpeg: ' + filter);
console.log('Estrategia: recortar pillarbox -> escalar proporcionalmente -> crop 16:9 ligeramente sesgado hacia arriba.');

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: no modifica project.json ni media.');
  console.log('  OpenAI=NO | Veo=NO | ElevenLabs=NO | Fal=NO');
  console.log('  Gasto: US$0');
  console.log('SCENE2_T5_PILLARBOX_PREVIEW=PASS');
  process.exit(0);
}

const confirmation = rest.join(' ').trim();
if (confirmation !== '--confirm CORREGIR PILLARBOX E2 T5') {
  throw new Error('Aplicación bloqueada. Usa exactamente: --confirm CORREGIR PILLARBOX E2 T5');
}

const checkpointDir = path.join(root, 'checkpoints');
await mkdir(checkpointDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupProjectPath = path.join(
  checkpointDir,
  'project-before-e2-t5-pillarbox-' + stamp + '.json'
);
await copyFile(path.join(root, 'project.json'), backupProjectPath);

const archiveDir = path.join(
  checkpointDir,
  'source-e2-t5-before-pillarbox-fix-' + stamp
);
await mkdir(archiveDir, { recursive: true });
await copyFile(videoPath, path.join(archiveDir, 'base-real-with-pillarbox.mp4'));

const tempPath = path.join(path.dirname(videoPath), 'base-real.pillarbox-fixed.tmp.mp4');
await rm(tempPath, { force: true });

await runFfmpeg([
  '-y',
  '-i', videoPath,
  '-an',
  '-vf', filter,
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '18',
  '-r', '24',
  '-movflags', '+faststart',
  tempPath
]);

const repairedProbe = await probeVideo(tempPath);
if (repairedProbe.width !== 1280 || repairedProbe.height !== 720) {
  throw new Error('La reparación no produjo 1280x720.');
}

const repairedFrames: Uint8Array[] = [];
for (const time of sampleTimes) {
  repairedFrames.push(await captureGrayFrame(tempPath, time, repairedProbe.width, repairedProbe.height));
}
const remainingBars = detectSymmetricBlackSideBars(
  repairedFrames,
  repairedProbe.width,
  repairedProbe.height
);
if (remainingBars) {
  throw new Error(
    'La reparación todavía presenta pillarbox persistente: ' +
    remainingBars.left + 'px/' + remainingBars.right + 'px.'
  );
}

await rm(videoPath);
await rename(tempPath, videoPath);

project.productionLog.push(
  new Date().toISOString() +
  ' E2/T5 pillarbox corregido localmente sin API: ' +
  bars.left + 'px/' + bars.right + 'px -> full-frame 16:9.'
);
await saveProject(project);

console.log('\n==============================================');
console.log(' PILLARBOX E2/T5 CORREGIDO');
console.log('==============================================');
console.log('Video activo reemplazado por derivado 16:9 full-frame.');
console.log('Original archivado en: ' + archiveDir);
console.log('Backup project.json: ' + backupProjectPath);
console.log('Resolución final: 1280x720');
console.log('Pillarbox persistente: NO');
console.log('OpenAI=NO | Veo=NO | ElevenLabs=NO | Fal=NO');
console.log('Gasto adicional: US$0');
console.log('SCENE2_T5_PILLARBOX_APPLY=PASS');

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function probeVideo(filePath: string) {
  const output = await captureText(process.env.FFPROBE_PATH || 'ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration',
    '-of', 'json',
    filePath
  ]);
  const parsed = JSON.parse(output) as {
    streams?: Array<{ width?: number; height?: number }>;
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0];
  const durationSeconds = Number.parseFloat(parsed.format?.duration || '');
  if (!stream?.width || !stream.height || !Number.isFinite(durationSeconds)) {
    throw new Error('FFprobe no pudo inspeccionar el video.');
  }
  return {
    width: stream.width,
    height: stream.height,
    durationSeconds
  };
}

async function captureGrayFrame(
  filePath: string,
  timeSeconds: number,
  width: number,
  height: number
) {
  const buffer = await captureBuffer(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v', 'error',
    '-ss', Number(timeSeconds.toFixed(3)).toString(),
    '-i', filePath,
    '-frames:v', '1',
    '-vf', 'format=gray',
    '-f', 'rawvideo',
    'pipe:1'
  ]);
  const expected = width * height;
  if (buffer.length < expected) {
    throw new Error('FFmpeg devolvió un frame grayscale incompleto.');
  }
  return new Uint8Array(buffer.subarray(0, expected));
}

async function runFfmpeg(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('FFmpeg terminó con código ' + code + '. ' + stderr.slice(-1800)));
    });
  });
}

async function captureText(command: string, args: string[]) {
  const buffer = await captureBuffer(command, args);
  return buffer.toString('utf8');
}

async function captureBuffer(command: string, args: string[]) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    const chunks: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 6000) stderr = stderr.slice(-6000);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(command + ' terminó con código ' + code + '. ' + stderr.slice(-1200)));
    });
  });
}

function usage() {
  console.log('Uso:');
  console.log('  npm run scene2:t5-pillarbox -- preview <projectId>');
  console.log('  npm run scene2:t5-pillarbox -- apply <projectId> --confirm CORREGIR PILLARBOX E2 T5');
}
