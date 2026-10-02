import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { getProject } from '@/lib/storage/project-store';
import { buildSegmentedRealPreflight } from '@/lib/engine/segmented-real-preflight-v4';
import { renderSegmentedShotReal } from '@/lib/engine/segmented-renderer-v4';
import { safetyStatus } from '@/lib/engine/production-safety';

loadLocalEnvSafely();

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

const preflight = buildSegmentedRealPreflight(project, located.scene, located.shot);

printPreflight(preflight);

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: no modifica project.json, ledger ni media.');
  console.log('  No reserva gasto y no llama ElevenLabs, OpenAI ni Fal.ai.');
  process.exit(preflight.blockers.length ? 2 : 0);
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

const result = await renderSegmentedShotReal(project, located.scene, located.shot);

console.log('\nSEGMENTED REAL PILOT 4.0 — PASS');
console.log(`Proyecto: ${result.projectId}`);
console.log(`Toma: E${located.scene.order}/T${located.shot.order} ${result.shotId}`);
console.log(`MP4 fuente: ${result.sourceVideoAsset}`);
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

function loadLocalEnvSafely() {
  for (const name of ['.env.local', '.env']) {
    const file = path.resolve(process.cwd(), name);
    if (!existsSync(file)) continue;
    loadEnvFile(file);
    break;
  }
}

function usage() {
  console.log('Uso:');
  console.log('  npm run segments:pilot -- preview <projectId> <shotId>');
  console.log('  npm run segments:pilot -- run <projectId> <shotId> --confirm-paid SI FAL');
}
