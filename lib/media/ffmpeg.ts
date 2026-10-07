import { spawn } from 'node:child_process';
import { copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import type { FilmScene, ProjectInput } from '@/lib/domain/schemas';
import { probeVideo } from '@/lib/media/probe';

const ffmpeg = () => process.env.FFMPEG_PATH || 'ffmpeg';

export async function createPlaceholderImage(title: string, description: string, outputPath: string, input: ProjectInput) {
  const { width, height } = dimensions(input.aspectRatio);
  const png = createDemoPng(width, height, `${title}\n${description}`);
  await writeFile(outputPath, png);
  return outputPath;
}

export async function createSilenceAudio(durationSeconds: number, outputPath: string) {
  await run([
    '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', String(durationSeconds),
    '-c:a', 'libmp3lame', '-b:a', '128k', outputPath
  ]);
  return outputPath;
}

/**
 * Generates an audible deterministic signal for offline/demo speech segments.
 * This is intentionally NOT speech synthesis. Its purpose is to exercise the
 * complete audio transport, muxing, checkpoint and audible-audio validation
 * path without making any external or paid provider call.
 */
export async function createSyntheticSpeechAudio(durationSeconds: number, outputPath: string) {
  const duration = Math.max(0.25, durationSeconds);
  const fadeDuration = Math.min(0.05, duration / 4);
  const fadeOutStart = Math.max(0, duration - fadeDuration);
  await run([
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=620:sample_rate=48000',
    '-t', String(duration),
    '-af', `volume=0.25,afade=t=in:st=0:d=${fadeDuration},afade=t=out:st=${fadeOutStart}:d=${fadeDuration}`,
    '-ac', '2',
    '-c:a', 'libmp3lame',
    '-b:a', '128k',
    outputPath
  ]);
  return outputPath;
}

export async function renderAnimatedImage(
  imagePath: string,
  audioPath: string,
  durationSeconds: number,
  outputPath: string,
  aspectRatio: ProjectInput['aspectRatio']
) {
  const { width, height } = dimensions(aspectRatio);
  const frames = Math.max(1, durationSeconds * 25);
  const filter = [
    `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase`,
    `crop=${width * 2}:${height * 2}`,
    `zoompan=z='min(zoom+0.00035,1.08)':d=${frames}:s=${width}x${height}:fps=25`,
    'format=yuv420p'
  ].join(',');
  await run([
    '-y', '-loop', '1', '-i', imagePath, '-i', audioPath, '-t', String(durationSeconds),
    '-vf', filter, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'medium',
    '-crf', '20', '-r', '25', '-af', 'apad', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    outputPath
  ]);
  return outputPath;
}

export async function renderCinematicStillVideo(
  imagePath: string,
  durationSeconds: number,
  outputPath: string,
  aspectRatio: ProjectInput['aspectRatio']
) {
  const { width, height } = dimensions(aspectRatio);
  const frames = Math.max(1, Math.round(durationSeconds * 25));
  const filter = [
    `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase`,
    `crop=${width * 2}:${height * 2}`,
    `zoompan=z='min(zoom+0.00045,1.08)':d=${frames}:s=${width}x${height}:fps=25:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
    'format=yuv420p'
  ].join(',');

  await run([
    '-y',
    '-loop', '1',
    '-i', imagePath,
    '-t', String(durationSeconds),
    '-vf', filter,
    '-an',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '19',
    '-r', '25',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath
  ]);
  return outputPath;
}

export async function normalizeGeneratedVideo(
  videoPath: string,
  audioPath: string,
  durationSeconds: number,
  outputPath: string,
  aspectRatio: ProjectInput['aspectRatio']
) {
  const probe = await probeVideo(videoPath);
  const shortfallTolerance =
    durationSeconds < 0.5
      ? Math.max(0.08, durationSeconds * 0.2)
      : Math.max(0.25, durationSeconds * 0.05);
  const minimumVisualDuration = Math.max(0.12, durationSeconds - shortfallTolerance);

  if (
    !probe.hasVideo ||
    !Number.isFinite(probe.durationSeconds) ||
    probe.durationSeconds < minimumVisualDuration
  ) {
    throw new Error(
      `Video fuente demasiado corto para ${durationSeconds.toFixed(2)}s: ` +
      `${probe.durationSeconds.toFixed(2)}s disponibles, mínimo ${minimumVisualDuration.toFixed(2)}s. ` +
      'ViralCine no repetirá la escena como relleno.'
    );
  }

  const { width, height } = dimensions(aspectRatio);
  const filter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=25,format=yuv420p`;
  await run([
    '-y', '-i', videoPath, '-i', audioPath, '-t', String(durationSeconds),
    '-vf', filter, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'medium',
    '-crf', '20', '-af', 'apad', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', outputPath
  ]);
  return outputPath;
}

export async function normalizeGeneratedVideoWithEmbeddedAudio(
  videoPath: string,
  durationSeconds: number,
  outputPath: string,
  aspectRatio: ProjectInput['aspectRatio']
) {
  const probe = await probeVideo(videoPath);
  const shortfallTolerance =
    durationSeconds < 0.5
      ? Math.max(0.08, durationSeconds * 0.2)
      : Math.max(0.25, durationSeconds * 0.05);
  const minimumVisualDuration = Math.max(0.12, durationSeconds - shortfallTolerance);

  if (
    !probe.hasVideo ||
    !probe.hasAudio ||
    !Number.isFinite(probe.durationSeconds) ||
    probe.durationSeconds < minimumVisualDuration
  ) {
    throw new Error(
      `Lip-sync fuente inválido: video=${probe.hasVideo}, audio=${probe.hasAudio}, ` +
      `duración=${probe.durationSeconds.toFixed(2)}s, mínimo=${minimumVisualDuration.toFixed(2)}s. ` +
      'ViralCine no sustituirá ni desplazará el audio sincronizado por el proveedor.'
    );
  }

  const { width, height } = dimensions(aspectRatio);
  const filter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=25,format=yuv420p`;

  await run([
    '-y',
    '-i', videoPath,
    '-t', String(durationSeconds),
    '-vf', filter,
    '-map', '0:v:0',
    '-map', '0:a:0',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-af', 'apad',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    outputPath
  ]);

  return outputPath;
}

export async function concatenate(clips: string[], outputPath: string) {
  if (!clips.length) throw new Error('No existen clips para componer.');
  const listPath = path.join(path.dirname(outputPath), 'concat-list.txt');
  await writeFile(listPath, clips.map((clip) => `file '${clip.replaceAll("'", "'\\''")}'`).join('\n'), 'utf8');
  await run(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath]);
  return outputPath;
}

export async function mixBackgroundMusic(
  videoPath: string,
  musicPath: string,
  outputPath: string,
  offsetSeconds = 0
) {
  const safeOffset = Math.max(0, Number.isFinite(offsetSeconds) ? offsetSeconds : 0);
  await run([
    '-y',
    '-i', videoPath,
    '-stream_loop', '-1',
    '-ss', safeOffset.toFixed(3),
    '-i', musicPath,
    '-filter_complex',
    '[0:a]volume=1.0[voice];' +
    '[1:a]volume=0.12[music];' +
    '[music][voice]sidechaincompress=threshold=0.025:ratio=8:attack=20:release=350[ducked];' +
    '[voice][ducked]amix=inputs=2:duration=first:dropout_transition=2[mix];' +
    '[mix]loudnorm=I=-16:TP=-1.5:LRA=11[a]',
    '-map', '0:v:0',
    '-map', '[a]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    '-shortest',
    outputPath
  ]);
  return outputPath;
}

export async function createSubtitles(scenes: FilmScene[], outputPath: string) {
  let cursor = 0;
  let cue = 1;
  const blocks: string[] = [];
  for (const scene of scenes) {
    const text = [scene.narration, scene.dialogue].filter(Boolean).join(' ');
    const chunks = chunkSubtitle(text, 12);
    const secondsPerChunk = scene.durationSeconds / Math.max(1, chunks.length);
    chunks.forEach((chunk, index) => {
      const start = cursor + index * secondsPerChunk;
      const end = cursor + (index + 1) * secondsPerChunk;
      blocks.push(`${cue}\n${srtTime(start)} --> ${srtTime(end)}\n${chunk}\n`);
      cue += 1;
    });
    cursor += scene.durationSeconds;
  }
  await writeFile(outputPath, blocks.join('\n'), 'utf8');
  return outputPath;
}

export async function burnSubtitles(videoPath: string, subtitlePath: string, outputPath: string) {
  const escaped = subtitlePath.replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "\\'");
  const style = 'FontName=Arial,FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H00101010,BorderStyle=1,Outline=2,Shadow=1,MarginV=42,Alignment=2';
  await run([
    '-y', '-i', videoPath, '-vf', `subtitles='${escaped}':force_style='${style}'`,
    '-c:v', 'libx264', '-crf', '19', '-preset', 'medium', '-c:a', 'copy', outputPath
  ]);
  return outputPath;
}

export async function copyMedia(source: string, destination: string) {
  await copyFile(source, destination);
  return destination;
}

export async function normalizeReferenceImage(
  imagePath: string,
  outputPath: string,
  aspectRatio: ProjectInput['aspectRatio']
) {
  const { width, height } = dimensions(aspectRatio);
  await run([
    '-y',
    '-i', imagePath,
    '-frames:v', '1',
    '-vf',
    'scale=' + width + ':' + height + ':force_original_aspect_ratio=increase,crop=' + width + ':' + height,
    outputPath
  ]);
  return outputPath;
}

export async function extractLastFrame(
  videoPath: string,
  outputPath: string,
  aspectRatio: ProjectInput['aspectRatio']
) {
  const { width, height } = dimensions(aspectRatio);
  await run([
    '-y',
    '-sseof', '-0.12',
    '-i', videoPath,
    '-frames:v', '1',
    '-vf',
    'scale=' + width + ':' + height + ':force_original_aspect_ratio=increase,crop=' + width + ':' + height,
    outputPath
  ]);
  return outputPath;
}

export async function createSceneContactSheet(videoPath: string, durationSeconds: number, outputPath: string) {
  const timestamps = [0.2, 0.5, 0.8].map((position) => Math.max(0, durationSeconds * position));
  await run([
    '-y',
    '-ss', String(timestamps[0]), '-i', videoPath,
    '-ss', String(timestamps[1]), '-i', videoPath,
    '-ss', String(timestamps[2]), '-i', videoPath,
    '-filter_complex',
    '[0:v]scale=480:-2[a];[1:v]scale=480:-2[b];[2:v]scale=480:-2[c];[a][b][c]hstack=inputs=3[out]',
    '-map', '[out]', '-frames:v', '1', '-q:v', '3', outputPath
  ]);
  return outputPath;
}

async function run(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpeg(), args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 12_000) stderr = stderr.slice(-12_000);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg terminó con código ${code}. ${stderr.slice(-1800)}`));
    });
  });
}

