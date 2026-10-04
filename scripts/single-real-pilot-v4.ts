import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { getProject } from '@/lib/storage/project-store';
import { buildSingleRealPreflight } from '@/lib/engine/single-real-preflight-v4';
import { renderSingleShotReal } from '@/lib/engine/single-real-renderer-v4';
import { safetyStatus } from '@/lib/engine/production-safety';

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

if (!located) throw new Error("No existe la toma '" + shotId + "'.");

const preflight = await buildSingleRealPreflight(project, located.scene, located.shot);
printPreflight(preflight);

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: no modifica project.json, ledger ni media.');
  console.log('  No llama ElevenLabs, OpenAI, Veo ni Fal.ai.');
  console.log('  Gasto: US$0');
  console.log(preflight.blockers.length ? 'SINGLE_REAL_PREVIEW=BLOCKED' : 'SINGLE_REAL_PREVIEW=PASS');
  process.exit(preflight.blockers.length ? 2 : 0);
}

const confirmation = rest.join(' ').trim();
const requiredConfirmation = preflight.requiresLipSync
  ? '--confirm-paid SI VOICE FAL'
  : '--confirm-paid SI VOICE';
if (confirmation !== requiredConfirmation) {
  throw new Error(
    'Ejecución pagada bloqueada. Debes usar exactamente: ' + requiredConfirmation
  );
}
if (preflight.blockers.length) {
  throw new Error('Single real bloqueado por preflight: ' + preflight.blockers.join(' | '));
}
if (process.env.PILOT_MODE !== 'true') {
  throw new Error('Piloto real bloqueado: PILOT_MODE debe ser true.');
}

process.env.PRODUCTION_MODE = 'real';
process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
process.env.ALLOW_PAID_GENERATION = 'true';
process.env.ALLOW_PAID_PROVIDER_FALLBACK = 'false';

console.log('\nAUTORIZACION');
console.log('  Confirmación exacta recibida: ' + (preflight.requiresLipSync ? 'SI VOICE FAL' : 'SI VOICE'));
console.log('  Voz: HABILITADA SOLO PARA ESTE PROCESO');
console.log('  OpenAI Images=NO | Veo=NO | Fal=' + (preflight.requiresLipSync ? 'SI, SOLO LIP-SYNC' : 'NO'));
console.log('  Audio Veo será descartado; la salida usará solo la narración aprobada.');

const result = await renderSingleShotReal(project, located.scene, located.shot);

console.log('\nSINGLE REAL PILOT 4.1 — PASS');
console.log('Proyecto: ' + result.projectId);
console.log('Toma: E' + located.scene.order + '/T' + located.shot.order + ' ' + result.shotId);
console.log('Fuente visual: ' + result.sourceVideoAsset);
console.log('Fuente preservada: ' + (result.sourcePreserved ? 'SI' : 'NO'));
console.log('SHA antes: ' + result.sourceSha256Before);
console.log('SHA después: ' + result.sourceSha256After);
console.log('Audio bruto: ' + result.rawAudioDurationSeconds.toFixed(3) + 's');
console.log('Velocidad: ' + result.speedFactor.toFixed(3) + 'x');
console.log('Audio maestro: ' + result.masterAudioAsset);
console.log('Salida: ' + result.outputAsset);
console.log('Duración final: ' + result.outputDurationSeconds.toFixed(3) + 's');
console.log('Fal: ' + (result.lipSyncRequired ? 'SI — LIP-SYNC' : 'NO'));
console.log('Veo: NO');
console.log('OpenAI Images: NO');
console.log('SINGLE_REAL_RUN=PASS');

function printPreflight(value: Awaited<ReturnType<typeof buildSingleRealPreflight>>) {
  const safety = safetyStatus();
  console.log('\nSINGLE REAL 4.1 — PREFLIGHT — ' + value.title);
  console.log('Proyecto: ' + value.projectId);
  console.log('Toma: E' + value.sceneOrder + '/T' + value.shotOrder + ' ' + value.shotId);
  console.log('Hablante: ' + value.speakerLabel + ' [' + value.speakerId + ']');
  console.log('Provider voz: ' + value.provider);
  console.log('VoiceId: ' + (value.voiceIdReady ? 'LISTO' : 'PENDIENTE'));
  console.log('Credencial: ' + (value.credentialVisible ? 'LISTA' : 'PENDIENTE'));
  console.log('Visual 4.1: ' + (value.visualReady ? 'LISTO' : 'PENDIENTE'));
  console.log('Checkpoint vocal 4.1: ' + (value.voiceCheckpointReady ? 'LISTO' : 'PENDIENTE'));
  console.log('Costo voz pendiente: US$' + value.voiceEstimatedUsd.toFixed(4));
  console.log('Lip-sync: ' + (value.requiresLipSync ? 'SI' : 'NO'));
  console.log('Fal estimado: US
  console.log('Bloqueos: ' + value.blockers.length);
  if (value.blockers.length) {
    for (const blocker of value.blockers) console.log('  - ' + blocker);
  } else {
    console.log('  ninguno');
  }
  console.log('\nTEXTO');
  console.log(value.text);
  console.log('\nCORTAFUEGOS ACTUAL');
  console.log('  PRODUCTION_MODE=' + safety.mode);
  console.log('  APIs externas=' + (safety.externalCallsEnabled ? 'HABILITADAS' : 'BLOQUEADAS'));
  console.log('  gasto pagado=' + (safety.paidGenerationEnabled ? 'HABILITADO' : 'BLOQUEADO'));
}

function usage() {
  console.log('Uso:');
  console.log('  npm run single:pilot -- preview <projectId> <shotId>');
  console.log('  npm run single:pilot -- run <projectId> <shotId> --confirm-paid SI VOICE');
  console.log('  Si la toma requiere lip-sync: --confirm-paid SI VOICE FAL');
}
 + value.lipSyncEstimatedUsd.toFixed(4));
  console.log('Bloqueos: ' + value.blockers.length);
  if (value.blockers.length) {
    for (const blocker of value.blockers) console.log('  - ' + blocker);
  } else {
    console.log('  ninguno');
  }
  console.log('\nTEXTO');
  console.log(value.text);
  console.log('\nCORTAFUEGOS ACTUAL');
  console.log('  PRODUCTION_MODE=' + safety.mode);
  console.log('  APIs externas=' + (safety.externalCallsEnabled ? 'HABILITADAS' : 'BLOQUEADAS'));
  console.log('  gasto pagado=' + (safety.paidGenerationEnabled ? 'HABILITADO' : 'BLOQUEADO'));
}

function usage() {
  console.log('Uso:');
  console.log('  npm run single:pilot -- preview <projectId> <shotId>');
  console.log('  npm run single:pilot -- run <projectId> <shotId> --confirm-paid SI VOICE');
}
