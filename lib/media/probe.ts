import { spawn } from 'node:child_process';
import path from 'node:path';

export type VideoProbe = {
  durationSeconds: number;
  hasVideo: boolean;
  hasAudio: boolean;
};

export type SceneVideoValidationOptions = {
  requireMotion?: boolean;
  requireAudibleAudio?: boolean;
};

export async function probeVideo(filePath: string): Promise<VideoProbe> {
  const output = await runProbe([
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_type',
    '-of', 'json',
    filePath
  ]);
  const parsed = JSON.parse(output) as {
    format?: { duration?: string | number };
    streams?: Array<{ codec_type?: string }>;
  };
  const durationSeconds = Number(parsed.format?.duration || 0);
  const streamTypes = new Set((parsed.streams || []).map((stream) => stream.codec_type));
  return {
    durationSeconds,
    hasVideo: streamTypes.has('video'),
    hasAudio: streamTypes.has('audio')
  };
}

export async function assertPlayableSceneVideo(filePath: string, expectedSeconds: number) {
  const probe = await probeVideo(filePath);
  const tolerance = Math.max(1.5, expectedSeconds * 0.03);
  const minimumDuration = Math.max(0.5, expectedSeconds - tolerance);
  if (!probe.hasVideo || !probe.hasAudio || !Number.isFinite(probe.durationSeconds) || probe.durationSeconds < minimumDuration) {
    throw new Error(
      `Clip incompleto: video=${probe.hasVideo}, audio=${probe.hasAudio}, duracion=${probe.durationSeconds.toFixed(2)}s, minimo=${minimumDuration.toFixed(2)}s.`
    );
  }
  return probe;
}

export async function assertCinematicSceneVideo(
  filePath: string,
  expectedSeconds: number,
  options: SceneVideoValidationOptions = {}
) {
  const probe = await assertPlayableSceneVideo(filePath, expectedSeconds);
  if (options.requireMotion) {
    const analysis = await analyzeFrames(filePath);
    const blackRatio = analysis.blackSeconds / Math.max(0.1, probe.durationSeconds);
    const freezeRatio = analysis.freezeSeconds / Math.max(0.1, probe.durationSeconds);
    const blackLimit = numberEnv('BLACK_FRAME_MAX_RATIO', 0.35, 0.05, 0.95);
    const freezeLimit = numberEnv('FREEZE_FRAME_MAX_RATIO', 0.60, 0.10, 0.98);
    if (blackRatio > blackLimit) {
      throw new Error(
        `Video rechazado antes de calidad: ${Math.round(blackRatio * 100)}% del clip esta negro ` +
        `(limite ${Math.round(blackLimit * 100)}%). No se guardara como una escena valida.`
      );
    }
    if (freezeRatio > freezeLimit) {
      throw new Error(
        `Video rechazado antes de calidad: ${Math.round(freezeRatio * 100)}% del clip esta congelado ` +
        `(limite ${Math.round(freezeLimit * 100)}%). No se guardara como una escena valida.`
      );
    }
  }

  if (options.requireAudibleAudio) {
    const meanVolume = await analyzeAudio(filePath);
    const minimumVolume = numberEnv('MIN_DIALOGUE_MEAN_DB', -48, -80, -10);
    if (!Number.isFinite(meanVolume) || meanVolume < minimumVolume) {
      throw new Error(
        `Video rechazado antes de calidad: el dialogo esta silencioso o inaudible ` +
        `(volumen medio ${Number.isFinite(meanVolume) ? `${meanVolume.toFixed(1)} dB` : '-inf dB'}).`
      );
    }
  }
  return probe;
}

function ffprobeExecutable() {
  if (process.env.FFPROBE_PATH) return process.env.FFPROBE_PATH;
  const configuredFfmpeg = process.env.FFMPEG_PATH;
  if (configuredFfmpeg && path.isAbsolute(configuredFfmpeg)) {
    return path.join(path.dirname(configuredFfmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  }
  return process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
}

function ffmpegExecutable() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

async function analyzeFrames(filePath: string) {
  const output = await runFfmpeg([
    '-hide_banner', '-nostdin', '-i', filePath,
    '-vf', 'blackdetect=d=0.5:pix_th=0.10,freezedetect=n=-50dB:d=1.5',
    '-an', '-f', 'null', '-'
  ]);
  const blackSeconds = sumMatches(output, /black_duration:([0-9.]+)/g);
  const freezeSeconds = sumMatches(output, /freeze_duration:([0-9.]+)/g);
  return { blackSeconds, freezeSeconds };
}

async function analyzeAudio(filePath: string) {
  const output = await runFfmpeg([
    '-hide_banner', '-nostdin', '-i', filePath,
    '-vn', '-af', 'volumedetect', '-f', 'null', '-'
  ]);
  const matches = [...output.matchAll(/mean_volume:\s*(-?inf|-?[0-9.]+)\s*dB/gi)];
  const value = matches.at(-1)?.[1];
  return value?.toLowerCase() === '-inf' || value === undefined ? Number.NEGATIVE_INFINITY : Number(value);
}

function sumMatches(input: string, pattern: RegExp) {
  return [...input.matchAll(pattern)].reduce((total, match) => total + Number(match[1] || 0), 0);
}

function numberEnv(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, value));
}

async function runProbe(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(ffprobeExecutable(), args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 8_000) stderr = stderr.slice(-8_000);
    });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) resolve(stdout);
      else reject(new Error(`ffprobe termino con codigo ${code}. ${stderr.slice(-1200)}`));
    });
  });
}

async function runFfmpeg(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(ffmpegExecutable(), args, { windowsHide: true });
    let output = '';
    let settled = false;
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
      if (output.length > 80_000) output = output.slice(-80_000);
    });
    child.stderr.on('data', (chunk) => {
      output += String(chunk);
      if (output.length > 80_000) output = output.slice(-80_000);
    });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) resolve(output);
      else reject(new Error(`ffmpeg termino con codigo ${code}. ${output.slice(-1200)}`));
    });
  });
}
