import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { getProject, projectRoot, saveProject } from '@/lib/storage/project-store';

loadProjectLocalEnvOverride();

const [command, projectId, ...rest] = process.argv.slice(2);
if (!command || !projectId || !['preview', 'apply'].includes(command)) {
  usage();
  process.exit(1);
}

const project = await getProject(projectId);
if (!project.plan) throw new Error('El proyecto no tiene plan.');
const scene = project.plan.scenes.find((item) => item.order === 2);
if (!scene) throw new Error('No existe la Escena 2.');

const shots = new Map(scene.shots.map((shot) => [shot.order, shot]));
for (let order = 1; order <= 7; order += 1) {
  if (!shots.has(order)) throw new Error('Falta E2/T' + order + '.');
}

const maria = findCharacter('maria');
const juan = findCharacter('juan');
if (!maria || !juan) throw new Error('No se pudieron resolver María/Juan en el casting.');

const proposed = new Map<number, string>([
  [2, 'Su aspereza se sumaba al cansancio acumulado y a todo lo que significaba. Los soldados abrieron paso entre la gente.'],
  [3, 'Sin detenerse ante llantos ni burlas, los soldados avanzaron. A cierta distancia, María reconoció a su hijo entre el polvo y las lanzas.'],
  [4, 'Juan se mantuvo junto a ella, atento a que la multitud no la arrastrara.'],
  [5, 'Nadie podía aliviar todavía la distancia entre una madre y su hijo.'],
  [6, 'Mientras Jesús cruzaba el umbral del patio, la mirada de María no se apartó de él.'],
  [7, 'El camino hacia el Gólgota había comenzado. MARÍA: Jesús... JUAN: Estoy contigo. No te soltaré.']
]);

console.log('\nVIRALCINE 4.1 — CONTINUIDAD NARRATIVA ESCENA 2');
console.log('Proyecto: ' + project.id);
console.log('Escena: E2 ' + scene.title);
console.log('E2/T1: PRESERVADA — texto y assets no se modifican.');

for (let order = 2; order <= 6; order += 1) {
  const shot = shots.get(order)!;
  console.log('\nE2/T' + order);
  console.log('  ANTES: ' + shot.spokenText);
  console.log('  DESPUES: ' + proposed.get(order));
  console.log('  speaker: narrator');
  console.log('  assets: PRESERVADOS');
}

console.log('\nE2/T7');
console.log('  ANTES: ' + shots.get(7)!.spokenText);
console.log('  DESPUES: ' + proposed.get(7));
console.log('  Turnos:');
console.log('    0.000→3.500 | narrator | El camino hacia el Gólgota había comenzado.');
console.log('    3.500→4.300 | ' + maria.id + ' | Jesús...');
console.log('    4.300→7.000 | ' + juan.id + ' | Estoy contigo. No te soltaré.');

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: project.json NO se modifica.');
  console.log('  E2/T1 NO se toca.');
  console.log('  Imágenes/videos existentes NO se tocan.');
  console.log('  OpenAI=NO | Veo=NO | ElevenLabs=NO | Fal=NO');
  console.log('  Gasto: US$0');
  console.log('SCENE2_NARRATION_PREVIEW=PASS');
  process.exit(0);
}

const confirmation = rest.join(' ').trim();
if (confirmation !== '--confirm APLICAR NARRACION E2') {
  throw new Error('Aplicación bloqueada. Usa exactamente: --confirm APLICAR NARRACION E2');
}

const backupDir = path.join(projectRoot(project.id), 'checkpoints');
await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(
  backupDir,
  'project-before-scene2-narration-' + stamp + '.json'
);
await copyFile(path.join(projectRoot(project.id), 'project.json'), backupPath);

for (let order = 2; order <= 6; order += 1) {
  const shot = shots.get(order)!;
  const text = proposed.get(order)!;
  shot.spokenText = text;
  shot.speakerId = 'narrator';
  shot.dialogueLines = [{
    id: shot.dialogueLines[0]?.id || shot.id + ':narrator',
    speakerId: 'narrator',
    text,
    startSeconds: 0,
    endSeconds: shot.durationSeconds
  }];
}

const t7 = shots.get(7)!;
t7.spokenText = proposed.get(7)!;
t7.speakerId = undefined;
t7.dialogueLines = [
  {
    id: t7.id + ':narrator',
    speakerId: 'narrator',
    text: 'El camino hacia el Gólgota había comenzado.',
    startSeconds: 0,
    endSeconds: 3.5
  },
  {
    id: t7.id + ':maria',
    speakerId: maria.id,
    text: 'Jesús...',
    startSeconds: 3.5,
    endSeconds: 4.3
  },
  {
    id: t7.id + ':juan',
    speakerId: juan.id,
    text: 'Estoy contigo. No te soltaré.',
    startSeconds: 4.3,
    endSeconds: 7
  }
];

const now = new Date().toISOString();
project.productionLog.push(
  now + ' ViralCine 4.1: narración E2/T2-T7 resegmentada para TTS natural; E2/T1 preservada.'
);

await saveProject(project);

const verified = await getProject(project.id);
const verifiedScene = verified.plan?.scenes.find((item) => item.order === 2);
if (!verifiedScene) throw new Error('No se pudo verificar E2.');
const verifiedT1 = verifiedScene.shots.find((shot) => shot.order === 1);
const verifiedT2 = verifiedScene.shots.find((shot) => shot.order === 2);
const verifiedT7 = verifiedScene.shots.find((shot) => shot.order === 7);

if (verifiedT1?.pipelineVersion !== '4.1-single-visual') {
  throw new Error('Protección falló: E2/T1 dejó de estar en 4.1-single-visual.');
}
if (verifiedT2?.spokenText !== proposed.get(2)) {
  throw new Error('Verificación falló: E2/T2 no conservó la nueva narración.');
}
if (!verifiedT7 || verifiedT7.dialogueLines.length !== 3) {
  throw new Error('Verificación falló: E2/T7 no quedó con tres turnos.');
}

console.log('\n==============================================');
console.log(' CONTINUIDAD NARRATIVA E2 APLICADA');
console.log('==============================================');
console.log('E2/T1: PRESERVADA');
console.log('E2/T2-T6: narración resegmentada en frases naturales');
console.log('E2/T7: Narrador→María→Juan actualizado');
console.log('Assets visuales: PRESERVADOS');
console.log('Backup project.json: ' + backupPath);
console.log('APIs externas: NO');
console.log('Gasto adicional: US$0');
console.log('SCENE2_NARRATION_APPLY=PASS');

function findCharacter(target: string) {
  const normalize = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return project.plan!.characters.find((character) => normalize(character.name) === target);
}

function usage() {
  console.log('Uso:');
  console.log('  npm run scene2:narration -- preview <projectId>');
  console.log('  npm run scene2:narration -- apply <projectId> --confirm APLICAR NARRACION E2');
}
