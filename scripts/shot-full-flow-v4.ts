import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { getProject } from '@/lib/storage/project-store';

loadProjectLocalEnvOverride();

const [command, projectId, shotId, ...rest] = process.argv.slice(2);
if (!command || !projectId || !shotId || !['preview', 'run'].includes(command)) {
  usage();
  process.exit(1);
}

const project = await getProject(projectId);
if (!project.plan) throw new Error('El proyecto no tiene plan.');

let shot:
  | NonNullable<typeof project.plan>['scenes'][number]['shots'][number]
  | undefined;

for (const scene of project.plan.scenes) {
  const found = scene.shots.find((item) => item.id === shotId);
  if (found) {
    shot = found;
    break;
  }
}

if (!shot) throw new Error("No existe la toma '" + shotId + "'.");

const script = shot.dialogueLines.length > 1
  ? 'segmented-full-flow-v4.ts'
  : 'single-full-flow-v4.ts';

console.log('\nVIRALCINE 4.2 — SHOT FULL FLOW');
console.log('Ruta seleccionada: ' + (
  shot.dialogueLines.length > 1 ? 'SEGMENTADA/MULTIHABLANTE' : 'SINGLE'
));

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(currentDir, script);

const code = await runChild([
  '--import',
  'tsx',
  scriptPath,
  command,
  projectId,
  shotId,
  ...rest
]);

process.exit(code);

async function runChild(args: string[]) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: 'inherit',
      windowsHide: true,
      env: process.env
    });
    child.once('error', reject);
    child.once('close', (value) => resolve(value ?? 1));
  });
}

function usage() {
  console.log('Uso:');
  console.log('  npm run shot:full -- preview <projectId> <shotId>');
  console.log('  npm run shot:full -- run <projectId> <shotId> --confirm-paid SI FULL FLOW');
}
