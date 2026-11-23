import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { applyLegacyTurnStructure, previewLegacyTurnStructure } from '../lib/engine/legacy-turn-structure-v4';
import { dataRoot, getProject, projectRoot, updateProject } from '../lib/storage/project-store';

const [, , command, projectId, confirmation] = process.argv;
if (!command || !projectId || !['preview', 'apply'].includes(command)) usage();

if (command === 'preview') {
  printPreview(previewLegacyTurnStructure(await getProject(projectId)));
  printSafety();
  process.exit(0);
}

if (confirmation !== '--confirm') {
  throw new Error('Para estructurar turnos debes añadir --confirm. Ejecuta preview primero.');
}

const current = await getProject(projectId);
if (['planning', 'queued', 'producing', 'composing'].includes(current.status)) {
  throw new Error(`No se puede modificar metadata mientras el proyecto está en estado ${current.status}.`);
}
const before = previewLegacyTurnStructure(current);
if (before.blockedShots > 0) {
  throw new Error(`Operación cancelada: ${before.blockedShots} toma(s) no tienen turnos completamente resueltos.`);
}
if (!before.mixedShots) {
  console.log('No hay tomas multihablante pendientes de estructurar.');
  printPreview(before);
  process.exit(0);
}
if (before.alreadyStructured === before.mixedShots) {
  console.log('Todas las tomas mixtas ya están estructuradas. No se modificó el proyecto.');
  printPreview(before);
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(dataRoot(), 'backups', `mixed-turn-structure-${stamp}`, projectId);
await mkdir(backupDir, { recursive: true });
const backupPath = path.join(backupDir, 'project.json');
await copyFile(path.join(projectRoot(projectId), 'project.json'), backupPath);

let applied = 0;
const updated = await updateProject(projectId, (project) => {
  if (['planning', 'queued', 'producing', 'composing'].includes(project.status)) {
    throw new Error(`No se puede modificar metadata mientras el proyecto está en estado ${project.status}.`);
  }
  const latest = previewLegacyTurnStructure(project);
  if (latest.mixedShots !== before.mixedShots || latest.turns !== before.turns || latest.blockedShots !== before.blockedShots) {
    throw new Error('El mapa de turnos cambió durante la operación. Se abortó.');
  }
  const result = applyLegacyTurnStructure(project);
  applied = result.applied;
  return project;
});

console.log(`\nViralCine 4.0 — TURNOS TEMPORALES ESTRUCTURADOS — ${updated.input.title}`);
console.log(`Proyecto: ${updated.id}`);
console.log(`Tomas actualizadas: ${applied}`);
printPreview(previewLegacyTurnStructure(updated));
console.log(`Backup project.json: ${backupPath}`);
console.log('Media: PRESERVADA; no se cortó, borró ni regeneró ningún MP4/MP3/PNG.');
console.log('APIs externas: NO utilizadas. Gasto: US$0.');

function printPreview(preview: ReturnType<typeof previewLegacyTurnStructure>) {
  console.log(`\nTomas mixtas: ${preview.mixedShots}`);
  console.log(`Turnos temporales: ${preview.turns}`);
  console.log(`Tomas listas para estructurar: ${preview.readyShots}`);
  console.log(`Tomas bloqueadas: ${preview.blockedShots}`);
  console.log(`Ya estructuradas: ${preview.alreadyStructured}`);
  console.log(`Con media histórica: ${preview.mediaBackedShots}`);
  for (const row of preview.rows) {
    console.log(`  E${row.sceneOrder}/T${row.shotOrder} ${row.shotId} | turnos=${row.turns} | ${row.ready ? 'LISTA' : 'BLOQUEADA'} | ${row.alreadyStructured ? 'ESTRUCTURADA' : 'PENDIENTE'} | media=${row.existingMedia ? 'sí' : 'no'}`);
  }
}

function printSafety() {
  console.log('\nSEGURIDAD');
  console.log('  preview es SOLO LECTURA.');
  console.log('  apply solo escribe dialogueLines/startSeconds/endSeconds y exige --confirm.');
  console.log('  NO crea nuevas tomas ni cambia la duración del MP4 fuente.');
  console.log('  NO corta media, NO llama APIs y NO genera gasto.');
}

function usage(): never {
  console.log('Uso:');
  console.log('  npm run turns:structure -- preview <projectId>');
  console.log('  npm run turns:structure -- apply <projectId> --confirm');
  process.exit(1);
}
