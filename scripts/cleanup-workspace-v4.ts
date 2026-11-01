import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

const removablePaths = [
  '.next',
  'coverage',
  'dist',
  'out',
  'logs',
  'reports',
  '.diagnostics',
  '.data-smoke',
  '.data-smoke-v4',
  path.join('node_modules', '.cache')
];

const removed: string[] = [];
const missing: string[] = [];

for (const relativePath of removablePaths) {
  const absolutePath = path.join(root, relativePath);
  try {
    await rm(absolutePath, { recursive: true, force: false });
    removed.push(relativePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      missing.push(relativePath);
      continue;
    }
    throw error;
  }
}

for (const entry of await readdir(root)) {
  if (!entry.endsWith('.tsbuildinfo')) continue;
  await rm(path.join(root, entry), { force: true });
  removed.push(entry);
}

console.log('\nVIRALCINE 4.2 — LIMPIEZA DE WORKSPACE');
console.log('Eliminados: ' + removed.length);
for (const item of removed) console.log('  - ' + item);

console.log('Ya ausentes: ' + missing.length);
for (const item of missing) console.log('  - ' + item);

console.log('\nPRESERVADO EXPRESAMENTE');
console.log('  - .data/           (proyectos, masters, checkpoints, ledger)');
console.log('  - .env.local       (credenciales locales)');
console.log('  - node_modules/    (dependencias instaladas)');
console.log('  - código fuente y tests');
console.log('  - exports finales');

console.log('\nCLEANUP_WORKSPACE_4_2=PASS');
