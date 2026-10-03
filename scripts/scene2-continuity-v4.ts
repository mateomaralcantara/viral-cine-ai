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
  if (!shots.has(order)) throw new Error('La Escena 2 no contiene T' + order + '.');
}

const jesus = findCharacter('jesus');
const maria = findCharacter('maria');
const juan = findCharacter('juan');

if (!jesus || !maria || !juan) {
  throw new Error(
    'No se pudieron resolver Jesús/María/Juan en el casting. ' +
    'Jesús=' + Boolean(jesus) + ' María=' + Boolean(maria) + ' Juan=' + Boolean(juan)
  );
}

const beats = [
  {
    order: 2,
    camera: 'Plano medio lateral de seguimiento, una sola toma continua; cámara acompaña los primeros pasos de Jesús bajo el peso del madero mientras soldados despejan el corredor delante de él.',
    visualPrompt:
      'Calle estrecha de Jerusalén del siglo I a la salida del pretorio, luz fría de mañana y polvo suspendido. Jesús ya lleva el gran madero rugoso sobre los hombros y comienza a avanzar con pasos pesados y físicamente creíbles. Dos soldados romanos caminan a ambos lados y abren paso entre la gente con gestos contenidos, sin violencia gráfica. Una sola acción dominante: el inicio de la marcha bajo el peso del madero. Plano medio lateral de acción, composición asimétrica, profundidad realista, anatomía estable, identidad y vestuario coherentes. María y Juan no protagonizan esta toma y, si aparecen, quedan lejanos y secundarios. Sin montaje, sin POV, sin cambio de ángulo, sin texto, subtítulos, logos ni pose de póster.',
    characterIds: [jesus.id]
  },
  {
    order: 3,
    camera: 'Primer plano emocional de María con leve desplazamiento lateral; Jesús y la comitiva aparecen brevemente desenfocados entre cascos y lanzas al fondo.',
    visualPrompt:
      'Calle estrecha de Jerusalén del siglo I, multitud en movimiento y polvo de mañana. María, con velo arena y manto azul desaturado, descubre a Jesús a cierta distancia entre soldados, cascos y lanzas. Una sola acción dominante: el instante en que María reconoce a su hijo. Primer plano emocional con microexpresiones realistas, ojos húmedos y respiración contenida; fondo histórico profundo y desenfocado con la comitiva en movimiento, sin violencia gráfica. No convertir a Jesús ni a los soldados en segundo protagonista. Identidad facial estable, anatomía natural, sin manos bloqueando el rostro, sin montaje, sin texto, subtítulos, logos ni pose de póster.',
    characterIds: [maria.id, jesus.id]
  },
  {
    order: 4,
    camera: 'Plano detalle narrativo que asciende suavemente a plano medio corto: mano y antebrazo de Juan estabilizando a María mientras la multitud pasa alrededor.',
    visualPrompt:
      'Jerusalén del siglo I, borde de una multitud que avanza entre polvo, sandalias, telas y astas de lanza fuera de foco. Juan permanece junto a María y la sujeta con firmeza cuidadosa para evitar que la empujen. Una sola acción dominante: Juan protege y estabiliza a María mientras la corriente humana pasa. Comenzar en detalle narrativo de su mano y antebrazo y mantener anatomía de manos impecable; María conserva velo arena y manto azul desaturado, Juan túnica cruda y manto verde oliva apagado. Movimiento contenido, no melodramático, sin violencia gráfica, sin montaje, sin texto, subtítulos ni logos.',
    characterIds: [juan.id, maria.id]
  },
  {
    order: 5,
    camera: 'Contraplano cinematográfico desde detrás de María y Juan hacia Jesús alejándose con la comitiva; mantener eje de mirada, profundidad y separación de planos.',
    visualPrompt:
      'Calle de Jerusalén del siglo I. Desde detrás y ligeramente al costado de María y Juan, la cámara observa a Jesús alejándose bajo el madero entre soldados y multitud. Una sola idea visual: la distancia física y emocional entre una madre y su hijo. María y Juan ocupan el primer término lateral sin bloquear el cuadro; Jesús queda reconocible pero más distante en profundidad. Mantener eje de mirada, escala coherente, polvo y telas en movimiento suave, realismo histórico sobrio, sin violencia gráfica, sin montaje, sin texto, subtítulos, logos ni simetría de póster.',
    characterIds: [maria.id, juan.id, jesus.id]
  },
  {
    order: 6,
    camera: 'Plano de transición profundo y continuo: seguimiento lateral de Jesús cruzando el umbral hacia la calle; María permanece atrás en un segundo plano de mirada.',
    visualPrompt:
      'Umbral de salida del pretorio hacia una calle estrecha de Jerusalén del siglo I. Jesús, ya cargando el madero, cruza el umbral y entra en la calle mientras la comitiva continúa su marcha. Una sola acción dominante: Jesús abandona el patio y pasa al camino exterior. María permanece atrás, visible solo como continuidad emocional, con la mirada fija en él; Juan se mantiene cerca de ella y secundario. Cámara de transición con profundidad, luz exterior creciendo al fondo, polvo fino, física estable, movimiento continuo, sin violencia gráfica, sin montaje, sin cambio de ángulo, sin texto, subtítulos ni logos.',
    characterIds: [jesus.id, maria.id, juan.id]
  },
  {
    order: 7,
    camera: 'Cobertura segmentada por turno: establecimiento de la comitiva alejándose; primer plano breve de María; plano medio íntimo de Juan junto a ella.',
    visualPrompt:
      'Salida del pretorio hacia la calle de Jerusalén del siglo I. La comitiva se aleja y el camino hacia el Gólgota comienza. Cobertura narrativa de cierre de escena con continuidad exacta de Jesús, María y Juan. Esta toma se producirá por turnos: narración de establecimiento, reacción íntima de María y respuesta de Juan. No repetir la colocación del madero. Realismo histórico sobrio, polvo y luz natural, anatomía estable, sin violencia gráfica, sin texto, subtítulos, logos ni pose de póster.',
    characterIds: [jesus.id, maria.id, juan.id]
  }
];

