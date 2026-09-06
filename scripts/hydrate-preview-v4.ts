import { getProject } from '../lib/storage/project-store';
import { buildLegacyHydrationPreview } from '../lib/engine/legacy-hydration-v4';

const [, , projectId] = process.argv;
if (!projectId) {
  console.log('Uso: npm run hydrate:preview -- <projectId>');
  process.exit(1);
}

const project = await getProject(projectId);
const preview = buildLegacyHydrationPreview(project);

console.log(`\nViralCine 4.0 — HYDRATION PREVIEW (SOLO LECTURA) — ${preview.title}`);
console.log(`Proyecto: ${preview.projectId}`);
console.log(`Escenas: ${preview.totals.scenes}`);
console.log(`Escenas sin tomas: ${preview.totals.scenesWithoutShots}`);
console.log(`Escenas con media legacy a nivel de escena: ${preview.totals.scenesWithLegacyMedia}`);
console.log(`Parlamentos legacy reconocidos por nombre: ${preview.totals.parsedDialogueTurns}`);
console.log(`Fragmentos de diálogo NO resueltos: ${preview.totals.unresolvedDialogueFragments}`);
console.log(`Segmentos hablados estimados: ${preview.totals.estimatedSpokenSegments}`);
console.log(`Escenas que exceden capacidad 4–8s: ${preview.totals.scenesOverCapacity}`);
console.log('');

for (const scene of preview.scenes) {
  if (!scene.narrationWords && !scene.dialogueWords && !scene.unresolvedDialogue.length && !scene.legacyMedia.length) continue;
  console.log(`[E${scene.sceneOrder}] ${scene.sceneTitle}`);
  console.log(`  duración=${scene.durationSeconds}s | tomas actuales=${scene.currentShots}`);
  console.log(`  narración=${scene.narrationWords} palabras | diálogo reconocido=${scene.dialogueWords} palabras`);
  console.log(`  parlamentos=${scene.parsedTurns.length} | no resueltos=${scene.unresolvedDialogue.length}`);
  console.log(`  segmentos estimados=${scene.estimatedSpokenSegments}/${scene.maximumSegments} | capacidad=${scene.fitsDuration ? 'OK' : 'EXCEDIDA'}`);
  console.log(`  media legacy=${scene.legacyMedia.length ? scene.legacyMedia.join(' | ') : 'ninguna a nivel de escena'}`);
  for (const turn of scene.parsedTurns) {
    console.log(`    ✓ ${turn.speakerName}: ${turn.text}`);
  }
  for (const unresolved of scene.unresolvedDialogue) {
    console.log(`    ? NO RESUELTO: ${unresolved}`);
  }
}

console.log('\nSEGURIDAD');
console.log('  Este comando NO modifica project.json.');
console.log('  NO crea tomas.');
console.log('  NO borra media legacy.');
console.log('  NO llama APIs ni genera gasto.');
