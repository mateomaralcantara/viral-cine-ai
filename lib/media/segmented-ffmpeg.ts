import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import type { ProjectInput } from '@/lib/domain/schemas';

const ffmpeg = () => process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = () => process.env.FFPROBE_PATH || 'ffprobe';

export async function extractVideoOnlySegment(
  sourcePath: string,
  startSeconds: number,
  durationSeconds: number,
  outputPath: string,
  aspectRatio: ProjectInput['aspectRatio']
) {
  if (startSeconds < 0) throw new Error('El inicio del subsegmento no puede ser negativo.');
  if (durationSeconds <= 0) throw new Error('La duración del subsegmento debe ser positiva.');
  await mkdir(path.dirname(outputPath), { recursive: true });
  const { width, height } = dimensions(aspectRatio);
  const filter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=25,format=yuv420p`;
  await run(ffmpeg(), [
    '-y',
    '-ss', seconds(startSeconds),
    '-i', sourcePath,
    '-t', seconds(durationSeconds),
    '-an',
    '-vf', filter,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-r', '25',
    outputPath
  ]);
  return outputPath;
}

export async function muxSegmentAudio(
  videoPath: string,
  audioPath: string,
  durationSeconds: number,
  outputPath: string,
  aspectRatio: ProjectInput['aspectRatio']
) {
  if (durationSeconds <= 0) throw new Error('La duración del subsegmento debe ser positiva.');
  await mkdir(path.dirname(outputPath), { recursive: true });
  const { width, height } = dimensions(aspectRatio);
  const filter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=25,format=yuv420p`;
  await run(ffmpeg(), [
    '-y',
    '-i', videoPath,
    '-i', audioPath,
    '-t', seconds(durationSeconds),
    '-vf', filter,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-r', '25',
    '-af', 'apad',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    outputPath
  ]);
  return outputPath;
}

export async function probeMediaDurationSeconds(filePath: string) {
  const output = await capture(ffprobe(), [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath
  ]);
  const duration = Number.parseFloat(output.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`FFprobe no pudo leer una duración válida para ${filePath}.`);
  }
  return duration;
}

function dimensions(aspectRatio: ProjectInput['aspectRatio']) {
  return aspectRatio === '9:16' ? { width: 720, height: 1280 } : { width: 1280, height: 720 };
}

function seconds(value: number) {
  return Number(value.toFixed(6)).toString();
}

async function run(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 12_000) stderr = stderr.slice(-12_000);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} terminó con código ${code}. ${stderr.slice(-1800)}`));
    });
  });
}

async function capture(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 6000) stderr = stderr.slice(-6000);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} terminó con código ${code}. ${stderr.slice(-1200)}`));
    });
  });
}
