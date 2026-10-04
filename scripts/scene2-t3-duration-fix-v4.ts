import { access, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { getProject, projectRoot, saveProject } from '@/lib/storage/project-store';
import { inspectSingleVisualSource } from '@/lib/engine/single-visual-source-v4';
import { singleVoiceCheckpointPath } from '@/lib/engine/single-real-renderer-v4';
import { probeMediaDurationSeconds } from '@/lib/media/segmented-ffmpeg';

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

const visual = await inspectSingleVisualSource(project, scene, shot);
if (!visual.videoReady) throw new Error('E2/T3 no tiene video visual 4.1 listo.');

const voicePath = singleVoiceCheckpointPath(project, scene, shot);
if (!(await exists(voicePath))) {
  throw new Error('No existe checkpoint vocal 4.1; no aplicar ajuste de duración.');
}

const [sourceDuration, voiceDuration] = await Promise.all([
  probeMediaDurationSeconds(visual.videoPath),
  probeMediaDurationSeconds(voicePath)
]);

const currentDuration = shot.durationSeconds;
const targetDuration = Math.min(8, sourceDuration);
const requiredSpeedCurrent = voiceDuration / currentDuration;
const requiredSpeedTarget = voiceDuration / targetDuration;

console.log('\nVIRALCINE 4.1 — AJUSTE DURACION E2/T3');
console.log('Proyecto: ' + project.id);
console.log('Toma: E2/T3 ' + shot.id);
console.log('Duración actual: ' + currentDuration.toFixed(3) + 's');
console.log('Duración video Veo: ' + sourceDuration.toFixed(3) + 's');
console.log('Duración voz checkpoint: ' + voiceDuration.toFixed(3) + 's');
console.log('Velocidad necesaria actual: ' + requiredSpeedCurrent.toFixed(3) + 'x');
console.log('Duración propuesta: ' + targetDuration.toFixed(3) + 's');
console.log('Velocidad necesaria propuesta: ' + requiredSpeedTarget.toFixed(3) + 'x');
console.log('Límite seguro: 1.200x');
console.log('Checkpoint voz: LISTO — SE REUTILIZA');
console.log('Referencia/Veo: PRESERVADOS');

if (requiredSpeedTarget > 1.2) {
  throw new Error(
    'Ni usando ' + targetDuration.toFixed(3) +
    's la voz cabe dentro del límite seguro de 1.2x.'
  );
}

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: project.json NO se modifica.');
  console.log('  ElevenLabs=NO | OpenAI=NO | Veo=NO | Fal=NO');
  console.log('  Gasto: US$0');
  console.log('SCENE2_T3_DURATION_PREVIEW=PASS');
  process.exit(0);
}

const confirmation = rest.join(' ').trim();
if (confirmation !== '--confirm AJUSTAR DURACION E2 T3') {
  throw new Error(
    'Aplicación bloqueada. Usa exactamente: --confirm AJUSTAR DURACION E2 T3'
  );
}

const backupDir = path.join(projectRoot(project.id),'checkpoints');
await mkdir(backupDir,{recursive:true});
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
const backupPath = path.join(
  backupDir,
  'project-before-e2-t3-duration-' + stamp + '.json'
);
await copyFile(path.join(projectRoot(project.id),'project.json'),backupPath);

shot.durationSeconds = targetDuration;
if (shot.dialogueLines.length === 1) {
  shot.dialogueLines[0].startSeconds = 0;
  shot.dialogueLines[0].endSeconds = targetDuration;
}

project.productionLog.push(
  new Date().toISOString() +
  ' E2/T3 duración ajustada de ' + currentDuration.toFixed(3) +
  's a ' + targetDuration.toFixed(3) +
  's para reutilizar checkpoint vocal y mantener TTS dentro de 1.2x.'
);

await saveProject(project);

const verified = await getProject(project.id);
const verifiedShot = verified.plan?.scenes
  .find((item) => item.order === 2)
  ?.shots.find((item) => item.order === 3);

if (!verifiedShot || Math.abs(verifiedShot.durationSeconds - targetDuration) > 0.001) {
  throw new Error('Verificación falló: E2/T3 no conservó la nueva duración.');
}

console.log('\n==============================================');
console.log(' DURACION E2/T3 AJUSTADA');
console.log('==============================================');
console.log('Duración oficial de trabajo: ' + targetDuration.toFixed(3) + 's');
console.log('Checkpoint vocal: PRESERVADO');
console.log('Referencia/Veo: PRESERVADOS');
console.log('Backup project.json: ' + backupPath);
console.log('APIs externas: NO');
console.log('Gasto adicional: US$0');
console.log('SCENE2_T3_DURATION_APPLY=PASS');

async function exists(filePath:string) {
  try { await access(filePath); return true; } catch { return false; }
}

function usage() {
  console.log('Uso:');
  console.log('  npm run scene2:t3-duration -- preview <projectId>');
  console.log('  npm run scene2:t3-duration -- apply <projectId> --confirm AJUSTAR DURACION E2 T3');
}
