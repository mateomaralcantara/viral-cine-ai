import { spawn } from 'node:child_process';

export async function checkFfmpeg() {
  return new Promise<boolean>((resolve) => {
    const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', ['-version'], { windowsHide: true, stdio: 'ignore' });
    child.once('error', () => resolve(false));
    child.once('close', (code) => resolve(code === 0));
  });
}
