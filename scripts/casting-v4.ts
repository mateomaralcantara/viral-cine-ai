import { getProject, listProjects, updateProject } from '../lib/storage/project-store';
import { applySafeSpeakerSuggestions, applySpeakerAssignment, buildCastingState } from '../lib/engine/casting-v4';

const [, , command, projectId, arg1, arg2] = process.argv;
if (!command) usage();

if (command === 'inventory') {
  const projects = await listProjects();
  console.log('\nCasting 4.0 — INVENTARIO GLOBAL (solo lectura)');
  console.log(`Proyectos encontrados: ${projects.length}`);
  console.log('');

  let globalSpoken = 0;
  let globalUnresolved = 0;
  let globalVoicesMissing = 0;
  let globalNarrationScenes = 0;
  let globalDialogueScenes = 0;

  const rows = projects.map((project) => {
    const state = buildCastingState(project);
    const structure = summarizeStructure(project);
    globalSpoken += state.totals.spokenShots;
    globalUnresolved += state.totals.unresolvedShots;
    globalVoicesMissing += state.totals.voicesMissing;
    globalNarrationScenes += structure.scenesWithNarration;
    globalDialogueScenes += structure.scenesWithDialogue;
    return { project, state, structure };
  }).sort((a, b) =>
    b.state.totals.unresolvedShots - a.state.totals.unresolvedShots ||
    b.state.totals.spokenShots - a.state.totals.spokenShots
  );

  for (const { project, state, structure } of rows) {
    console.log(`${project.input.title}`);
    console.log(`  id: ${project.id}`);
    console.log(`  estado: ${project.status}`);
    console.log(`  escenas=${structure.scenes} | tomas=${structure.shots} | narración=${structure.scenesWithNarration} | diálogo=${structure.scenesWithDialogue} | dialogueTurns=${structure.dialogueTurns}`);
    console.log(`  tomas habladas=${state.totals.spokenShots} | resueltas=${state.totals.resolvedShots} | ambiguas=${state.totals.unresolvedShots} | auto-seguras=${state.totals.highConfidence}`);
    console.log(`  voces=${state.totals.voicesAssigned}/${state.characters.length} | faltan=${state.totals.voicesMissing} | media ambigua existente=${state.totals.existingMediaUnresolved}`);
    console.log('');
  }

  console.log('TOTAL GLOBAL');
  console.log(`  Tomas habladas: ${globalSpoken}`);
  console.log(`  Ambiguas actuales: ${globalUnresolved}`);
  console.log(`  Voces faltantes: ${globalVoicesMissing}`);
  console.log(`  Escenas con narración: ${globalNarrationScenes}`);
  console.log(`  Escenas con diálogo: ${globalDialogueScenes}`);
  process.exit(0);
}

if (!projectId) usage();

if (command === 'inspect') {
  const project = await getProject(projectId);
  const state = buildCastingState(project);
  const structure = summarizeStructure(project);

  console.log(`\nCasting 4.0 — DIAGNÓSTICO PROFUNDO — ${project.input.title}`);
  console.log(`Proyecto: ${project.id}`);
  console.log(`Estado: ${project.status}`);
  console.log(`Personajes: ${project.plan?.characters.length || 0}`);
  console.log(`Escenas: ${structure.scenes}`);
  console.log(`Escenas con narración: ${structure.scenesWithNarration}`);
  console.log(`Escenas con diálogo legado: ${structure.scenesWithDialogue}`);
  console.log(`DialogueTurns estructurados: ${structure.dialogueTurns}`);
  console.log(`Tomas totales: ${structure.shots}`);
  console.log(`Tomas con spokenText: ${state.totals.spokenShots}`);
  console.log(`Tomas habladas sin speakerId: ${state.totals.unresolvedShots}`);
  console.log(`Escenas sin tomas: ${structure.scenesWithoutShots}`);
  console.log(`Escenas con texto pero sin toma hablada: ${structure.scenesWithTextButNoSpokenShot}`);
  console.log(`Voces asignadas: ${state.totals.voicesAssigned}/${state.characters.length}`);
  console.log('');

  if (!project.plan) {
    console.log('El proyecto no tiene plan.');
    process.exit(0);
  }

  console.log('DETALLE POR ESCENA');
  for (const scene of project.plan.scenes) {
    const spokenShots = scene.shots.filter((shot) => shot.spokenText.trim()).length;
    const unresolvedShots = scene.shots.filter((shot) => shot.spokenText.trim() && !(shot.speakerId || shot.dialogueLines?.[0]?.speakerId)).length;
    const mediaShots = scene.shots.filter((shot) => Boolean(shot.videoAsset || shot.baseVideoAsset || shot.lipSyncAsset || shot.voiceAsset)).length;
    const narrationChars = scene.narration.trim().length;
    const dialogueChars = scene.dialogue.trim().length;
    if (!narrationChars && !dialogueChars && !scene.dialogueTurns.length && !scene.shots.length) continue;
    console.log(`[E${scene.order}] ${scene.title}`);
    console.log(`  narración=${narrationChars} chars | diálogo=${dialogueChars} chars | dialogueTurns=${scene.dialogueTurns.length}`);
    console.log(`  tomas=${scene.shots.length} | habladas=${spokenShots} | sin speaker=${unresolvedShots} | con media=${mediaShots}`);
    if ((narrationChars || dialogueChars || scene.dialogueTurns.length) && spokenShots === 0) {
      console.log('  ALERTA: hay contenido verbal a nivel de escena, pero ninguna toma contiene spokenText.');
    }
  }
  process.exit(0);
}

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

function summarizeStructure(project: Awaited<ReturnType<typeof getProject>>) {
  const scenes = project.plan?.scenes || [];
  let shots = 0;
  let scenesWithNarration = 0;
  let scenesWithDialogue = 0;
  let dialogueTurns = 0;
  let scenesWithoutShots = 0;
  let scenesWithTextButNoSpokenShot = 0;

  for (const scene of scenes) {
    shots += scene.shots.length;
    const hasNarration = Boolean(scene.narration.trim());
    const hasDialogue = Boolean(scene.dialogue.trim());
    if (hasNarration) scenesWithNarration += 1;
    if (hasDialogue) scenesWithDialogue += 1;
    dialogueTurns += scene.dialogueTurns.length;
    if (!scene.shots.length) scenesWithoutShots += 1;
    const hasVerbalSceneContent = hasNarration || hasDialogue || scene.dialogueTurns.length > 0;
    const hasSpokenShot = scene.shots.some((shot) => Boolean(shot.spokenText.trim()));
    if (hasVerbalSceneContent && !hasSpokenShot) scenesWithTextButNoSpokenShot += 1;
  }

  return {
    scenes: scenes.length,
    shots,
    scenesWithNarration,
    scenesWithDialogue,
    dialogueTurns,
    scenesWithoutShots,
    scenesWithTextButNoSpokenShot
  };
}

function usage(): never {
  console.log('Uso:');
  console.log('  npm run casting:4 -- inventory');
  console.log('  npm run casting:4 -- inspect <projectId>');
  console.log('  npm run casting:4 -- report <projectId>');
  console.log('  npm run casting:4 -- apply-safe <projectId> [umbral=0.92]');
  console.log('  npm run casting:4 -- assign <projectId> <shotId> <characterId>');
  process.exit(1);
}
