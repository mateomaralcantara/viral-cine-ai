import { getProject, updateProject } from '../lib/storage/project-store';
import { applySafeSpeakerSuggestions, applySpeakerAssignment, buildCastingState } from '../lib/engine/casting-v4';

const [, , command, projectId, arg1, arg2] = process.argv;
if (!command || !projectId) usage();

if (command === 'report') {
  const project = await getProject(projectId);
  const state = buildCastingState(project);
  console.log(`\nCasting 4.0 — ${state.title}`);
  console.log(`Proyecto: ${state.projectId}`);
  console.log(`Tomas habladas: ${state.totals.spokenShots}`);
  console.log(`Resueltas: ${state.totals.resolvedShots}`);
  console.log(`Ambiguas: ${state.totals.unresolvedShots}`);
  console.log(`Sugerencias >=92%: ${state.totals.highConfidence}`);
  console.log(`Ambiguas con media existente: ${state.totals.existingMediaUnresolved}`);
  console.log(`Voces asignadas: ${state.totals.voicesAssigned}/${state.characters.length}`);
  console.log('');
  for (const item of state.unresolved) {
    const suggestion = item.suggestedSpeakerName
      ? `${item.suggestedSpeakerName} (${Math.round(item.confidence * 100)}%)`
      : 'MANUAL';
    console.log(`[E${item.sceneOrder}/T${item.shotOrder}] ${suggestion} | ${item.shotId}`);
    console.log(`  ${item.spokenText}`);
    console.log(`  Motivo: ${item.reason}`);
    console.log(`  Candidatos: ${item.candidates.map((candidate) => `${candidate.name}=${candidate.id}`).join(', ') || 'ninguno'}`);
    if (item.existingMedia) console.log('  MEDIA EXISTENTE: se preservará; no se regenera automáticamente.');
  }
  process.exit(0);
}

if (command === 'apply-safe') {
  const threshold = arg1 ? Number(arg1) : 0.92;
  if (!Number.isFinite(threshold) || threshold < 0.8 || threshold > 1) throw new Error('El umbral debe estar entre 0.80 y 1.00.');
  let applied = 0;
  const project = await updateProject(projectId, (current) => {
    if (['planning', 'queued', 'producing', 'composing'].includes(current.status)) {
      throw new Error('No se puede reconciliar mientras el proyecto está produciendo.');
    }
    applied = applySafeSpeakerSuggestions(current, threshold);
    current.productionLog.push(`${new Date().toISOString()} CLI Casting 4.0 aplicó ${applied} sugerencias seguras. No se regeneró media.`);
    return current;
  });
  const state = buildCastingState(project);
  console.log(`OK: ${applied} asignaciones aplicadas. Restan ${state.totals.unresolvedShots} ambiguas.`);
  process.exit(0);
}

if (command === 'assign') {
  const shotId = arg1;
  const speakerId = arg2;
  if (!shotId || !speakerId) usage();
  const project = await updateProject(projectId, (current) => {
    if (['planning', 'queued', 'producing', 'composing'].includes(current.status)) {
      throw new Error('No se puede reconciliar mientras el proyecto está produciendo.');
    }
    applySpeakerAssignment(current, shotId, speakerId, 'manual', 1);
    return current;
  });
  const state = buildCastingState(project);
  console.log(`OK: ${shotId} -> ${speakerId}. Restan ${state.totals.unresolvedShots} ambiguas. Media preservada.`);
  process.exit(0);
}

usage();

function usage(): never {
  console.log('Uso:');
  console.log('  npm run casting:4 -- report <projectId>');
  console.log('  npm run casting:4 -- apply-safe <projectId> [umbral=0.92]');
  console.log('  npm run casting:4 -- assign <projectId> <shotId> <characterId>');
  process.exit(1);
}
