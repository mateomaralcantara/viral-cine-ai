import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { buildMasterExportPlan } from '@/lib/engine/master-export-v4';
import { concatenate } from '@/lib/media/ffmpeg';
import { probeVideo } from '@/lib/media/probe';
import {
  assetAbsolutePath,
  assetRelativePath,
  getProject,
  projectAssetDir,
  saveProject
} from '@/lib/storage/project-store';

loadProjectLocalEnvOverride();

const [command, projectId, ...rest] = process.argv.slice(2);
if (!command || !projectId || !['preview', 'run'].includes(command)) {
  usage();
  process.exit(1);
}

const project = await getProject(projectId);
const plan = buildMasterExportPlan(project);

console.log('\n==================================================');
console.log(' VIRALCINE 4.2 — MASTER FINAL');
console.log('==================================================');
console.log('Proyecto: ' + project.id + ' — ' + project.input.title);
console.log('Tomas totales: ' + plan.totalShots);
console.log('Tomas listas para master: ' + plan.readyShots + '/' + plan.totalShots);
console.log('Duración planificada: ' + plan.expectedDurationSeconds.toFixed(3) + 's');
console.log('Tomas con fallback local de lip-sync: ' + plan.degradedLipSyncShots);
console.log('Bloqueos estructurales: ' + plan.blockers.length);
for (const blocker of plan.blockers) console.log('  - ' + blocker);

const missingAssets: string[] = [];
for (const row of plan.rows) {
  if (!row.videoAsset) continue;
  const filePath = assetAbsolutePath(project.id, row.videoAsset);
  if (!(await fileExists(filePath))) {
    missingAssets.push(
      'E' + row.sceneOrder + '/T' + row.shotOrder + ': no existe ' + row.videoAsset
    );
  }
}

console.log('Assets oficiales faltantes: ' + missingAssets.length);
for (const missing of missingAssets) console.log('  - ' + missing);

const blockers = [...plan.blockers, ...missingAssets];

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA');
  console.log('  APIs externas: NO');
  console.log('  OpenAI=NO | Veo=NO | ElevenLabs=NO | Fal=NO');
  console.log('  Gasto API: US$0');
  console.log(blockers.length ? 'MASTER_EXPORT_PREVIEW=BLOCKED' : 'MASTER_EXPORT_PREVIEW=PASS');
  process.exit(blockers.length ? 2 : 0);
}

const confirmation = rest.join(' ').trim();
if (confirmation !== '--confirm EXPORTAR MASTER 4.2') {
  throw new Error(
    'Exportación bloqueada. Usa exactamente: --confirm EXPORTAR MASTER 4.2'
  );
}
if (blockers.length) {
  throw new Error('Master bloqueado: ' + blockers.join(' | '));
}

const exportDir = projectAssetDir(project.id, 'exports');
await mkdir(exportDir, { recursive: true });
const baseName = safeName(project.input.title) + '-MASTER-FINAL';
const outputPath = path.join(exportDir, 'pelicula-final.mp4');
const manifestPath = path.join(exportDir, baseName + '.manifest.json');

const clips = plan.rows.map((row) => assetAbsolutePath(project.id, row.videoAsset!));

console.log('\nComponiendo ' + clips.length + ' tomas oficiales...');
await concatenate(clips, outputPath);

const media = await probeVideo(outputPath);
if (!media.hasVideo || !media.hasAudio) {
  throw new Error('El master final no contiene video y audio válidos.');
}
const tolerance = Math.max(2, plan.expectedDurationSeconds * 0.035);
const delta = Math.abs(media.durationSeconds - plan.expectedDurationSeconds);
if (delta > tolerance) {
  throw new Error(
    'Duración master fuera de tolerancia: ' +
    media.durationSeconds.toFixed(3) + 's vs ' +
    plan.expectedDurationSeconds.toFixed(3) + 's (delta ' +
    delta.toFixed(3) + 's, tolerancia ' + tolerance.toFixed(3) + 's).'
  );
}

const manifest = {
  generatedAt: new Date().toISOString(),
  projectId: project.id,
  title: project.input.title,
  pipeline: 'approved-master-4.2-6.0',
  totalShots: plan.totalShots,
  expectedDurationSeconds: plan.expectedDurationSeconds,
  actualDurationSeconds: Math.round(media.durationSeconds * 1000) / 1000,
  durationDeltaSeconds: Math.round(delta * 1000) / 1000,
  degradedLipSyncShots: plan.rows
    .filter((row) => row.degradedLipSync)
    .map((row) => ({
      sceneOrder: row.sceneOrder,
      shotOrder: row.shotOrder,
      shotId: row.shotId
    })),
  sources: plan.rows.map((row) => ({
    sceneOrder: row.sceneOrder,
    shotOrder: row.shotOrder,
    shotId: row.shotId,
    videoAsset: row.videoAsset,
    pipelineVersion: row.pipelineVersion
  }))
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

project.finalVideoAsset = assetRelativePath(project.id, outputPath);
project.status = 'ready';
project.error = undefined;
project.progress = {
  phase: 'master-exported',
  percent: 100,
  message: 'Película final exportada y lista para ver o descargar.',
  currentScene: project.plan?.scenes.length,
  totalScenes: project.plan?.scenes.length,
  updatedAt: new Date().toISOString()
};
project.productionLog.push(
  new Date().toISOString() +
    ' MASTER FINAL EXPORTADO: ' +
    project.finalVideoAsset +
    '. Montaje local FFmpeg; APIs externas NO.'
);
await saveProject(project);

console.log('\n==================================================');
console.log(' MASTER FINAL — PASS');
console.log('==================================================');
console.log('Tomas concatenadas: ' + plan.totalShots);
console.log('Duración final: ' + media.durationSeconds.toFixed(3) + 's');
console.log('Video: ' + outputPath);
console.log('Manifest: ' + manifestPath);
console.log('APIs externas: NO');
console.log('Gasto API: US$0');
if (plan.degradedLipSyncShots > 0) {
  console.log(
    'AVISO QA: ' + plan.degradedLipSyncShots +
    ' toma(s) usan fallback local de lip-sync; revisar visualmente antes de publicar.'
  );
}
console.log('FINAL_VIDEO_ASSET=' + project.finalVideoAsset);
console.log('MASTER_EXPORT_RUN=PASS');

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function safeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .toUpperCase() || 'VIRALCINE';
}

function usage() {
  console.log('Uso:');
  console.log('  npm run movie:master -- preview <projectId>');
  console.log('  npm run movie:master -- run <projectId> --confirm EXPORTAR MASTER 4.2');
}
