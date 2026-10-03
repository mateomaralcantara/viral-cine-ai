import { access, copyFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { getProject, projectAssetDir, projectRoot, saveProject } from '@/lib/storage/project-store';

loadProjectLocalEnvOverride();

const [command, projectId, ...rest] = process.argv.slice(2);
if (!command || !projectId || !['preview','apply'].includes(command)) {
  usage();
  process.exit(1);
}

const project = await getProject(projectId);
if (!project.plan) throw new Error('El proyecto no tiene plan.');

const scene = project.plan.scenes.find((item) => item.order === 2);
const shot = scene?.shots.find((item) => item.order === 3);
if (!scene || !shot) throw new Error('No se encontró E2/T3.');

const folder = 'scene-02-shot-03-' + shot.id;
const referencePath = path.join(projectAssetDir(project.id,'images'),'single-v4-sources',folder,'reference.png');
const videoPath = path.join(projectAssetDir(project.id,'video'),'single-v4-sources',folder,'base-real.mp4');

const newVisualPrompt =
  'Calle estrecha de Jerusalén del siglo I, multitud en movimiento y polvo de mañana. ' +
  'María, con velo arena y manto azul desaturado, reconoce a Jesús a cierta distancia entre soldados, cascos y lanzas. ' +
  'Una sola acción dominante: María reconoce a su hijo mientras Jesús continúa al fondo cargando VISIBLAMENTE el gran madero rugoso sobre un hombro, con al menos una mano sujetándolo; Jesús nunca aparece con las manos libres o juntas y el madero no desaparece del encuadre. ' +
  'Primer plano emocional de María con microexpresiones realistas, ojos húmedos y respiración contenida; Jesús permanece secundario y desenfocado, pero debe conservarse legible la diagonal del madero sobre su cuerpo. ' +
  'No convertir a Jesús ni a los soldados en protagonistas. Identidad facial estable, anatomía natural, sin manos bloqueando el rostro, sin montaje, sin texto, subtítulos, logos ni pose de póster.';

const newCamera =
  'Primer plano emocional de María con leve desplazamiento lateral; Jesús permanece al fondo desenfocado pero con una porción inequívoca del madero visible diagonalmente sobre su hombro durante toda la toma.';

console.log('\nVIRALCINE 4.1 — REPARACION CONTINUIDAD E2/T3');
console.log('Proyecto: ' + project.id);
console.log('Toma: E2/T3 ' + shot.id);
console.log('Problema: Jesús aparece al fondo sin el madero, rompiendo continuidad con E2/T2.');
console.log('\nPROMPT PROPUESTO');
console.log(newVisualPrompt);
console.log('\nCAMARA PROPUESTA');
console.log(newCamera);
console.log('\nASSETS ACTUALES');
console.log('  Referencia: ' + ((await exists(referencePath)) ? 'EXISTE' : 'NO'));
console.log('  Video: ' + ((await exists(videoPath)) ? 'EXISTE' : 'NO'));

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: project.json NO se modifica.');
  console.log('  Assets actuales NO se mueven.');
  console.log('  OpenAI=NO | Veo=NO | ElevenLabs=NO | Fal=NO');
  console.log('  Gasto: US$0');
  console.log('SCENE2_T3_CONTINUITY_PREVIEW=PASS');
  process.exit(0);
}

const confirmation = rest.join(' ').trim();
if (confirmation !== '--confirm REPARAR E2 T3') {
  throw new Error('Aplicación bloqueada. Usa exactamente: --confirm REPARAR E2 T3');
}

const backupDir = path.join(projectRoot(project.id),'checkpoints');
await mkdir(backupDir,{recursive:true});
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
const backupProject = path.join(backupDir,'project-before-e2-t3-continuity-' + stamp + '.json');
await copyFile(path.join(projectRoot(project.id),'project.json'),backupProject);

const archiveRoot = path.join(backupDir,'rejected-e2-t3-no-cross-' + stamp);
await mkdir(path.join(archiveRoot,'images'),{recursive:true});
await mkdir(path.join(archiveRoot,'video'),{recursive:true});

if (await exists(referencePath)) {
  await rename(referencePath,path.join(archiveRoot,'images','reference.png'));
}
if (await exists(videoPath)) {
  await rename(videoPath,path.join(archiveRoot,'video','base-real.mp4'));
}

shot.visualPrompt = newVisualPrompt;
shot.camera = newCamera;

const now = new Date().toISOString();
project.productionLog.push(
  now + ' E2/T3 QA: referencia/video 4.1 rechazados por discontinuidad del madero; ' +
  'assets archivados y prompt reforzado para regeneración v2.'
);

await saveProject(project);

const verified = await getProject(project.id);
const verifiedShot = verified.plan?.scenes
  .find((item) => item.order === 2)
  ?.shots.find((item) => item.order === 3);

if (!verifiedShot || verifiedShot.visualPrompt !== newVisualPrompt || verifiedShot.camera !== newCamera) {
  throw new Error('Verificación posterior falló: E2/T3 no refleja la reparación.');
}
if (await exists(referencePath) || await exists(videoPath)) {
  throw new Error('Verificación posterior falló: quedaron assets antiguos en la ruta activa.');
}

console.log('\n==============================================');
console.log(' REPARACION E2/T3 APLICADA');
console.log('==============================================');
console.log('Project.json backup: ' + backupProject);
console.log('Assets rechazados archivados en: ' + archiveRoot);
console.log('Referencia activa: PENDIENTE');
console.log('Video activo: PENDIENTE');
console.log('Idempotencia visual nueva: v2');
console.log('OpenAI=NO | Veo=NO | ElevenLabs=NO | Fal=NO');
console.log('Gasto adicional: US$0');
console.log('SCENE2_T3_CONTINUITY_APPLY=PASS');

async function exists(filePath:string) {
  try { await access(filePath); return true; } catch { return false; }
}

function usage() {
  console.log('Uso:');
  console.log('  npm run scene2:t3-fix -- preview <projectId>');
  console.log('  npm run scene2:t3-fix -- apply <projectId> --confirm REPARAR E2 T3');
}
