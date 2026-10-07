import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  produceScene4MontageV6,
  SCENE4_SAFE_MAX_USD_V6
} from '@/lib/engine/scene4-montage-producer-v6';

loadProjectLocalEnvOverride();

const [projectId, confirmation] = process.argv.slice(2);
const EXPECTED = '--confirm-scene4-usd-0.96';

if (!projectId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene4:run -- <projectId> ' + EXPECTED
  );
  process.exit(1);
}

if (Math.abs(SCENE4_SAFE_MAX_USD_V6 - 0.96) > 0.0001) {
  throw new Error(
    'El tope interno cambió a US$' +
      SCENE4_SAFE_MAX_USD_V6.toFixed(2) +
      '. Se requiere nueva autorización.'
  );
}

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 4 AUTORIZADA');
console.log('==================================================');
console.log('Escena: 4 · Quince días · 30s');
console.log('Visual: 5 x Grok Lite 720p / 6s');
console.log('Máximo Runway: 95 créditos = US$0.95');
console.log('Narración: una sola voz femenina OpenAI marin');
console.log('Máximo TTS: US$0.01');
console.log('Máximo total: US$0.96');
console.log('Lip-sync: NO');
console.log('Fal.ai: NO');
console.log('Música nueva: NO');
console.log('Fallback pagado: NO');
console.log('Auditoría IA automática: NO');
console.log('');

const result = await produceScene4MontageV6(projectId);

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 4 LISTA PARA REVISION');
console.log('==================================================');
console.log('Runway usado en esta ejecución: ' + result.runwayCredits + ' créditos');
console.log('Runway registrado: US$' + result.runwayUsd.toFixed(2));
console.log('SCENE_VIDEO=' + result.sceneVideo);
console.log('SCENE_REVIEW_REQUIRED=YES');
console.log('REVISAR: identidad Elena, progresión de 15 días, publicación, primera venta y voz en off.');
