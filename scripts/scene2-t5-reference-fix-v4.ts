import { access, copyFile, mkdir, rm } from 'node:fs/promises';
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
  'Una sola acción dominante: María y Juan permanecen en primer término lateral observando mientras Jesús se aleja en profundidad con la comitiva cargando VISIBLAMENTE UN SOLO madero largo y rugoso sobre un hombro, sin travesaño, sin cruz ensamblada y sin forma de T o X; al menos una mano de Jesús agarra claramente la madera para sostenerla, y ninguna mano de Jesús toca, toma o se enlaza con la mano de un soldado. ' +
  'El único madero conserva una diagonal inequívoca sobre el cuerpo de Jesús y permanece visible de principio a fin. ' +
  'María, con velo arena y manto azul desaturado, y Juan, con túnica cruda y manto verde oliva apagado, quedan como marco emocional cercano sin bloquear a Jesús. ' +
  'Jesús conserva túnica de lino marfil muy gastada, manto marrón rojizo deteriorado, corona de espinas discreta y polvo en el rostro. ' +
  'Mantener eje de mirada, separación clara de planos y escala coherente: María y Juan cercanos, Jesús reconocible pero más distante. ' +
  'Movimiento de multitud secundario y contenido, realismo histórico sobrio, anatomía estable, sin violencia gráfica, sin montaje, sin texto, subtítulos ni logos.';

const newCamera =
  'Contraplano cinematográfico continuo desde detrás y ligeramente al costado de María y Juan hacia Jesús alejándose con la comitiva; María y Juan ocupan el primer término lateral sin bloquear el cuadro, Jesús permanece visible en profundidad con UN SOLO madero diagonalmente legible sobre el hombro y al menos una mano agarrando la madera; cámara casi fija o con microavance, sin cambio de ángulo.';

const root = projectRoot(project.id);
const folder = 'scene-02-shot-05-' + shot.id;
const referencePath = path.join(root, 'images', 'single-v4-sources', folder, 'reference.png');
const videoPath = path.join(root, 'video', 'single-v4-sources', folder, 'base-real.mp4');

console.log('\nVIRALCINE 4.1 — RECHAZO/REPARACION REFERENCIA E2/T5');
console.log('Proyecto: ' + project.id);
console.log('Toma: E2/T5 ' + shot.id);
console.log('\nPROBLEMAS VISUALES DETECTADOS');
console.log('  1. La referencia generó una cruz ensamblada / segundo travesaño, rompiendo continuidad con el madero único de E2/T2-E2/T3.');
console.log('  2. La mano visible de Jesús queda en contacto con la mano del soldado en vez de agarrar claramente el madero.');
console.log('\nPROMPT PROPUESTO');
console.log(newVisualPrompt);
console.log('\nCAMARA PROPUESTA');
console.log(newCamera);
console.log('\nASSETS ACTIVOS');
console.log('  Referencia: ' + ((await exists(referencePath)) ? 'EXISTE' : 'NO EXISTE'));
console.log('  Video: ' + ((await exists(videoPath)) ? 'EXISTE' : 'NO EXISTE'));

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: project.json y assets NO se modifican.');
  console.log('  OpenAI=NO | Veo=NO | ElevenLabs=NO | Fal=NO');
  console.log('  Gasto: US$0');
  console.log('SCENE2_T5_REFERENCE_FIX_PREVIEW=PASS');
  process.exit(0);
}

const confirmation = rest.join(' ').trim();
if (confirmation !== '--confirm RECHAZAR REFERENCIA E2 T5') {
  throw new Error('Aplicación bloqueada. Usa exactamente: --confirm RECHAZAR REFERENCIA E2 T5');
}

const checkpointDir = path.join(root, 'checkpoints');
await mkdir(checkpointDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(checkpointDir, 'project-before-e2-t5-reference-fix-' + stamp + '.json');
await copyFile(path.join(root, 'project.json'), backupPath);

const rejectedDir = path.join(checkpointDir, 'rejected-e2-t5-full-cross-hand-contact-' + stamp);
await mkdir(rejectedDir, { recursive: true });

if (await exists(referencePath)) {
  await copyFile(referencePath, path.join(rejectedDir, 'reference.png'));
  await rm(referencePath);
}
if (await exists(videoPath)) {
  await copyFile(videoPath, path.join(rejectedDir, 'base-real.mp4'));
  await rm(videoPath);
}

shot.visualPrompt = newVisualPrompt;
shot.camera = newCamera;
project.productionLog.push(
  new Date().toISOString() +
  ' E2/T5 referencia rechazada: cruz ensamblada/segundo travesaño y contacto mano-soldado; se exige madero único y mano agarrando madera.'
);

await saveProject(project);

const verified = await getProject(project.id);
const verifiedShot = verified.plan?.scenes
  .find((item) => item.order === 2)
  ?.shots.find((item) => item.order === 5);

if (!verifiedShot || verifiedShot.visualPrompt !== newVisualPrompt || verifiedShot.camera !== newCamera) {
  throw new Error('Verificación falló: E2/T5 no refleja la reparación.');
}
if (await exists(referencePath)) {
  throw new Error('La referencia rechazada sigue activa; no se puede continuar.');
}

console.log('\n==============================================');
console.log(' REFERENCIA E2/T5 RECHAZADA Y ARCHIVADA');
console.log('==============================================');
console.log('Backup project.json: ' + backupPath);
console.log('Assets rechazados archivados en: ' + rejectedDir);
console.log('Referencia activa: PENDIENTE');
console.log('Video activo: PENDIENTE');
console.log('Nueva idempotencia visual: v3');
console.log('OpenAI=NO | Veo=NO | ElevenLabs=NO | Fal=NO');
console.log('Gasto adicional: US$0');
console.log('SCENE2_T5_REFERENCE_FIX_APPLY=PASS');

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function usage() {
  console.log('Uso:');
  console.log('  npm run scene2:t5-reference-fix -- preview <projectId>');
  console.log('  npm run scene2:t5-reference-fix -- apply <projectId> --confirm RECHAZAR REFERENCIA E2 T5');
}
