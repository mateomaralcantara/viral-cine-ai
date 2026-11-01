import path from 'node:path';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { getProject } from '@/lib/storage/project-store';
import { buildSegmentedRealPreflight } from '@/lib/engine/segmented-real-preflight-v4';
import { renderSegmentedShotReal } from '@/lib/engine/segmented-renderer-v4';
import { safetyStatus } from '@/lib/engine/production-safety';
import { inspectMixedShotVisualSource } from '@/lib/engine/producer-v4';
import {
  inspectSegmentedTurnVisualSources,
  turnSourceAssetMap
} from '@/lib/engine/segmented-visual-sources-v4';

loadProjectLocalEnvOverride();

const [command, projectId, shotId, ...rest] = process.argv.slice(2);

if (!command || !projectId || !shotId || !['preview', 'run'].includes(command)) {
  usage();
  process.exit(1);
}

const project = await getProject(projectId);
if (!project.plan) throw new Error('El proyecto no tiene plan.');

let located:
  | {
      scene: NonNullable<typeof project.plan>['scenes'][number];
      shot: NonNullable<typeof project.plan>['scenes'][number]['shots'][number];
    }
  | undefined;

for (const scene of project.plan.scenes) {
  const shot = scene.shots.find((item) => item.id === shotId);
  if (shot) {
    located = { scene, shot };
    break;
  }
}

if (!located) throw new Error(`No existe la toma '${shotId}'.`);

const sourceInspection = await inspectMixedShotVisualSource(project, located.scene, located.shot);
const visualTurns = await inspectSegmentedTurnVisualSources(project, located.scene, located.shot);
const firstTurnAsset = visualTurns.turns.find((turn) => turn.videoReady)?.videoAsset;
const effectiveSource = firstTurnAsset || sourceInspection.selectedAsset;
const effectiveShot = effectiveSource
  ? { ...located.shot, baseVideoAsset: effectiveSource, videoAsset: effectiveSource }
  : located.shot;
const preflight = buildSegmentedRealPreflight(project, located.scene, effectiveShot);

printPreflight(preflight);
printVisualSource(sourceInspection);
printVisualTurns(visualTurns);

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: no modifica project.json, ledger ni media.');
  console.log('  No reserva gasto y no llama ElevenLabs, OpenAI, Veo ni Fal.ai.');
  process.exit(preflight.blockers.length || !visualTurns.allVideosReady ? 2 : 0);
}

const confirmation = rest.join(' ').trim();
if (confirmation !== '--confirm-paid SI FAL') {
  throw new Error(
    'Ejecución pagada bloqueada. Debes usar exactamente: --confirm-paid SI FAL'
  );
}

if (preflight.blockers.length) {
  throw new Error(
    'Piloto real bloqueado por preflight: ' + preflight.blockers.join(' | ')
  );
}

if (!visualTurns.allVideosReady) {
  throw new Error(
    'Piloto Fal bloqueado ANTES DE GASTAR: faltan fuentes visuales 4.1 por turno. ' +
    'Ejecuta primero npm run visual:turns -- preview <projectId> <shotId>, ' +
    'aprueba las referencias y genera los videos por turno.'
  );
}

if (process.env.PILOT_MODE !== 'true') {
  throw new Error('Piloto real bloqueado: PILOT_MODE debe ser true.');
}

process.env.PRODUCTION_MODE = 'real';
process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
process.env.ALLOW_PAID_GENERATION = 'true';
process.env.ALLOW_PAID_PROVIDER_FALLBACK = 'false';

console.log('\nAUTORIZACION');
console.log('  Confirmación exacta recibida: SI FAL');
console.log('  PRODUCTION_MODE=real SOLO PARA ESTE PROCESO');
console.log('  APIs externas=HABILITADAS SOLO PARA ESTE PROCESO');
console.log('  gasto pagado=HABILITADO SOLO PARA ESTE PROCESO');
console.log('  fallback pagado global=DESHABILITADO');

const result = await renderSegmentedShotReal(
  project,
  located.scene,
  effectiveShot,
  { turnSourceAssets: turnSourceAssetMap(visualTurns) }
);

console.log('\nSEGMENTED REAL PILOT 4.0 — PASS');
console.log(`Proyecto: ${result.projectId}`);
console.log(`Toma: E${located.scene.order}/T${located.shot.order} ${result.shotId}`);
console.log(`MP4 fuente: ${result.sourceVideoAsset}`);
console.log(`Modo fuente visual: ${result.sourceMode}`);
if (result.turnSourceAssets) {
  for (const [turnIndex, asset] of Object.entries(result.turnSourceAssets)) {
    console.log(`Fuente turno ${turnIndex}: ${asset}`);
  }
}
console.log(`Duración fuente: ${result.sourceDurationSeconds.toFixed(3)}s`);
console.log(`Duración final: ${result.outputDurationSeconds.toFixed(3)}s`);
console.log(`Delta: ${result.durationDeltaSeconds.toFixed(3)}s`);
console.log(`Fuente preservada: ${result.sourcePreserved ? 'SI' : 'NO'}`);
console.log(`SHA antes: ${result.sourceSha256Before}`);
console.log(`SHA después: ${result.sourceSha256After}`);
console.log(`Turnos: ${result.turns.length}`);
console.log(`Turnos con lip-sync: ${result.lipSyncTurns}`);
console.log(`Audio maestro: ${result.masterAudioAsset}`);
console.log(`Salida: ${result.outputAsset}`);

