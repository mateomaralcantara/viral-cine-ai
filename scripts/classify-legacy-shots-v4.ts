import { getProject } from '../lib/storage/project-store';
import { classifyLegacyProjectShots } from '../lib/engine/legacy-shot-classifier-v4';

const [, , projectId] = process.argv;
if (!projectId) {
  console.log('Uso: npm run classify:shots -- <projectId>');
  process.exit(1);
}

const project = await getProject(projectId);
const report = classifyLegacyProjectShots(project);

console.log(`\nViralCine 4.0 — CLASIFICACIÓN DE TOMAS LEGACY (SOLO LECTURA) — ${report.title}`);
console.log(`Proyecto: ${report.projectId}`);
console.log(`Tomas totales: ${report.totals.shots}`);
console.log(`Tomas con spokenText: ${report.totals.spokenShots}`);
console.log(`Clasificadas como narrador: ${report.totals.narrator}`);
console.log(`Clasificadas como personaje: ${report.totals.character}`);
console.log(`Ambiguas/manuales: ${report.totals.ambiguous}`);
console.log(`Silenciosas: ${report.totals.silence}`);
console.log(`Con speakerId actual: ${report.totals.existingSpeaker}`);
console.log(`Tomas habladas con media existente: ${report.totals.spokenWithMedia}`);
console.log('');

for (const row of report.rows) {
  if (!row.spokenText.trim()) continue;
  const label = row.classification === 'narrator'
    ? `NARRADOR (${Math.round(row.confidence * 100)}%)`
    : row.classification === 'character'
      ? `${row.suggestedSpeakerName} (${Math.round(row.confidence * 100)}%)`
      : 'MANUAL';
  console.log(`[E${row.sceneOrder}/T${row.shotOrder}] ${label} | ${row.shotId}`);
  console.log(`  ${row.spokenText}`);
  console.log(`  narración=${Math.round(row.narrationScore * 100)}% | mejor diálogo=${Math.round(row.bestDialogueScore * 100)}%`);
  console.log(`  Motivo: ${row.reason}`);
  if (row.currentSpeakerId) console.log(`  speaker actual: ${row.currentSpeakerId}`);
  if (row.existingMedia.length) console.log(`  MEDIA: ${row.existingMedia.join(' | ')}`);
}

console.log('\nSEGURIDAD');
console.log('  Este comando NO modifica project.json.');
console.log('  NO cambia speakerId.');
console.log('  NO borra ni regenera media.');
console.log('  NO llama APIs ni genera gasto.');
