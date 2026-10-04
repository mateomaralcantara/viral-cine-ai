import { appendFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { getProject, projectRoot } from '@/lib/storage/project-store';
import {
  buildBatchQueue,
  canFitBatchBudget,
  formatBatchMachineSummary,
  isFullFlow42Complete,
  roundMoney
} from '@/lib/engine/batch-full-flow-v4';
import { inspectProjectMusic } from '@/lib/engine/project-music-v4';

loadProjectLocalEnvOverride();

const [command, projectId, ...rest] = process.argv.slice(2);

if (!command || !projectId || !['preview', 'run'].includes(command)) {
  usage();
  process.exit(1);
}

const options = parseOptions(rest);
const initialProject = await getProject(projectId);
if (!initialProject.plan) throw new Error('El proyecto no tiene plan.');

const music = await inspectProjectMusic(initialProject);
const queue = buildBatchQueue(initialProject, {
  maxShots: options.maxShots,
  sceneOrder: options.sceneOrder,
  fromShotId: options.fromShotId
});

console.log('\n==================================================');
console.log(' VIRALCINE 4.2 — BATCH FULL FLOW');
console.log('==================================================');
console.log('Proyecto: ' + initialProject.id + ' — ' + initialProject.input.title);
console.log('Tomas pendientes seleccionadas: ' + queue.length);
console.log('Límite de tomas: ' + (options.maxShots ?? 'TODAS'));
console.log('Escena: ' + (options.sceneOrder ?? 'TODAS'));
console.log('Desde toma: ' + (options.fromShotId ?? 'INICIO'));
console.log('Música: ' + (
  !music.enabled ? 'DESHABILITADA' :
  music.ready ? 'LISTA/REUTILIZABLE' : 'PENDIENTE'
));
console.log('Costo música pendiente único: US$' + music.estimatedUsd.toFixed(4));

if (!queue.length) {
  console.log('\nNo hay tomas pendientes en el alcance seleccionado.');
  console.log(command === 'preview' ? 'BATCH_FULL_PREVIEW=PASS' : 'BATCH_FULL_RUN=PASS');
  process.exit(0);
}

console.log('\nAnalizando preflight por toma...');
const preflightRows: Array<{
  sceneOrder: number;
  shotOrder: number;
  shotId: string;
  title: string;
  kind: string;
  estimatedUsd: number;
  pass: boolean;
  reason?: string;
}> = [];

let totalEstimatedUsd = 0;
let musicCounted = false;

for (const item of queue) {
  const result = await previewShot(projectId, item.shotId);
  let normalizedCost = result.estimatedUsd;

  // Cada preview individual incluye la música pendiente del proyecto.
  // En un batch solo se genera una vez.
  if (music.enabled && !music.ready && music.estimatedUsd > 0) {
    if (musicCounted) {
      normalizedCost = Math.max(0, normalizedCost - music.estimatedUsd);
    } else {
      musicCounted = true;
    }
  }

  normalizedCost = roundMoney(normalizedCost);
  totalEstimatedUsd = roundMoney(totalEstimatedUsd + normalizedCost);

  preflightRows.push({
    ...item,
    estimatedUsd: normalizedCost,
    pass: result.pass,
    reason: result.reason
  });

  const label =
    'E' + item.sceneOrder + '/T' + item.shotOrder +
    ' [' + item.kind + '] ' +
    (result.pass ? 'PASS' : 'BLOCKED') +
    ' US$' + normalizedCost.toFixed(4) +
    ' — ' + item.title;

  console.log('  ' + label);
  if (result.reason) console.log('    ' + result.reason);
}

const blocked = preflightRows.filter((row) => !row.pass);

console.log('\nRESUMEN BATCH');
console.log('  Tomas seleccionadas: ' + preflightRows.length);
console.log('  Preflight PASS: ' + (preflightRows.length - blocked.length));
console.log('  Bloqueadas: ' + blocked.length);
console.log('  Costo máximo estimado del lote: US$' + totalEstimatedUsd.toFixed(4));

// Salida estable ASCII para automatizaciones externas (PowerShell/CI).
// No depende de tildes ni de la codificación de la consola de Windows.
for (const line of formatBatchMachineSummary({
  selectedShots: preflightRows.length,
  preflightPass: preflightRows.length - blocked.length,
  blocked: blocked.length,
  estimatedUsd: totalEstimatedUsd
})) {
  console.log(line);
}

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA');
  console.log('  APIs externas: NO');
  console.log('  Gasto: US$0');
  console.log(blocked.length ? 'BATCH_FULL_PREVIEW=BLOCKED' : 'BATCH_FULL_PREVIEW=PASS');
  process.exit(blocked.length ? 2 : 0);
}

if (!options.confirmPaid) {
  throw new Error(
    'Ejecución pagada bloqueada. Usa exactamente: ' +
    '--confirm-paid SI BATCH FULL --max-usd <monto> --max-shots <cantidad>'
  );
}

if (options.maxUsd === undefined || options.maxUsd <= 0) {
  throw new Error('BATCH run requiere --max-usd con un monto mayor que cero.');
}