console.log('\nTURNOS RENDERIZADOS');
for (const turn of result.turns) {
  console.log(
    `  ${turn.index}. ${turn.speakerId} | ${turn.startSeconds.toFixed(3)}→${turn.endSeconds.toFixed(3)}s | ` +
    `dur=${turn.durationSeconds.toFixed(3)}s | audio=${turn.rawAudioDurationSeconds.toFixed(3)}s | ` +
    `speed=${turn.speedFactor.toFixed(3)}x | lip-sync=${turn.requiresLipSync ? 'SI' : 'NO'}`
  );
}

console.log('\nIMPORTANTE');
console.log('  project.json no se guarda desde este script.');
console.log('  El MP4 fuente se valida por SHA256 antes/después.');
console.log('  Los assets generados quedan en rutas derivadas segmented-v4-real/.');
console.log('  Los cobros y estados quedan registrados por el spend ledger.');

function printPreflight(preview: ReturnType<typeof buildSegmentedRealPreflight>) {
  const safety = safetyStatus();
  console.log(`\nSegmented Real Pilot 4.0 — PREFLIGHT — ${preview.title}`);
  console.log(`Proyecto: ${preview.projectId}`);
  console.log(`Toma: E${preview.sceneOrder}/T${preview.shotOrder} ${preview.shotId}`);
  console.log(`MP4 fuente: ${preview.sourceVideoAsset}`);
  console.log(`Duración: ${preview.shotDurationSeconds.toFixed(3)}s`);
  console.log(`Perfiles requeridos: ${preview.totals.profilesReady}/${preview.totals.profilesRequired} listos`);
  console.log(`Turnos: ${preview.totals.turns}`);
  console.log(`Turnos con lip-sync: ${preview.totals.lipSyncTurns}`);
  console.log(`Segundos lip-sync: ${preview.totals.lipSyncSeconds.toFixed(3)}s`);
  console.log(`Costo voz estimado: US$${preview.totals.voiceEstimatedUsd.toFixed(4)}`);
  console.log(`Costo lip-sync estimado: US$${preview.totals.lipSyncEstimatedUsd.toFixed(4)}`);
  console.log(`Costo total estimado: US$${preview.totals.totalEstimatedUsd.toFixed(4)}`);
  console.log(`Bloqueos: ${preview.totals.blockers}`);

  console.log('\nPERFILES');
  for (const profile of preview.requiredProfiles) {
    console.log(
      `  ${profile.label} | tipo=${profile.kind} | provider=${profile.provider} | ` +
      `voiceId=${profile.voiceIdReady ? 'LISTO' : 'PENDIENTE'}`
    );
  }

  console.log('\nTURNOS');
  for (const turn of preview.turns) {
    console.log(
      `  ${turn.index}. ${turn.label} [${turn.speakerId}] | ${turn.durationSeconds.toFixed(3)}s | ` +
      `lip-sync=${turn.requiresLipSync ? 'SI' : 'NO'} | voz=US$${turn.voiceEstimatedUsd.toFixed(4)} | ` +
      `lip-sync=US$${turn.lipSyncEstimatedUsd.toFixed(4)}`
    );
  }

  console.log('\nBLOQUEOS');
  if (!preview.blockers.length) console.log('  ninguno');
  else for (const blocker of preview.blockers) console.log(`  - ${blocker}`);

  console.log('\nCORTAFUEGOS ACTUAL');
  console.log(`  PRODUCTION_MODE=${safety.mode}`);
  console.log(`  APIs externas=${safety.externalCallsEnabled ? 'HABILITADAS' : 'BLOQUEADAS'}`);
  console.log(`  gasto pagado=${safety.paidGenerationEnabled ? 'HABILITADO' : 'BLOQUEADO'}`);
}

function printVisualTurns(
  inspection: Awaited<ReturnType<typeof inspectSegmentedTurnVisualSources>>
) {
  console.log('\nFUENTES VISUALES 4.1 POR TURNO');
  console.log('  Referencias: ' + (inspection.allReferencesReady ? 'LISTAS' : 'PENDIENTES'));
  console.log('  Videos: ' + (inspection.allVideosReady ? 'LISTOS' : 'PENDIENTES'));
  for (const turn of inspection.turns) {
    console.log(
      '  ' + turn.index + '. ' + turn.speakerLabel +
      ' | role=' + turn.role +
      ' | ref=' + (turn.referenceReady ? 'LISTA' : 'PENDIENTE') +
      ' | video=' + (turn.videoReady ? 'LISTO' : 'PENDIENTE')
    );
  }
  console.log('  Pipeline 4.1 usa estas fuentes por turno; la fuente única 4.0 queda solo como legado.');
}

function printVisualSource(
  inspection: Awaited<ReturnType<typeof inspectMixedShotVisualSource>>
) {
  console.log('\nFUENTE VISUAL');
  if (inspection.selectedAsset) {
    console.log('  Estado: LISTA');
    console.log('  Tipo: ' + inspection.selectedKind);
    console.log('  Asset: ' + inspection.selectedAsset);
  } else {
    console.log('  Estado: REQUIERE VIDEO BASE REAL');
    for (const rejected of inspection.rejected) {
      console.log('  Rechazada: ' + rejected.asset);
      console.log('    motivo: ' + rejected.reason);
    }
  }
}

function usage() {
  console.log('Uso:');
  console.log('  npm run segments:pilot -- preview <projectId> <shotId>');
  console.log('  npm run segments:pilot -- run <projectId> <shotId> --confirm-paid SI FAL');
}
