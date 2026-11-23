import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  produceScene6ClosingV6
} from '@/lib/engine/scene6-closing-producer-v6';
import {
  SCENE6_SAFE_MAX_USD_V6
} from '@/lib/engine/scene6-closing-plan-v6';

loadProjectLocalEnvOverride();

const [projectId, confirmation] = process.argv.slice(2);
const EXPECTED = '--confirm-scene6-usd-0.67';

if (!projectId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene6:run -- <projectId> ' + EXPECTED
  );
  process.exit(1);
}

if (Math.abs(SCENE6_SAFE_MAX_USD_V6 - 0.67) > 0.0001) {
  throw new Error(
    'El tope interno cambió a US$' +
      SCENE6_SAFE_MAX_USD_V6.toFixed(2) +
      '. Se requiere nueva autorización.'
  );
}

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 6 AUTORIZADA');
console.log('==================================================');
console.log('Escena: 6 · Esta es nuestra casa · 12s');
console.log('T1: 4s Grok Lite silenciosa · US$0.13 máximo');
console.log('T2: Elena marin + WAN 3.0 · US$0.40 máximo');
console.log('T3: 4s Grok Lite silenciosa · US$0.13 máximo');
console.log('Voz OpenAI marin: US$0.01 máximo');
console.log('Máximo total autorizado: US$0.67');
console.log('Sofía: SIN DIÁLOGO');
console.log('Fal.ai: PROHIBIDO / NO USADO');
console.log('Imagen OpenAI nueva: NO');
console.log('Fallback pagado automático: NO');
console.log('Retry automático tras estado dudoso: NO');
console.log('');

const result = await produceScene6ClosingV6(projectId);

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 6 LISTA PARA REVISION');
console.log('==================================================');
console.log(
  'Runway usado en esta ejecución: ' +
    result.runwayCredits +
    ' créditos'
);
console.log(
  'Runway registrado: US$' +
    result.runwayUsd.toFixed(2)
);
console.log(
  'Voz estimada: US$' +
    result.voiceUsdEstimated.toFixed(4)
);
console.log('Fal.ai: NO');
console.log('SCENE_VIDEO=' + result.sceneVideo);
console.log('SCENE_REVIEW_REQUIRED=YES');
console.log(
  'REVISAR: continuidad desde Escena 5, reacción de Sofía, frase exacta de Elena, lip-sync T2 y abrazo final.'
);
