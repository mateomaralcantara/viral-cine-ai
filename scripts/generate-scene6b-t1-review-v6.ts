import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  produceScene6BT1ReviewV6
} from '@/lib/engine/scene6b-t1-review-producer-v6';

loadProjectLocalEnvOverride();

const [projectId, confirmation] =
  process.argv.slice(2);

const EXPECTED =
  '--confirm-scene6b-t1-usd-0.13';

if (!projectId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene6b:t1 -- <projectId> ' +
      EXPECTED
  );
  process.exit(1);
}

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 6B / T1 REVIEW');
console.log('==================================================');
console.log('Única toma autorizada: T1');
console.log('Personaje visible: SOLO Sofía');
console.log('Duración: 4s');
console.log('Proveedor: Runway / Grok Lite');
console.log('Máximo: US$0.13');
console.log('T2: NO');
console.log('T3: NO');
console.log('Voz: NO');
console.log('Fal.ai: NO');
console.log('Retry automático: NO');
console.log('');

const result =
  await produceScene6BT1ReviewV6(projectId);

console.log('\n==================================================');
console.log(' E6B/T1 — LISTA PARA REVISION HUMANA');
console.log('==================================================');
console.log('Runway créditos: ' + result.credits);
console.log(
  'Runway registrado: US$' +
    result.usd.toFixed(2)
);
console.log('T1_VIDEO=' + result.video);
console.log('T1_REVIEW_REQUIRED=YES');
console.log(
  'REVISAR: Sofía debe seguir siendo niña, rostro estable, sin Elena/Mateo y sin morphing.'
);