if (options.maxShots === undefined || options.maxShots <= 0) {
  throw new Error('BATCH run requiere --max-shots con una cantidad mayor que cero.');
}

if (blocked.length) {
  throw new Error(
    'BATCH bloqueado: ' + blocked.length +
    ' toma(s) no pasaron preflight. No se ejecutó ninguna API pagada.'
  );
}

if (totalEstimatedUsd > options.maxUsd) {
  throw new Error(
    'BATCH cancelado antes de gastar: estimado US$' +
    totalEstimatedUsd.toFixed(4) +
    ' supera --max-usd US$' + options.maxUsd.toFixed(4) + '.'
  );
}

const journalDir = path.join(projectRoot(projectId), 'checkpoints', 'batch-v4');
await mkdir(journalDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const journalPath = path.join(journalDir, 'batch-' + stamp + '.jsonl');

console.log('\n==================================================');
console.log(' BATCH REAL AUTORIZADO');
console.log('==================================================');
console.log('Máximo de tomas: ' + options.maxShots);
console.log('Presupuesto máximo: US$' + options.maxUsd.toFixed(4));
console.log('Estimado inicial: US$' + totalEstimatedUsd.toFixed(4));
console.log('Journal: ' + journalPath);

let reservedUsd = 0;
let completed = 0;
let skipped = 0;

for (const item of queue) {
  const currentProject = await getProject(projectId);
  const currentShot = findShot(currentProject, item.shotId);

  if (!currentShot) {
    await journal(journalPath, {
      state: 'failed',
      shotId: item.shotId,
      reason: 'shot-not-found'
    });
    throw new Error('La toma desapareció del proyecto: ' + item.shotId);
  }

  if (isFullFlow42Complete(currentShot)) {
    skipped += 1;
    console.log(
      '\nSKIP E' + item.sceneOrder + '/T' + item.shotOrder +
      ': ya está completa en 4.2.'
    );
    await journal(journalPath, {
      state: 'skipped',
      shotId: item.shotId,
      reason: 'already-4.2'
    });
    continue;
  }

  const fresh = await previewShot(projectId, item.shotId);
  if (!fresh.pass) {
    await journal(journalPath, {
      state: 'blocked',
      shotId: item.shotId,
      reason: fresh.reason || 'preview-failed'
    });
    throw new Error(
      'BATCH detenido antes del gasto en E' +
      item.sceneOrder + '/T' + item.shotOrder +
      ': ' + (fresh.reason || 'preflight bloqueado')
    );
  }

  let shotCost = fresh.estimatedUsd;
  const freshMusic = await inspectProjectMusic(await getProject(projectId));
  if (freshMusic.enabled && !freshMusic.ready && freshMusic.estimatedUsd > 0) {
    // La música se cobrará como máximo una vez; el preview de la toma ya la incluye.
  }

  shotCost = roundMoney(shotCost);

  if (!canFitBatchBudget(reservedUsd, shotCost, options.maxUsd)) {
    console.log('\nBATCH detenido limpiamente por límite de presupuesto.');
    console.log('Reservado/estimado acumulado: US$' + reservedUsd.toFixed(4));
    console.log('Siguiente toma estimada: US$' + shotCost.toFixed(4));
    console.log('Máximo autorizado: US$' + options.maxUsd.toFixed(4));
    await journal(journalPath, {
      state: 'budget-limit',
      shotId: item.shotId,
      reservedUsd,
      nextEstimatedUsd: shotCost,
      maxUsd: options.maxUsd
    });
    console.log('BATCH_FULL_RUN=BUDGET_LIMIT');
    process.exit(0);
  }

  reservedUsd = roundMoney(reservedUsd + shotCost);

  console.log('\n--------------------------------------------------');
  console.log(
    ' PRODUCIENDO E' + item.sceneOrder + '/T' + item.shotOrder +
    ' (' + (completed + 1) + '/' + queue.length + ')'
  );
  console.log(' Estimado de esta toma: US$' + shotCost.toFixed(4));
  console.log(' Acumulado conservador: US$' + reservedUsd.toFixed(4));
  console.log('--------------------------------------------------');

  await journal(journalPath, {
    state: 'started',
    shotId: item.shotId,
    sceneOrder: item.sceneOrder,
    shotOrder: item.shotOrder,
    estimatedUsd: shotCost
  });

  const code = await runShot(projectId, item.shotId);

  if (code !== 0) {
    await journal(journalPath, {
      state: 'failed',
      shotId: item.shotId,
      exitCode: code
    });
    throw new Error(
      'BATCH detenido: falló E' + item.sceneOrder + '/T' + item.shotOrder +
      '. No se continuará con las siguientes tomas.'
    );
  }

  const verifiedProject = await getProject(projectId);
  const verifiedShot = findShot(verifiedProject, item.shotId);

  if (!verifiedShot || !isFullFlow42Complete(verifiedShot)) {
    await journal(journalPath, {
      state: 'failed-validation',
      shotId: item.shotId
    });
    throw new Error(
      'BATCH detenido: E' + item.sceneOrder + '/T' + item.shotOrder +
      ' terminó pero no quedó oficialmente completa en 4.2.'
    );
  }

  completed += 1;
  await journal(journalPath, {
    state: 'completed',
    shotId: item.shotId,
    pipelineVersion: verifiedShot.pipelineVersion,
    videoAsset: verifiedShot.videoAsset
  });

  console.log(
    'E' + item.sceneOrder + '/T' + item.shotOrder +
    ' COMPLETADA — ' + verifiedShot.pipelineVersion
  );
}

const finalProject = await getProject(projectId);
const remaining = buildBatchQueue(finalProject).length;

console.log('\n==================================================');
console.log(' BATCH 4.2 — PASS');
console.log('==================================================');
console.log('Completadas en este lote: ' + completed);
console.log('Saltadas por ya estar listas: ' + skipped);
console.log('Estimado conservador autorizado/usado: US$' + reservedUsd.toFixed(4));
console.log('Tomas 4.2 pendientes del proyecto: ' + remaining);
console.log('Journal: ' + journalPath);
console.log('BATCH_FULL_RUN=PASS');

function parseOptions(tokens: string[]) {
  let maxUsd: number | undefined;
  let maxShots: number | undefined;
  let sceneOrder: number | undefined;
  let fromShotId: string | undefined;
  let confirmPaid = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (
      token === '--confirm-paid' &&
      tokens[i + 1] === 'SI' &&
      tokens[i + 2] === 'BATCH' &&
      tokens[i + 3] === 'FULL'
    ) {
      confirmPaid = true;
      i += 3;
      continue;
    }

    if (token === '--max-usd') {
      maxUsd = Number(tokens[++i]);
      continue;
    }

    if (token === '--max-shots') {
      maxShots = Number.parseInt(tokens[++i] || '', 10);
      continue;
    }

    if (token === '--scene') {
      sceneOrder = Number.parseInt(tokens[++i] || '', 10);
      continue;
    }

    if (token === '--from-shot') {
      fromShotId = tokens[++i];
      continue;
    }

    throw new Error('Argumento BATCH no reconocido: ' + token);
  }

  if (maxUsd !== undefined && (!Number.isFinite(maxUsd) || maxUsd < 0)) {
    throw new Error('--max-usd inválido.');
  }
  if (maxShots !== undefined && (!Number.isInteger(maxShots) || maxShots <= 0)) {
    throw new Error('--max-shots inválido.');
  }
  if (sceneOrder !== undefined && (!Number.isInteger(sceneOrder) || sceneOrder <= 0)) {
    throw new Error('--scene inválido.');
  }

  return { maxUsd, maxShots, sceneOrder, fromShotId, confirmPaid };
}

