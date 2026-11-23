import { mkdir, rm, writeFile } from 'node:fs/promises';
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

export async function extractVideoOnlySegmentWithTailHold(
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
  const filter = [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    'fps=25',
    // Si el audio necesita unas décimas adicionales, congela únicamente
    // el último fotograma en lugar de repetir el clip desde el inicio.
    `tpad=stop_mode=clone:stop_duration=${seconds(durationSeconds + 0.5)}`,
    'format=yuv420p'
  ].join(',');
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

export async function fitAudioToSlot(
  audioPath: string,
  speedFactor: number,
  durationSeconds: number,
  outputPath: string
) {
  if (durationSeconds <= 0) throw new Error('La duración destino del audio debe ser positiva.');
  if (!Number.isFinite(speedFactor) || speedFactor < 1 || speedFactor > 1.3305) {
    throw new Error('Factor de velocidad fuera del límite duro 1.0x-1.33x: ' + speedFactor);
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  const tempo = Math.max(1, Math.min(1.33, speedFactor));
  await run(ffmpeg(), [
    '-y',
    '-i', audioPath,
    '-af', 'atempo=' + seconds(tempo) + ',apad',
    '-t', seconds(durationSeconds),
    '-ar', '48000',
    '-ac', '2',
    '-c:a', 'pcm_s16le',
    outputPath
  ]);
  return outputPath;
}

export async function concatenateAudioSegments(audioPaths: string[], outputPath: string) {
  if (!audioPaths.length) throw new Error('No existen audios para recomponer.');
  await mkdir(path.dirname(outputPath), { recursive: true });
  const listPath = path.join(path.dirname(outputPath), 'audio-concat-' + process.pid + '.txt');
  await writeFile(
    listPath,
    audioPaths.map((audio) => "file '" + audio.replaceAll("'", "'\\''") + "'").join('\n'),
    'utf8'
  );
  try {
    await run(ffmpeg(), [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-ar', '48000',
      '-ac', '2',
      '-c:a', 'pcm_s16le',
      outputPath
    ]);
  } finally {
    await rm(listPath, { force: true });
  }
  return outputPath;
}

export type VideoStreamInfo = {
  hasVideo: boolean;
  codecName?: string;
  width?: number;
  height?: number;
  pixelFormat?: string;
  avgFrameRate?: string;
};

export async function probeVideoStreamInfo(filePath: string): Promise<VideoStreamInfo> {
  const output = await capture(ffprobe(), [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height,pix_fmt,avg_frame_rate',
    '-of', 'json',
    filePath
  ]);
  const parsed = JSON.parse(output) as {
    streams?: Array<{
      codec_name?: string;
      width?: number;
      height?: number;
      pix_fmt?: string;
      avg_frame_rate?: string;
    }>;
  };
  const stream = parsed.streams?.[0];
  if (!stream) return { hasVideo: false };
  return {
    hasVideo: true,
    codecName: stream.codec_name,
    width: stream.width,
    height: stream.height,
    pixelFormat: stream.pix_fmt,
    avgFrameRate: stream.avg_frame_rate
  };
}

export async function assertVideoStream(filePath: string, label: string) {
  const info = await probeVideoStreamInfo(filePath);
  if (!info.hasVideo || !info.width || !info.height) {
    throw new Error(label + ': el archivo no contiene una pista de video reproducible.');
  }
  return info;
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
