import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { applyFifteenDaysCoreVoiceLocksV5 } from '@/lib/engine/fifteen-days-voice-lock-v5';
import {
  planScene4MontageV6,
  validateScene4MontageV6,
  SCENE4_NARRATION_V6
} from '@/lib/engine/scene4-montage-plan-v6';
import { getProject, saveProject } from '@/lib/storage/project-store';
import { grokLiteImageToVideoCredits } from '@/lib/providers/runway-router-v6';

loadProjectLocalEnvOverride();

const [projectId] = process.argv.slice(2);
if (!projectId) {
  console.error('Uso: npm run safe:scene4:prepare -- <projectId>');
  process.exit(1);
}

let project = await getProject(projectId);

if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
  throw new Error('Este comando solo está autorizado para 15 DÍAS.');
}

const scene3 = project.plan?.scenes.find((item) => item.order === 3);
if (!scene3 || scene3.status !== 'ready') {
  throw new Error(
    'La Escena 3 debe estar APROBADA/ready antes de preparar la Escena 4.'
  );
}

applyFifteenDaysCoreVoiceLocksV5(project);
planScene4MontageV6(project);
validateScene4MontageV6(project);
project = await saveProject(project);

const perShot = grokLiteImageToVideoCredits(6, 'auto_720p');
const videoCredits = perShot * 5;

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 4 / PREPRODUCCION');
console.log('==================================================');
console.log('Escena 4: Quince días · 30s');
console.log('');
console.log('ARQUITECTURA');
console.log('1. MONTAJE: 5 tomas x 6s');
console.log('2. T1: Día 1 — volver al cuaderno');
console.log('3. T2: Día 4 — disciplina');
console.log('4. T3: Día 8 — corregir con Mariana');
console.log('5. T4: Día 12 — publicar');
console.log('6. T5: Día 15 — primera venta');
console.log('');
console.log('NARRACION');
console.log('- Una sola pista de voz en off para toda la escena');
console.log('- Voz: Narrador/Elena según Voice Lock');
console.log('- Texto exacto:');
console.log(SCENE4_NARRATION_V6);
console.log('');
console.log('LIP-SYNC');
console.log('- Diálogo visible: NO');
console.log('- Movimiento de labios de habla: NO');
console.log('- Las cinco tomas deben mostrar personajes en silencio');
console.log('- La narración se monta por encima como voz en off');
console.log('');
console.log('COSTO PREVISTO PARA UNA FUTURA GENERACION');
console.log('- Grok Lite por toma: ' + perShot + ' créditos');
console.log('- Cinco tomas: ' + videoCredits + ' créditos = US$' + (videoCredits * 0.01).toFixed(2));
console.log('- Una sola voz TTS: tope interno US$0.01');
console.log('- Tope interno previsto Escena 4: US$0.96');
console.log('');
console.log('Fal.ai: NO');
console.log('Música nueva durante esta escena: NO');
console.log('Fallback pagado automático: NO');
console.log('Auditoría IA automática: NO');
console.log('');
console.log('PREPARE_ONLY=YES');
console.log('APIs externas: NO');
console.log('Gasto: US$0');
console.log('SCENE4_PLAN=READY');