async function previewShot(id: string, shotId: string) {
  const result = await captureNode([
    shotScriptPath(),
    'preview',
    id,
    shotId
  ]);

  const match = result.output.match(
    /COSTO MAXIMO PENDIENTE ESTIMADO:\s*US\$(\d+(?:\.\d+)?)/i
  );

  if (!match) {
    return {
      pass: false,
      estimatedUsd: 0,
      reason: 'No se pudo leer el costo del preflight.'
    };
  }

  const estimatedUsd = Number(match[1]);
  const pass =
    result.code === 0 &&
    /(?:SINGLE|SEGMENTED)_FULL_FLOW_PREVIEW=PASS/.test(result.output);

  return {
    pass,
    estimatedUsd: roundMoney(estimatedUsd),
    reason: pass ? undefined : lastUsefulLine(result.output)
  };
}

async function runShot(id: string, shotId: string) {
  return runNodeInherited([
    shotScriptPath(),
    'run',
    id,
    shotId,
    '--confirm-paid',
    'SI',
    'FULL',
    'FLOW'
  ]);
}

function shotScriptPath() {
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'shot-full-flow-v4.ts'
  );
}

async function captureNode(args: string[]) {
  return new Promise<{ code: number; output: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', ...args],
      {
        windowsHide: true,
        env: process.env
      }
    );

    let output = '';
    child.stdout.on('data', (chunk) => { output += String(chunk); });
    child.stderr.on('data', (chunk) => { output += String(chunk); });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

async function runNodeInherited(args: string[]) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', ...args],
      {
        stdio: 'inherit',
        windowsHide: true,
        env: process.env
      }
    );
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
}

function findShot(project: Awaited<ReturnType<typeof getProject>>, shotId: string) {
  for (const scene of project.plan?.scenes || []) {
    const shot = scene.shots.find((item) => item.id === shotId);
    if (shot) return shot;
  }
  return undefined;
}

function lastUsefulLine(output: string) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(-3).join(' | ');
}

async function journal(filePath: string, value: Record<string, unknown>) {
  await appendFile(
    filePath,
    JSON.stringify({
      createdAt: new Date().toISOString(),
      ...value
    }) + '\n',
    'utf8'
  );
}

function usage() {
  console.log('Uso:');
  console.log('  npm run batch:full -- preview <projectId> [--max-shots N] [--scene N] [--from-shot ID]');
  console.log('  npm run batch:full -- run <projectId> --confirm-paid SI BATCH FULL --max-usd N --max-shots N [--scene N] [--from-shot ID]');
}
