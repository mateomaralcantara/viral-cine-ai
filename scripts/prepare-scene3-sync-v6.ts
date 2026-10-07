import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { applyFifteenDaysCoreVoiceLocksV5 } from '@/lib/engine/fifteen-days-voice-lock-v5';
import {
  planScene3SynchronizedV6,
  validateScene3SynchronizedV6,
  SCENE3_DIALOGUE_V6
} from '@/lib/engine/scene3-sync-plan-v6';
import { getProject, saveProject } from '@/lib/storage/project-store';
import { grok15AudioDrivenCredits, grokLiteImageToVideoCredits } from '@/lib/providers/runway-router-v6';

loadProjectLocalEnvOverride();

const [projectId] = process.argv.slice(2);
if (!projectId) {
  console.error('Uso: npm run safe:scene3:prepare -- <projectId>');
  process.exit(1);
}

let project = await getProject(projectId);
if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
  throw new Error('Este comando solo está autorizado para 15 DÍAS.');
}

const scene2 = project.plan?.scenes.find((item) => item.order === 2);
if (!scene2 || scene2.status !== 'ready') {
  throw new Error(
    'La Escena 2 debe estar APROBADA/ready antes de preparar la Escena 3. ' +
      'Usa: npm run scene:15dias -- approve <projectId> 2'
  );
}

applyFifteenDaysCoreVoiceLocksV5(project);
planScene3SynchronizedV6(project);
validateScene3SynchronizedV6(project);
project = await saveProject(project);

const liteCredits = grokLiteImageToVideoCredits(8, 'auto_720p');
const dialogueCredits = grok15AudioDrivenCredits(8, '720p', 1, 1);
const videoCredits = liteCredits + dialogueCredits + liteCredits;

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 3 / PREPRODUCCION');
console.log('==================================================');
console.log('Escena 3: Alguien se detuvo · 24s');
console.log('');
console.log('ARQUITECTURA');
console.log('1. PLANIFICACION: 3 tomas de 8s');
console.log('2. T1: setup silencioso Elena + Mariana');
console.log('3. VOZ PRIMERO: Mariana / OpenAI cedar / texto exacto');
console.log('4. T2: Grok 1.5 audio-driven con la voz como referencia');
console.log('5. SINCRONIA: video y boca se generan condicionados por esa voz');
console.log('6. FINAL T2: conservar audio EMBEBIDO del video generado');
console.log('7. T3: reaccion silenciosa de Elena');
console.log('8. COMPOSICION: FFmpeg local');
console.log('9. REVISION HUMANA de escena completa');
console.log('');
console.log('DIALOGO EXACTO');
console.log(SCENE3_DIALOGUE_V6);
console.log('');
console.log('COSTO VIDEO MAXIMO');
console.log('- T1 Grok Lite: ' + liteCredits + ' créditos');
console.log('- T2 Grok 1.5 audio-driven: ' + dialogueCredits + ' créditos');
console.log('- T3 Grok Lite: ' + liteCredits + ' créditos');
console.log('- Total Runway: ' + videoCredits + ' créditos = US$' + (videoCredits * 0.01).toFixed(2));
console.log('- Voz OpenAI: tope interno de autorización US$0.01');
console.log('- TOPE INTERNO ESCENA 3: US$1.81');
console.log('');
console.log('Fal.ai: NO');
console.log('Fallback pagado: NO');
console.log('Música: NO');
console.log('Auditoría automática: NO');
console.log('Lip-sync separado posterior: NO; T2 es audio-driven desde origen.');
console.log('');
console.log('PREPARE_ONLY=YES');
console.log('APIs externas: NO');
console.log('Gasto: US$0');
console.log('SCENE3_SYNC_PLAN=READY');
