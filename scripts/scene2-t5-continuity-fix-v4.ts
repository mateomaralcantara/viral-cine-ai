import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { getProject, projectRoot, saveProject } from '@/lib/storage/project-store';

loadProjectLocalEnvOverride();

const [command, projectId, ...rest] = process.argv.slice(2);
if (!command || !projectId || !['preview','apply'].includes(command)) {
  usage();
  process.exit(1);
}

const project = await getProject(projectId);
if (!project.plan) throw new Error('El proyecto no tiene plan.');

const scene = project.plan.scenes.find((item) => item.order === 2);
const shot = scene?.shots.find((item) => item.order === 5);
if (!scene || !shot) throw new Error('No se encontró E2/T5.');

const newVisualPrompt =
  'Calle estrecha de Jerusalén del siglo I, polvo de mañana y comitiva avanzando. ' +
  'Una sola acción dominante: María y Juan permanecen en primer término lateral observando mientras Jesús se aleja en profundidad con la comitiva cargando VISIBLAMENTE el gran madero rugoso sobre un hombro; el madero mantiene una diagonal inequívoca sobre su cuerpo y no desaparece del encuadre, y Jesús nunca aparece con las manos libres o juntas. ' +
  'María, con velo arena y manto azul desaturado, y Juan, con túnica cruda y manto verde oliva apagado, quedan como marco emocional cercano sin bloquear a Jesús. ' +
  'Jesús conserva túnica de lino marfil muy gastada, manto marrón rojizo deteriorado, corona de espinas discreta y polvo en el rostro. ' +
  'Mantener eje de mirada, separación clara de planos y escala coherente: María y Juan cercanos, Jesús reconocible pero más distante. ' +
  'Movimiento de multitud secundario y contenido, realismo histórico sobrio, anatomía estable, sin violencia gráfica, sin montaje, sin texto, subtítulos ni logos.';

const newCamera =
  'Contraplano cinematográfico continuo desde detrás y ligeramente al costado de María y Juan hacia Jesús alejándose con la comitiva; María y Juan ocupan el primer término lateral sin bloquear el cuadro, Jesús permanece visible en profundidad con el madero diagonalmente legible durante toda la toma; cámara casi fija o con microavance, sin cambio de ángulo.';

console.log('\nVIRALCINE 4.1 — REPARACION CONTINUIDAD E2/T5');
console.log('Proyecto: ' + project.id);
console.log('Toma: E2/T5 ' + shot.id);
console.log('\nRIESGO DETECTADO');
console.log('  El action anchor actual solo dice “la distancia física y emocional entre una madre y su hijo”.');
console.log('  Eso no obliga al generador a mostrar a Jesús cargando el madero ni a mantenerlo visible.');
console.log('\nPROMPT PROPUESTO');
console.log(newVisualPrompt);
console.log('\nCAMARA PROPUESTA');
console.log(newCamera);

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: project.json NO se modifica.');
  console.log('  OpenAI=NO | Veo=NO | ElevenLabs=NO | Fal=NO');
  console.log('  Gasto: US$0');
  console.log('SCENE2_T5_CONTINUITY_PREVIEW=PASS');
  process.exit(0);
}

const confirmation = rest.join(' ').trim();
if (confirmation !== '--confirm REPARAR E2 T5') {
  throw new Error('Aplicación bloqueada. Usa exactamente: --confirm REPARAR E2 T5');
}

const backupDir = path.join(projectRoot(project.id), 'checkpoints');
await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(
  backupDir,
  'project-before-e2-t5-continuity-' + stamp + '.json'
);
await copyFile(path.join(projectRoot(project.id), 'project.json'), backupPath);

shot.visualPrompt = newVisualPrompt;
shot.camera = newCamera;

project.productionLog.push(
  new Date().toISOString() +
  ' E2/T5 continuidad reforzada: María/Juan primer término; Jesús distante con madero visible durante toda la toma.'
);

await saveProject(project);

const verified = await getProject(project.id);
const verifiedShot = verified.plan?.scenes
  .find((item) => item.order === 2)
  ?.shots.find((item) => item.order === 5);

if (!verifiedShot || verifiedShot.visualPrompt !== newVisualPrompt || verifiedShot.camera !== newCamera) {
  throw new Error('Verificación falló: E2/T5 no refleja la reparación de continuidad.');
}

console.log('\n==============================================');
console.log(' REPARACION E2/T5 APLICADA');
console.log('==============================================');
console.log('Backup project.json: ' + backupPath);
console.log('Assets visuales: NO GENERADOS / NO TOCADOS');
console.log('OpenAI=NO | Veo=NO | ElevenLabs=NO | Fal=NO');
console.log('Gasto adicional: US$0');
console.log('SCENE2_T5_CONTINUITY_APPLY=PASS');

function usage() {
  console.log('Uso:');
  console.log('  npm run scene2:t5-fix -- preview <projectId>');
  console.log('  npm run scene2:t5-fix -- apply <projectId> --confirm REPARAR E2 T5');
}
