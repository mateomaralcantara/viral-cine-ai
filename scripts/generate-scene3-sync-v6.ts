import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  produceScene3SynchronizedV6,
  SCENE3_SAFE_MAX_USD_V6
} from '@/lib/engine/scene3-sync-producer-v6';

loadProjectLocalEnvOverride();

const [projectId, confirmation] = process.argv.slice(2);
const EXPECTED = '--confirm-scene3-usd-1.98';

if (!projectId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene3:run -- <projectId> ' + EXPECTED
  );
  process.exit(1);
}

if (Math.abs(SCENE3_SAFE_MAX_USD_V6 - 1.98) > 0.0001) {
  throw new Error(
    'El tope interno de Escena 3 cambió a US$' +
      SCENE3_SAFE_MAX_USD_V6.toFixed(2) +
      '. Se requiere una nueva autorización explícita.'
  );
}

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — AUTORIZACION ESCENA 3');
console.log('==================================================');
console.log('Tope conservador autorizado: US$1.98');
console.log('Runway máximo: US$1.81');
console.log('OpenAI imágenes máximo interno: US$0.16');
console.log('OpenAI voz máximo: US$0.01');
console.log('Fal.ai: NO');
console.log('Fallback pagado: NO');
console.log('Música: NO');
console.log('Auditoría automática: NO');
console.log('');
console.log('T2: VOZ PRIMERO -> GROK 1.5 AUDIO-DRIVEN');
console.log('Audio final T2: EMBEBIDO por el video generado');
console.log('MP3 externo reinsertado después: NO');

const result = await produceScene3SynchronizedV6(projectId);

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 3 LISTA PARA REVISION');
console.log('==================================================');
console.log('Runway: ' + result.runwayCredits + ' créditos');
console.log('Runway estimado/registrado: US$' + result.runwayUsd.toFixed(2));
console.log('SCENE_VIDEO=' + result.sceneVideo);
console.log('SCENE_REVIEW_REQUIRED=YES');
console.log('REVISAR: voz exacta, boca/labios, identidad Mariana, reacción Elena.');
