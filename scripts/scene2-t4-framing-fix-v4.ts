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
const shot = scene?.shots.find((item) => item.order === 4);
if (!scene || !shot) throw new Error('No se encontró E2/T4.');

const newVisualPrompt =
  'Jerusalén del siglo I, borde de una multitud que avanza entre polvo, sandalias, telas y astas de lanza fuera de foco. ' +
  'Juan permanece junto a María y la sujeta con firmeza cuidadosa para evitar que la empujen. ' +
  'Una sola acción dominante: Juan protege y estabiliza a María mientras la corriente humana pasa. ' +
  'Composición inicial en plano medio corto de ambos, con la mano y el antebrazo de Juan claramente visibles sujetando de forma natural y anatómicamente correcta el brazo o la parte alta del hombro de María, sin tapar rostros. ' +
  'María conserva velo arena y manto azul desaturado; Juan túnica cruda y manto verde oliva apagado. ' +
  'El contacto debe parecer protector, contenido y físicamente creíble; cinco dedos correctos, muñecas naturales, sin manos fusionadas ni agarres imposibles. ' +
  'Movimiento humano secundario desenfocado alrededor, sin violencia gráfica, sin montaje, sin texto, subtítulos ni logos.';

const newCamera =
  'Plano medio corto desde el primer fotograma, con Juan y María visibles y la mano/antebrazo de Juan legibles en el tercio inferior o lateral; solo leve ascenso o microdesplazamiento de cámara, sin empezar en macro detalle y sin cambiar de ángulo.';

console.log('\nVIRALCINE 4.1 — REFINADO ENCUADRE E2/T4');
console.log('Proyecto: ' + project.id);
console.log('Toma: E2/T4 ' + shot.id);
console.log('\nRIESGO DETECTADO');
console.log('  El plan anterior comenzaba en plano detalle de la mano y luego ascendía a plano medio.');
console.log('  Para image-to-video eso obliga a un reencuadre grande desde un fotograma inicial estático y aumenta riesgo de manos/identidad.');
console.log('\nPROMPT PROPUESTO');
console.log(newVisualPrompt);
console.log('\nCAMARA PROPUESTA');
console.log(newCamera);

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: project.json NO se modifica.');
  console.log('  OpenAI=NO | Veo=NO | ElevenLabs=NO | Fal=NO');
  console.log('  Gasto: US$0');
  console.log('SCENE2_T4_FRAMING_PREVIEW=PASS');
  process.exit(0);
}

const confirmation = rest.join(' ').trim();
if (confirmation !== '--confirm REFINAR E2 T4') {
  throw new Error('Aplicación bloqueada. Usa exactamente: --confirm REFINAR E2 T4');
}

const backupDir = path.join(projectRoot(project.id),'checkpoints');
await mkdir(backupDir,{recursive:true});
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
const backupPath = path.join(
  backupDir,
  'project-before-e2-t4-framing-' + stamp + '.json'
);
await copyFile(path.join(projectRoot(project.id),'project.json'),backupPath);

shot.visualPrompt = newVisualPrompt;
shot.camera = newCamera;

project.productionLog.push(
  new Date().toISOString() +
  ' E2/T4: encuadre refinado para image-to-video; plano medio corto desde primer frame y manos protegidas.'
);

await saveProject(project);

const verified = await getProject(project.id);
const verifiedShot = verified.plan?.scenes
  .find((item) => item.order === 2)
  ?.shots.find((item) => item.order === 4);

if (!verifiedShot || verifiedShot.visualPrompt !== newVisualPrompt || verifiedShot.camera !== newCamera) {
  throw new Error('Verificación falló: E2/T4 no refleja el refinado.');
}

console.log('\n==============================================');
console.log(' REFINADO E2/T4 APLICADO');
console.log('==============================================');
console.log('Backup project.json: ' + backupPath);
console.log('Assets visuales: NO GENERADOS / NO TOCADOS');
console.log('OpenAI=NO | Veo=NO | ElevenLabs=NO | Fal=NO');
console.log('Gasto adicional: US$0');
console.log('SCENE2_T4_FRAMING_APPLY=PASS');

function usage() {
  console.log('Uso:');
  console.log('  npm run scene2:t4-framing -- preview <projectId>');
  console.log('  npm run scene2:t4-framing -- apply <projectId> --confirm REFINAR E2 T4');
}
