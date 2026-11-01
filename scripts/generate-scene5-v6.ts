import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  produceScene5ReunionV6
} from '@/lib/engine/scene5-reunion-producer-v6';
import {
  SCENE5_SAFE_MAX_USD_V6
} from '@/lib/engine/scene5-reunion-plan-v6';

loadProjectLocalEnvOverride();

const [projectId, confirmation] = process.argv.slice(2);
const EXPECTED = '--confirm-scene5-usd-2.13';

if (!projectId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene5:run -- <projectId> ' + EXPECTED
  );
  process.exit(1);
}

if (Math.abs(SCENE5_SAFE_MAX_USD_V6 - 2.13) > 0.0001) {
  throw new Error(
    'El tope interno cambió a US$' +
      SCENE5_SAFE_MAX_USD_V6.toFixed(2) +
      '. Se requiere nueva autorización.'
  );
}

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 5 AUTORIZADA');
console.log('==================================================');
console.log('Escena: 5 · De verdad · 30s');
console.log('T1: 7s Grok Lite silenciosa · US$0.22 máximo');
console.log('T2: 7s Grok Lite silenciosa · US$0.22 máximo');
console.log('T3: 4s WAN 3.0 Mateo · US$0.40 máximo');
console.log('T4: 4s WAN 3.0 Elena · US$0.40 máximo');
console.log('T5: 4s WAN 3.0 Mateo · US$0.40 máximo');
console.log('T6: 4s WAN 3.0 Elena · US$0.40 máximo');
console.log('Referencia familiar OpenAI: US$0.08 máximo');
console.log('Voces OpenAI: US$0.01 máximo');
console.log('Máximo total autorizado: US$2.13');
console.log('Mateo: OpenAI ash APROBADO');
console.log('Elena: OpenAI marin');
console.log('Sofía: silenciosa en esta escena');
console.log('Fal.ai: PROHIBIDO / NO USADO');
console.log('Fallback pagado automático: NO');
console.log('Retry automático tras estado dudoso: NO');
console.log('');

const result = await produceScene5ReunionV6(projectId);

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 5 LISTA PARA REVISION');
console.log('==================================================');
console.log('Runway usado en esta ejecución: ' + result.runwayCredits + ' créditos');
console.log('Runway registrado: US$' + result.runwayUsd.toFixed(2));
console.log('Referencia OpenAI nueva: US$' + result.referenceImageUsd.toFixed(2));
console.log('Voz estimada: US$' + result.voiceUsdEstimated.toFixed(4));
console.log('Fal.ai: NO');
console.log('SCENE_VIDEO=' + result.sceneVideo);
console.log('SCENE_REVIEW_REQUIRED=YES');
console.log('REVISAR: identidad de Elena/Sofía/Mateo, abrazo T2, voz infantil Mateo y lip-sync T3-T6.');