const t7 = shots.get(7)!;
const parsed = parseTurnText(t7.spokenText);
const proposedT7Lines = [
  {
    id: t7.id + ':narrator',
    speakerId: 'narrator',
    text: parsed.narrator,
    startSeconds: 0,
    endSeconds: 3.5
  },
  {
    id: t7.id + ':maria',
    speakerId: maria.id,
    text: parsed.maria,
    startSeconds: 3.5,
    endSeconds: 4.3
  },
  {
    id: t7.id + ':juan',
    speakerId: juan.id,
    text: parsed.juan,
    startSeconds: 4.3,
    endSeconds: 7
  }
];

console.log('\nVIRALCINE 4.1 — CONTINUIDAD ESCENA 2');
console.log('Proyecto: ' + project.id);
console.log('Escena: E2 ' + scene.title);
console.log('E2/T1: PRESERVADA — no se modifica.');

for (const beat of beats) {
  const shot = shots.get(beat.order)!;
  console.log('\nE2/T' + beat.order + ' ' + shot.id);
  console.log('  acción/cámara nueva: ' + beat.camera);
  console.log('  personajes referencia: ' + beat.characterIds.join(', '));
  console.log('  prompt nuevo: ' + beat.visualPrompt);
  console.log('  texto hablado: PRESERVADO');
}

console.log('\nE2/T7 TURNOS PROPUESTOS');
for (const line of proposedT7Lines) {
  console.log(
    '  ' + line.startSeconds.toFixed(3) + '→' + line.endSeconds.toFixed(3) +
    ' | ' + line.speakerId + ' | ' + line.text
  );
}

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: project.json NO se modifica.');
  console.log('  E2/T1 aprobada NO se toca.');
  console.log('  APIs externas: NO');
  console.log('  Gasto: US$0');
  console.log('SCENE2_CONTINUITY_PREVIEW=PASS');
  process.exit(0);
}

const confirmation = rest.join(' ').trim();
if (confirmation !== '--confirm APLICAR CONTINUIDAD E2') {
  throw new Error('Aplicación bloqueada. Usa exactamente: --confirm APLICAR CONTINUIDAD E2');
}

const backupDir = path.join(projectRoot(project.id), 'checkpoints');
await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, 'project-before-scene2-continuity-' + stamp + '.json');
await copyFile(path.join(projectRoot(project.id), 'project.json'), backupPath);

for (const beat of beats) {
  const shot = shots.get(beat.order)!;
  shot.camera = beat.camera;
  shot.visualPrompt = beat.visualPrompt;
  shot.characterIds = beat.characterIds;
  if (beat.order === 7) {
    shot.speakerId = undefined;
    shot.dialogueLines = proposedT7Lines;
  }
}

const now = new Date().toISOString();
project.productionLog.push(
  now + ' ViralCine 4.1: continuidad visual E2/T2-T7 corregida; ' +
  'E2/T7 estructurada Narrador→María→Juan. E2/T1 preservada.'
);

await saveProject(project);

const verified = await getProject(project.id);
const verifiedScene = verified.plan?.scenes.find((item) => item.order === 2);
if (!verifiedScene) throw new Error('No se pudo verificar la Escena 2 después de guardar.');
const verifiedT1 = verifiedScene.shots.find((shot) => shot.order === 1);
const verifiedT7 = verifiedScene.shots.find((shot) => shot.order === 7);
if (verifiedT1?.pipelineVersion !== '4.1-single-visual') {
  throw new Error('Protección falló: E2/T1 dejó de estar en 4.1-single-visual.');
}
if (!verifiedT7 || verifiedT7.dialogueLines.length !== 3) {
  throw new Error('Verificación falló: E2/T7 no quedó con 3 turnos.');
}

console.log('\n==============================================');
console.log(' CONTINUIDAD ESCENA 2 APLICADA');
console.log('==============================================');
console.log('E2/T1: PRESERVADA');
console.log('E2/T2-T6: prompts/cámara/personajes actualizados');
console.log('E2/T7: 3 turnos estructurados');
console.log('Backup project.json: ' + backupPath);
console.log('APIs externas: NO');
console.log('Gasto adicional: US$0');
console.log('SCENE2_CONTINUITY_APPLY=PASS');

function findCharacter(target: string) {
  const normalize = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return project.plan!.characters.find((character) => normalize(character.name) === target);
}

function parseTurnText(value: string) {
  const mariaMarker = /MAR[IÍ]A\s*:/i.exec(value);
  const juanMarker = /JUAN\s*:/i.exec(value);
  if (!mariaMarker || !juanMarker || mariaMarker.index >= juanMarker.index) {
    throw new Error('E2/T7 no contiene los marcadores MARÍA: y JUAN: esperados.');
  }
  const narrator = value.slice(0, mariaMarker.index).trim();
  const mariaText = value
    .slice(mariaMarker.index + mariaMarker[0].length, juanMarker.index)
    .trim();
  const juanText = value.slice(juanMarker.index + juanMarker[0].length).trim();

  if (!narrator || !mariaText || !juanText) {
    throw new Error('E2/T7 no pudo separarse en Narrador/María/Juan.');
  }
  return { narrator, maria: mariaText, juan: juanText };
}

function usage() {
  console.log('Uso:');
  console.log('  npm run scene2:continuity -- preview <projectId>');
  console.log('  npm run scene2:continuity -- apply <projectId> --confirm APLICAR CONTINUIDAD E2');
}
