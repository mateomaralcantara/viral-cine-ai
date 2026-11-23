import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { applySafeNarratorResolution, previewSafeNarratorResolution } from '../lib/engine/safe-speaker-resolution-v4';
import { dataRoot, getProject, projectRoot, updateProject } from '../lib/storage/project-store';

const [, , command, projectId, confirmation] = process.argv;
if (!command || !projectId || !['preview', 'apply'].includes(command)) usage();

const minimumConfidence = 0.99;

if (command === 'preview') {
  const project = await getProject(projectId);
  const preview = previewSafeNarratorResolution(project, minimumConfidence);
  printPreview(preview);
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: no modifica project.json.');
  console.log('  Solo considera NARRADOR con confianza >=99%.');
  console.log('  No toca segmentos de personaje, mixtos ni manuales.');
  console.log('  No llama APIs y no genera gasto.');
  process.exit(0);
}

if (confirmation !== '--confirm') {
  throw new Error('Para aplicar debes añadir --confirm después del projectId. Ejecuta preview primero.');
}

const current = await getProject(projectId);
if (['planning', 'queued', 'producing', 'composing'].includes(current.status)) {
  throw new Error(`No se puede reconciliar mientras el proyecto está en estado ${current.status}.`);
}
const before = previewSafeNarratorResolution(current, minimumConfidence);
if (before.eligibleCount === 0) {
  console.log('No hay tomas nuevas de narrador elegibles. No se modificó el proyecto.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(dataRoot(), 'backups', `speaker-reconcile-${stamp}`, projectId);
await mkdir(backupDir, { recursive: true });
const backupPath = path.join(backupDir, 'project.json');
await copyFile(path.join(projectRoot(projectId), 'project.json'), backupPath);

let applied = 0;
const updated = await updateProject(projectId, (project) => {
  if (['planning', 'queued', 'producing', 'composing'].includes(project.status)) {
    throw new Error(`No se puede reconciliar mientras el proyecto está en estado ${project.status}.`);
  }
  const result = applySafeNarratorResolution(project, minimumConfidence);
  applied = result.applied;
  if (applied !== before.eligibleCount) {
    throw new Error(`La cantidad elegible cambió durante la operación (${before.eligibleCount} -> ${applied}). Se abortó.`);
  }
  return project;
});
const after = previewSafeNarratorResolution(updated, minimumConfidence);

console.log(`\nViralCine 4.0 — RESOLUCIÓN SEGURA DE NARRADOR — ${updated.input.title}`);
console.log(`Proyecto: ${updated.id}`);
console.log(`Asignaciones aplicadas: ${applied}`);
console.log(`Narraciones ya resueltas: ${after.alreadyResolved}`);
console.log(`Segmentos hablados no-narrador pendientes: ${after.remainingNonNarratorSpoken}`);
console.log(`Backup project.json: ${backupPath}`);
console.log('Media: PRESERVADA; no se borró ni regeneró ningún asset.');
console.log('APIs externas: NO utilizadas. Gasto: US$0.');

function printPreview(preview: ReturnType<typeof previewSafeNarratorResolution>) {
  console.log(`\nViralCine 4.0 — PREVIEW RESOLUCIÓN NARRADOR — ${preview.title}`);
  console.log(`Proyecto: ${preview.projectId}`);
  console.log(`Nuevas tomas elegibles como narrator: ${preview.eligibleCount}`);
  console.log(`Narraciones ya resueltas: ${preview.alreadyResolved}`);
  console.log(`Segmentos hablados no-narrador pendientes: ${preview.remainingNonNarratorSpoken}`);
}

function usage(): never {
  console.log('Uso:');
  console.log('  npm run resolve:narrator -- preview <projectId>');
  console.log('  npm run resolve:narrator -- apply <projectId> --confirm');
  process.exit(1);
}
