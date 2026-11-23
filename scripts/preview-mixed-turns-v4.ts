import { getProject } from '../lib/storage/project-store';
import { buildLegacyMixedTurnPlan } from '../lib/engine/legacy-mixed-turns-v4';

const [, , projectId] = process.argv;
if (!projectId) {
  console.log('Uso: npm run turns:preview -- <projectId>');
  process.exit(1);
}

const project = await getProject(projectId);
const report = buildLegacyMixedTurnPlan(project);

console.log(`\nViralCine 4.0 — PREVIEW TURNOS MIXTOS (SOLO LECTURA) — ${report.title}`);
console.log(`Proyecto: ${report.projectId}`);
console.log(`Tomas mixtas: ${report.totals.mixedShots}`);
console.log(`Turnos propuestos: ${report.totals.plannedTurns}`);
console.log(`Turnos narrador: ${report.totals.narratorTurns}`);
console.log(`Turnos personajes existentes: ${report.totals.characterTurns}`);
console.log(`Turnos voces secundarias: ${report.totals.supportTurns}`);
console.log(`Turnos sin resolver: ${report.totals.unresolvedTurns}`);
console.log(`Voces secundarias detectadas: ${report.totals.supportVoiceLabels.length ? report.totals.supportVoiceLabels.join(', ') : 'ninguna'}`);

for (const row of report.rows) {
  console.log(`\n[E${row.sceneOrder}/T${row.shotOrder}] ${row.sceneTitle} | ${row.shotId}`);
  console.log(`  duración=${row.durationSeconds}s | turnos=${row.turns.length} | split=${row.requiresShotSplit ? 'REQUERIDO' : 'no'}`);
  console.log(`  media original=${row.originalMedia.length ? row.originalMedia.join(' | ') : 'ninguna'}`);
  for (const [index, turn] of row.turns.entries()) {
    const speaker = turn.speakerId ? `${turn.speakerName} [${turn.speakerId}]` : turn.speakerName;
    console.log(`  ${index + 1}. ${turn.kind.toUpperCase()} ${speaker} | ${Math.round(turn.confidence * 100)}% | ${turn.estimatedStartSeconds}-${turn.estimatedEndSeconds}s`);
    console.log(`     ${turn.text}`);
    console.log(`     fuente=${turn.source}`);
  }
}

console.log('\nSEGURIDAD');
console.log('  Este comando NO modifica project.json.');
console.log('  NO corta, borra ni regenera MP4/MP3/PNG existentes.');
console.log('  Los tiempos son estimaciones proporcionales por palabras; NO son alineación final.');
console.log('  Las voces secundarias no reciben characterId inventado.');
console.log('  NO llama APIs ni genera gasto.');
