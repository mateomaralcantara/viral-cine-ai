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


export async function assertCinematicVideoTrack(filePath: string, expectedSeconds: number) {
  const probe = await probeVideo(filePath);
  const tolerance = Math.max(1.5, expectedSeconds * 0.03);
  const minimumDuration = Math.max(0.5, expectedSeconds - tolerance);
  if (!probe.hasVideo || !Number.isFinite(probe.durationSeconds) || probe.durationSeconds < minimumDuration) {
    throw new Error(
      `Fuente visual incompleta: video=${probe.hasVideo}, duracion=${probe.durationSeconds.toFixed(2)}s, minimo=${minimumDuration.toFixed(2)}s.`
    );
  }

  const analysis = await analyzeFrames(filePath);
  const blackRatio = analysis.blackSeconds / Math.max(0.1, probe.durationSeconds);
  const freezeRatio = analysis.freezeSeconds / Math.max(0.1, probe.durationSeconds);
  const blackLimit = numberEnv('BLACK_FRAME_MAX_RATIO', 0.35, 0.05, 0.95);
  const freezeLimit = numberEnv('FREEZE_FRAME_MAX_RATIO', 0.60, 0.10, 0.98);

  if (blackRatio > blackLimit) {
    throw new Error(
      `Fuente visual rechazada: ${Math.round(blackRatio * 100)}% del clip esta negro/oscuro ` +
      `(limite ${Math.round(blackLimit * 100)}%). No se usara como video base real.`
    );
  }
  if (freezeRatio > freezeLimit) {
    throw new Error(
      `Fuente visual rechazada: ${Math.round(freezeRatio * 100)}% del clip esta congelado ` +
      `(limite ${Math.round(freezeLimit * 100)}%). No se usara como video base real.`
    );
  }

  const detail = await analyzeVisualDetail(filePath);
  const minStdDev = numberEnv('MIN_VISUAL_LUMA_STDDEV', 7, 1, 60);
  const minEdgeMean = numberEnv('MIN_VISUAL_EDGE_MEAN', 0.75, 0.05, 20);
  if (detail.lumaStdDev < minStdDev && detail.edgeMean < minEdgeMean) {
    throw new Error(
      `Fuente visual rechazada: contenido de muy baja informacion visual ` +
      `(desviacion luma ${detail.lumaStdDev.toFixed(2)}, detalle ${detail.edgeMean.toFixed(2)}). ` +
      'Parece un fondo/placeholder y no una escena cinematografica.'
    );
  }

  return { ...probe, blackRatio, freezeRatio, ...detail };
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

async function analyzeVisualDetail(filePath: string) {
  const width = 96;
  const height = 54;
  const frameBytes = width * height;
  const raw = await runFfmpegBinary([
    '-hide_banner', '-nostdin', '-i', filePath,
    '-vf', `fps=1,scale=${width}:${height}:flags=area,format=gray`,
    '-frames:v', '8',
    '-an', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'
  ]);

  const frameCount = Math.floor(raw.length / frameBytes);
  if (frameCount < 1) {
    throw new Error('No se pudieron muestrear fotogramas para validar la informacion visual.');
  }

  let stdTotal = 0;
  let edgeTotal = 0;
  let meanTotal = 0;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const frame = raw.subarray(frameIndex * frameBytes, (frameIndex + 1) * frameBytes);
    let sum = 0;
    for (const value of frame) sum += value;
    const mean = sum / frame.length;
    meanTotal += mean;

    let variance = 0;
    let edge = 0;
    let edgeSamples = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const value = frame[index];
        const delta = value - mean;
        variance += delta * delta;
        if (x > 0) {
          edge += Math.abs(value - frame[index - 1]);
          edgeSamples += 1;
        }
        if (y > 0) {
          edge += Math.abs(value - frame[index - width]);
          edgeSamples += 1;
        }
      }
    }
    stdTotal += Math.sqrt(variance / frame.length);
    edgeTotal += edge / Math.max(1, edgeSamples);
  }

  return {
    sampledFrames: frameCount,
    meanLuma: meanTotal / frameCount,
    lumaStdDev: stdTotal / frameCount,
    edgeMean: edgeTotal / frameCount
  };
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

async function runFfmpegBinary(args: string[]) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(ffmpegExecutable(), args, { windowsHide: true });
    const chunks: Buffer[] = [];
    let stderr = '';
    let settled = false;
    child.stdout.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
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
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg termino con codigo ${code}. ${stderr.slice(-1200)}`));
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
