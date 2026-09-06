import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { getProject } from '@/lib/storage/project-store';
import { buildSegmentedRealPreflight } from '@/lib/engine/segmented-real-preflight-v4';
import { safetyStatus } from '@/lib/engine/production-safety';

loadLocalEnvSafely();

const [command, projectId, shotId] = process.argv.slice(2);
if (command !== 'preview' || !projectId || !shotId) {
  console.log('Uso: npm run segments:real -- preview <projectId> <shotId>');
  process.exit(1);
}

const project = await getProject(projectId);
if (!project.plan) throw new Error('El proyecto no tiene plan.');

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

const preview = buildSegmentedRealPreflight(project, located.scene, located.shot);
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
  const credential = turn.credentialName
    ? `${turn.credentialName}=${turn.credentialVisible ? 'CONFIGURADA' : 'NO VISIBLE'}`
    : 'credencial=N/A';
  console.log(
    `  ${turn.index}. ${turn.label} [${turn.speakerId}] | ${turn.durationSeconds.toFixed(3)}s | ` +
    `voz=US$${turn.voiceEstimatedUsd.toFixed(4)} | lip-sync=US$${turn.lipSyncEstimatedUsd.toFixed(4)} | ${credential}`
  );
}

console.log('\nBLOQUEOS');
if (!preview.blockers.length) console.log('  ninguno');
else for (const blocker of preview.blockers) console.log(`  - ${blocker}`);

console.log('\nCORTAFUEGOS ACTUAL');
console.log(`  PRODUCTION_MODE=${safety.mode}`);
console.log(`  APIs externas=${safety.externalCallsEnabled ? 'HABILITADAS' : 'BLOQUEADAS'}`);
console.log(`  gasto pagado=${safety.paidGenerationEnabled ? 'HABILITADO' : 'BLOQUEADO'}`);
console.log(`  ${safety.reason}`);
console.log('\nSEGURIDAD');
console.log('  SOLO LECTURA: no modifica project.json, ledger ni media.');
console.log('  No reserva gasto y no llama ElevenLabs, OpenAI ni Fal.ai.');
console.log('  El costo es preventivo y usa las tarifas COST_* configuradas; no es un cobro real.');

function loadLocalEnvSafely() {
  for (const name of ['.env.local', '.env']) {
    const file = path.resolve(process.cwd(), name);
    if (!existsSync(file)) continue;
    loadEnvFile(file);
    break;
  }
}
