import { getProject } from '@/lib/storage/project-store';
import { previewSegmentedRenderer, renderSegmentedShotOffline } from '@/lib/engine/segmented-renderer-v4';

const [command, projectId, shotId, confirm] = process.argv.slice(2);

if (!command || !projectId || !['preview', 'render-offline'].includes(command)) {
  usage();
  process.exit(1);
}

const project = await getProject(projectId);
if (!project.plan) throw new Error('El proyecto no tiene plan.');

if (command === 'preview') {
  const preview = previewSegmentedRenderer(project);
  console.log(`\nSegmented Renderer 4.0 — PREVIEW — ${preview.title}`);
  console.log(`Proyecto: ${preview.projectId}`);
  console.log(`Tomas multihablante: ${preview.mixedShots}`);
  console.log(`Tomas listas: ${preview.readyShots}`);
  console.log(`Tomas bloqueadas: ${preview.blockedShots}`);
  console.log(`Subsegmentos: ${preview.turns}`);
  console.log(`Con MP4 fuente: ${preview.mediaBackedShots}`);
  for (const row of preview.rows) {
    console.log(
      `  E${row.sceneOrder}/T${row.shotOrder} ${row.shotId} | turnos=${row.turns} | ` +
      `${row.ready ? 'LISTA' : 'BLOQUEADA'} | video=${row.sourceVideoAsset || 'SIN VIDEO'}`
    );
    if (row.issue) console.log(`    motivo=${row.issue}`);
  }
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: no modifica project.json ni archivos de media.');
  console.log('  No llama APIs ni genera gasto.');
  process.exit(preview.blockedShots ? 2 : 0);
}

if (!shotId || confirm !== '--confirm') {
  console.error('render-offline exige <projectId> <shotId> --confirm');
  process.exit(1);
}

if (process.env.PRODUCTION_MODE === 'real' ||
    process.env.ALLOW_EXTERNAL_API_CALLS === 'true' ||
    process.env.ALLOW_PAID_GENERATION === 'true') {
  throw new Error(
    'Seguridad: render-offline solo funciona con PRODUCTION_MODE!=real, ALLOW_EXTERNAL_API_CALLS!=true y ALLOW_PAID_GENERATION!=true.'
  );
}

let located:
  | { scene: NonNullable<typeof project.plan>['scenes'][number]; shot: NonNullable<typeof project.plan>['scenes'][number]['shots'][number] }
  | undefined;
for (const scene of project.plan.scenes) {
  const shot = scene.shots.find((item) => item.id === shotId);
  if (shot) {
    located = { scene, shot };
    break;
  }
}
if (!located) throw new Error(`No existe la toma '${shotId}'.`);

const before = JSON.stringify(project);
const result = await renderSegmentedShotOffline(project, located.scene, located.shot);
const after = JSON.stringify(project);
if (before !== after) {
  throw new Error('Protección de metadata: el renderer offline modificó el objeto del proyecto en memoria.');
}

console.log(`\nSegmented Renderer 4.0 — OFFLINE PASS — ${project.input.title}`);
console.log(`Proyecto: ${project.id}`);
console.log(`Toma: E${located.scene.order}/T${located.shot.order} ${located.shot.id}`);
console.log(`Subsegmentos: ${result.turns}`);
console.log(`MP4 fuente: ${result.sourceVideoAsset}`);
console.log(`Duración fuente: ${result.sourceDurationSeconds.toFixed(3)}s`);
console.log(`Duración recompuesta: ${result.outputDurationSeconds.toFixed(3)}s`);
console.log(`Delta duración: ${result.durationDeltaSeconds.toFixed(3)}s`);
console.log(`SHA256 fuente antes: ${result.sourceSha256Before}`);
console.log(`SHA256 fuente después: ${result.sourceSha256After}`);
console.log(`Fuente preservada: ${result.sourcePreserved ? 'SI' : 'NO'}`);
console.log(`Salida derivada: ${result.outputAsset}`);
console.log('project.json: NO MODIFICADO');
console.log('APIs externas: 0');
console.log('Gasto: US$0');

function usage() {
  console.log('Uso:');
  console.log('  npm run segments:4 -- preview <projectId>');
  console.log('  npm run segments:4 -- render-offline <projectId> <shotId> --confirm');
}
