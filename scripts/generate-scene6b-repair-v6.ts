import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  produceScene6BRepairV6
} from '@/lib/engine/scene6b-repair-producer-v6';
import {
  SCENE6B_MAX_VIDEO_USD_V6,
  SCENE6B_AUTHORIZED_MAX_USD_V6
} from '@/lib/engine/scene6b-repair-spec-v6';

loadProjectLocalEnvOverride();

const [projectId, confirmation] =
  process.argv.slice(2);
const EXPECTED =
  '--confirm-scene6b-usd-0.67';

if (
  !projectId ||
  confirmation !== EXPECTED
) {
  console.error(
    'Uso: npm run safe:scene6b:run -- <projectId> ' +
      EXPECTED
  );
  process.exit(1);
}

if (
  Math.abs(
    SCENE6B_AUTHORIZED_MAX_USD_V6 - 0.67
  ) > 0.0001
) {
  throw new Error(
    'El tope autorizado interno cambió a US$' +
      SCENE6B_AUTHORIZED_MAX_USD_V6.toFixed(2) +
      '. Se requiere nueva autorización.'
  );
}

if (
  Math.abs(
    SCENE6B_MAX_VIDEO_USD_V6 - 0.66
  ) > 0.0001
) {
  throw new Error(
    'El costo máximo real de video cambió a US$' +
      SCENE6B_MAX_VIDEO_USD_V6.toFixed(2) +
      '. Se requiere nueva autorización.'
  );
}

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 6B REPAIR');
console.log('==================================================');
console.log('T1: SOLO Sofía · Grok Lite · US$0.13 máximo');
console.log('T2: SOLO Elena · marin reutilizado + WAN 3.0 · US$0.40 máximo');
console.log('T3: abrazo familiar desde atrás · Grok Lite · US$0.13 máximo');
console.log('Voz OpenAI nueva: NO');
console.log('Imagen OpenAI nueva: NO');
console.log('Máximo real esperado: US$0.66');
console.log('Máximo autorizado: US$0.67');
console.log('Fal.ai: PROHIBIDO / NO USADO');
console.log('Fallback pagado automático: NO');
console.log('Retry automático tras estado dudoso: NO');
console.log('Master Scene 6 anterior: PRESERVADO');
console.log('');

const result =
  await produceScene6BRepairV6(projectId);

console.log('\n==================================================');
console.log(' ESCENA 6B REPAIR — LISTA PARA REVISION');
console.log('==================================================');
console.log(
  'Runway usado: ' +
    result.runwayCredits +
    ' créditos'
);
console.log(
  'Runway registrado: US$' +
    result.runwayUsd.toFixed(2)
);
console.log(
  'Voz nueva registrada: US$' +
    result.voiceUsd.toFixed(2)
);
console.log(
  'MASTER_ANTERIOR=' +
    result.previousSceneVideo
);
console.log(
  'SCENE6B_VIDEO=' +
    result.sceneVideo
);
console.log('SCENE6B_REVIEW_REQUIRED=YES');
console.log(
  'REVISAR: T1 Sofía no cambia de edad/rostro; T2 solo Elena; T3 tres cuerpos separados, de espaldas y sin rostros visibles.'
);
