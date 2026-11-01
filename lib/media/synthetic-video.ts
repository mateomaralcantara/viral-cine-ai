import { spawn } from 'node:child_process';
import type { ProjectInput } from '@/lib/domain/schemas';
import { runFakeProviderStage } from '@/lib/providers/fake-cinema';

const ffmpeg = () => process.env.FFMPEG_PATH || 'ffmpeg';

export async function createSyntheticMotionVideo(
  durationSeconds: number,
  outputPath: string,
  aspectRatio: ProjectInput['aspectRatio']
) {
  return runFakeProviderStage('video', outputPath, async () => {
    const { width, height } = aspectRatio === '9:16'
      ? { width: 720, height: 1280 }
      : { width: 1280, height: 720 };
    const source = `testsrc2=size=${width}x${height}:rate=25`;
    await run([
      '-y',
      '-f', 'lavfi',
      '-i', source,
      '-t', String(durationSeconds),
      '-vf', 'format=yuv420p',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-an',
      outputPath
    ]);
    return outputPath;
  });
}

async function run(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpeg(), args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 6000) stderr = stderr.slice(-6000);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg simulador terminó con código ${code}. ${stderr.slice(-1200)}`));
    });
  });
}