function dimensions(aspectRatio: ProjectInput['aspectRatio']) {
  return aspectRatio === '9:16' ? { width: 720, height: 1280 } : { width: 1280, height: 720 };
}

function srtTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.round((seconds - Math.floor(seconds)) * 1000);
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${String(milliseconds).padStart(3, '0')}`;
}

const pad = (value: number) => String(value).padStart(2, '0');
function chunkSubtitle(text: string, maxWords: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += maxWords) {
    const group = words.slice(index, index + maxWords);
    const split = Math.ceil(group.length / 2);
    chunks.push(group.length > 7 ? `${group.slice(0, split).join(' ')}\n${group.slice(split).join(' ')}` : group.join(' '));
  }
  return chunks;
}

/**
 * Creates a dependency-free PNG placeholder. Demo images used to be SVG, but
 * common Windows FFmpeg builds do not ship an SVG decoder. PNG works on every
 * supported FFmpeg build and can also be displayed directly by the browser.
 */
function createDemoPng(width: number, height: number, seedText: string) {
  const rowBytes = width * 4 + 1;
  const pixels = Buffer.alloc(rowBytes * height);
  const seed = hashText(seedText);
  const accentR = 82 + (seed & 63);
  const accentG = 48 + ((seed >>> 6) & 63);
  const accentB = 148 + ((seed >>> 12) & 79);
  const orbX = width * (0.68 + ((seed >>> 20) & 7) / 50);
  const orbY = height * (0.18 + ((seed >>> 24) & 7) / 55);
  const orbRadius = Math.min(width, height) * 0.33;

  for (let y = 0; y < height; y += 1) {
    const row = y * rowBytes;
    pixels[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4;
      const diagonal = (x / width + y / height) / 2;
      const distance = Math.hypot(x - orbX, y - orbY);
      const glow = Math.max(0, 1 - distance / orbRadius);
      const vignette = Math.max(0.56, 1 - 0.46 * Math.hypot(x / width - 0.5, y / height - 0.5));
      pixels[offset] = clamp((8 + diagonal * 12 + glow * accentR * 0.28) * vignette);
      pixels[offset + 1] = clamp((12 + diagonal * 10 + glow * accentG * 0.2) * vignette);
      pixels[offset + 2] = clamp((28 + diagonal * 25 + glow * accentB * 0.34) * vignette);
      pixels[offset + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(pixels, { level: 7 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function pngChunk(type: string, data: Buffer) {
  const name = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([name, data]);
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(payload), data.length + 8);
  return chunk;
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
