import { copyFile, mkdir, rename, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  buildPillarboxRepairFilter,
  detectSymmetricBlackSideBars,
  type SymmetricSideBars
} from '@/lib/media/pillarbox';

export type PillarboxInspection = {
  width: number;
  height: number;
  durationSeconds: number;
  bars?: SymmetricSideBars;
};

export async function inspectPersistentPillarbox(
  videoPath: string
): Promise<PillarboxInspection> {
  const probe = await probeVideo(videoPath);
  const sampleTimes = [
    Math.min(0.5, probe.durationSeconds * 0.1),
    Math.max(0, probe.durationSeconds * 0.5),
    Math.max(0, probe.durationSeconds - 0.5)
  ];

  const frames: Uint8Array[] = [];
  for (const time of sampleTimes) {
    frames.push(
      await captureGrayFrame(
        videoPath,
        time,
        probe.width,
        probe.height
      )
    );
  }

  return {
    ...probe,
    bars: detectSymmetricBlackSideBars(
      frames,
      probe.width,
      probe.height
    )
  };
}

export async function repairPersistentPillarboxInPlace(
  videoPath: string,
  archivePath: string,
  targetWidth: number,
  targetHeight: number,
  verticalBias = 0.35
) {
  const inspection = await inspectPersistentPillarbox(videoPath);
  if (!inspection.bars) {
    return {
      repaired: false,
      before: inspection,
      after: inspection
    };
  }

  await mkdir(path.dirname(archivePath), { recursive: true });
  await copyFile(videoPath, archivePath);

  const filter = buildPillarboxRepairFilter(
    inspection.bars,
    targetWidth,
    targetHeight,
    verticalBias
  );
  const tempPath = videoPath + '.pillarbox-fixed.tmp.mp4';
  await rm(tempPath, { force: true });

  await run([
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

  const after = await inspectPersistentPillarbox(tempPath);
  if (after.width !== targetWidth || after.height !== targetHeight) {
    await rm(tempPath, { force: true });
    throw new Error(
      'La reparación de pillarbox produjo ' +
      after.width + 'x' + after.height +
      ' en vez de ' + targetWidth + 'x' + targetHeight + '.'
    );
  }
  if (after.bars) {
    await rm(tempPath, { force: true });
    throw new Error(
      'La reparación de pillarbox no eliminó los bordes persistentes.'
    );
  }

  await rm(videoPath);
  await rename(tempPath, videoPath);

  return {
    repaired: true,
    before: inspection,
    after,
    filter,
    archivePath
  };
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

async function run(args: string[]) {
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
  return (await captureBuffer(command, args)).toString('utf8');
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
