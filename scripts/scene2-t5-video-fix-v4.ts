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
  'Una sola acción dominante: María y Juan permanecen en primer término lateral, de espaldas o tres cuartos de espaldas y sin girarse hacia cámara ni entre sí, mientras Jesús se aleja en profundidad cargando VISIBLAMENTE UN SOLO madero largo y rugoso sobre un hombro; al menos una mano de Jesús agarra la madera, nadie enlaza manos con soldados y no aparece ningún farol, lámpara, aplique, poste, cable, herraje ni mobiliario urbano moderno. ' +
  'María conserva velo arena y manto azul desaturado; Juan conserva túnica cruda y manto verde oliva apagado, rostro limpio y sin bigote; Jesús conserva túnica de lino marfil muy gastada, manto marrón rojizo deteriorado, corona de espinas discreta y polvo en el rostro. ' +
  'Mantener eje de mirada, separación clara de planos y escala coherente; realismo histórico sobrio, anatomía estable, sin violencia gráfica, sin montaje, sin texto, subtítulos ni logos.';

const newCamera =
  'Contraplano cinematográfico continuo desde detrás y ligeramente al costado de María y Juan hacia Jesús alejándose; María y Juan mantienen orientación posterior o tres cuartos posterior durante toda la toma y no se giran a cámara ni inician una interacción entre sí; Juan mantiene el mismo rostro limpio, sin bigote ni barba nueva; Jesús permanece visible en profundidad con UN SOLO madero diagonalmente legible y una mano agarrando la madera; cámara casi fija o con microavance, sin cambio de ángulo y sin revelar o introducir luminarias, faroles o accesorios modernos.';

const root = projectRoot(project.id);
const folder = 'scene-02-shot-05-' + shot.id;
const referencePath = path.join(root, 'images', 'single-v4-sources', folder, 'reference.png');
const videoPath = path.join(root, 'video', 'single-v4-sources', folder, 'base-real.mp4');

console.log('\nVIRALCINE 4.1 — RECHAZO/REPARACION VIDEO E2/T5');
console.log('Proyecto: ' + project.id);
console.log('Toma: E2/T5 ' + shot.id);
console.log('\nPROBLEMAS VISUALES DETECTADOS');
console.log('  1. Veo introdujo una luminaria/farol moderno en la calle histórica.');
console.log('  2. Juan gira hacia cámara y deriva de identidad, apareciendo con bigote/rasgos distintos.');
console.log('  3. La acción de María/Juan deja de ser solo marco emocional y compite con Jesús al fondo.');
console.log('\nPROMPT PROPUESTO');
console.log(newVisualPrompt);
console.log('\nCAMARA PROPUESTA');
console.log(newCamera);
console.log('\nASSETS ACTIVOS');
console.log('  Referencia V3: ' + ((await exists(referencePath)) ? 'EXISTE — SE PRESERVA' : 'NO EXISTE'));
console.log('  Video V3: ' + ((await exists(videoPath)) ? 'EXISTE — SE ARCHIVARA' : 'NO EXISTE'));

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: project.json y assets NO se modifican.');
  console.log('  Referencia V3 NO se toca.');
  console.log('  OpenAI=NO | Veo=NO | ElevenLabs=NO | Fal=NO');
  console.log('  Gasto: US$0');
  console.log('SCENE2_T5_VIDEO_FIX_PREVIEW=PASS');
  process.exit(0);
}

const confirmation = rest.join(' ').trim();
if (confirmation !== '--confirm RECHAZAR VIDEO E2 T5') {
  throw new Error('Aplicación bloqueada. Usa exactamente: --confirm RECHAZAR VIDEO E2 T5');
}
if (!(await exists(referencePath))) {
  throw new Error('La referencia V3 no existe; no se puede preservar/reutilizar.');
}

const checkpointDir = path.join(root, 'checkpoints');
await mkdir(checkpointDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(checkpointDir, 'project-before-e2-t5-video-fix-' + stamp + '.json');
await copyFile(path.join(root, 'project.json'), backupPath);

const rejectedDir = path.join(checkpointDir, 'rejected-e2-t5-modern-lamp-juan-drift-' + stamp);
await mkdir(rejectedDir, { recursive: true });

if (await exists(videoPath)) {
  await copyFile(videoPath, path.join(rejectedDir, 'base-real.mp4'));
  await rm(videoPath);
}

shot.visualPrompt = newVisualPrompt;
shot.camera = newCamera;
project.productionLog.push(
  new Date().toISOString() +
  ' E2/T5 video rechazado: luminaria moderna + giro/deriva de Juan; referencia V3 preservada y video preparado para regeneración.'
);

await saveProject(project);

const verified = await getProject(project.id);
const verifiedShot = verified.plan?.scenes
  .find((item) => item.order === 2)
  ?.shots.find((item) => item.order === 5);

if (!verifiedShot || verifiedShot.visualPrompt !== newVisualPrompt || verifiedShot.camera !== newCamera) {
  throw new Error('Verificación falló: E2/T5 no refleja la reparación de video.');
}
if (!(await exists(referencePath))) {
  throw new Error('La referencia V3 fue alterada o perdida.');
}
if (await exists(videoPath)) {
  throw new Error('El video rechazado sigue activo; no se puede continuar.');
}

console.log('\n==============================================');
console.log(' VIDEO E2/T5 RECHAZADO Y ARCHIVADO');
console.log('==============================================');
console.log('Backup project.json: ' + backupPath);
console.log('Video rechazado archivado en: ' + rejectedDir);
console.log('Referencia V3: PRESERVADA');
console.log('Video activo: PENDIENTE');
console.log('Nueva idempotencia video: v4');
console.log('OpenAI=NO | Veo=NO | ElevenLabs=NO | Fal=NO');
console.log('Gasto adicional: US$0');
console.log('SCENE2_T5_VIDEO_FIX_APPLY=PASS');

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
  console.log('  npm run scene2:t5-video-fix -- preview <projectId>');
  console.log('  npm run scene2:t5-video-fix -- apply <projectId> --confirm RECHAZAR VIDEO E2 T5');
}
