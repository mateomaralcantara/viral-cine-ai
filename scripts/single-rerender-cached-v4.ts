import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { getProject } from '@/lib/storage/project-store';
import { buildSingleRealPreflight } from '@/lib/engine/single-real-preflight-v4';
import { renderSingleShotReal } from '@/lib/engine/single-real-renderer-v4';

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

console.log('\nSINGLE REAL 4.1 — RERENDER CACHED');
console.log('Proyecto: ' + project.id);
console.log('Toma: E' + located.scene.order + '/T' + located.shot.order + ' ' + located.shot.id);
console.log('Visual 4.1: ' + (preflight.visualReady ? 'LISTO' : 'PENDIENTE'));
console.log('Checkpoint vocal 4.1: ' + (preflight.voiceCheckpointReady ? 'LISTO' : 'PENDIENTE'));
console.log('Costo voz pendiente: US$' + preflight.voiceEstimatedUsd.toFixed(4));
console.log('Lip-sync: NO');
console.log('Bloqueos: ' + preflight.blockers.length);

const cachedReady =
  preflight.visualReady &&
  preflight.voiceCheckpointReady &&
  preflight.voiceEstimatedUsd === 0 &&
  preflight.blockers.length === 0;

if (!cachedReady) {
  throw new Error(
    'Rerender cached bloqueado: se requiere visual listo + checkpoint vocal listo + costo pendiente US$0 + cero bloqueos.'
  );
}

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: no modifica media.');
  console.log('  OpenAI=NO | Veo=NO | ElevenLabs=NO | Fal=NO');
  console.log('  Gasto: US$0');
  console.log('SINGLE_RERENDER_CACHED_PREVIEW=PASS');
  process.exit(0);
}

const confirmation = rest.join(' ').trim();
if (confirmation !== '--confirm-cached RERENDER LOCAL') {
  throw new Error('Ejecución bloqueada. Usa exactamente: --confirm-cached RERENDER LOCAL');
}

// Cortafuegos fuerte: este comando solo puede reutilizar checkpoints locales.
process.env.PRODUCTION_MODE = 'demo';
process.env.ALLOW_EXTERNAL_API_CALLS = 'false';
process.env.ALLOW_PAID_GENERATION = 'false';
process.env.ALLOW_PAID_PROVIDER_FALLBACK = 'false';

console.log('\nAUTORIZACION LOCAL');
console.log('  Checkpoint vocal existente: REUTILIZADO');
console.log('  APIs externas: BLOQUEADAS');
console.log('  Gasto pagado: BLOQUEADO');

const result = await renderSingleShotReal(project, located.scene, located.shot);

console.log('\n==============================================');
console.log(' RERENDER CACHED COMPLETADO');
console.log('==============================================');
console.log('Fuente visual: ' + result.sourceVideoAsset);
console.log('Fuente preservada: ' + (result.sourcePreserved ? 'SI' : 'NO'));
console.log('SHA fuente: ' + result.sourceSha256After);
console.log('Audio bruto: ' + result.rawAudioDurationSeconds.toFixed(3) + 's');
console.log('Velocidad: ' + result.speedFactor.toFixed(3) + 'x');
console.log('Audio maestro: ' + result.masterAudioAsset);
console.log('Salida: ' + result.outputAsset);
console.log('Duración final: ' + result.outputDurationSeconds.toFixed(3) + 's');
console.log('OpenAI=NO | Veo=NO | ElevenLabs=NO | Fal=NO');
console.log('Gasto adicional: US$0');
console.log('SINGLE_RERENDER_CACHED_RUN=PASS');

function usage() {
  console.log('Uso:');
  console.log('  npm run single:rerender-cached -- preview <projectId> <shotId>');
  console.log('  npm run single:rerender-cached -- run <projectId> <shotId> --confirm-cached RERENDER LOCAL');
}
