import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { getProject } from '@/lib/storage/project-store';
import { hasMultipleDialogueSpeakers } from '@/lib/engine/speaker-resolution';
import { requiresLipSyncForSpeaker } from '@/lib/engine/lip-sync-policy-v4';

loadProjectLocalEnvOverride();

const [projectId] = process.argv.slice(2);
if (!projectId) {
  console.log('Uso: npm run full:status -- <projectId>');
  process.exit(1);
}

const project = await getProject(projectId);
if (!project.plan) throw new Error('El proyecto no tiene plan.');

type Row = {
  sceneOrder: number;
  shotOrder: number;
  shotId: string;
  title: string;
  kind: 'single-narrator' | 'single-lipsync' | 'single-other' | 'segmented';
  pipeline: string;
  ready42: boolean;
};

const rows: Row[] = [];

for (const scene of project.plan.scenes) {
  for (const shot of scene.shots) {
    const segmented = hasMultipleDialogueSpeakers(shot);
    const speakerId = shot.speakerId || shot.dialogueLines[0]?.speakerId;
    const lip = !segmented && requiresLipSyncForSpeaker(project, speakerId);
    const kind: Row['kind'] = segmented
      ? 'segmented'
      : speakerId === 'narrator'
        ? 'single-narrator'
        : lip
          ? 'single-lipsync'
          : 'single-other';
    const pipeline = shot.pipelineVersion || 'sin-version';
    rows.push({
      sceneOrder: scene.order,
      shotOrder: shot.order,
      shotId: shot.id,
      title: shot.title,
      kind,
      pipeline,
      ready42: /^4\.2-/.test(pipeline) && shot.status === 'ready'
    });
  }
}

const completed42 = rows.filter((row) => row.ready42);
const pending42 = rows.filter((row) => !row.ready42);

console.log('\nVIRALCINE 4.2 — ESTADO DE ACEPTACION');
console.log('Proyecto: ' + project.id + ' — ' + project.input.title);
console.log('Tomas totales: ' + rows.length);
console.log('Tomas ya en 4.2: ' + completed42.length);
console.log('Tomas pendientes de 4.2: ' + pending42.length);

console.log('\nCOBERTURA DE PRUEBAS DE PRODUCCION');
const narrator42 = completed42.some((row) => row.kind === 'single-narrator');
const lip42 = completed42.some((row) => row.kind === 'single-lipsync');
const segmented42 = completed42.some((row) => row.kind === 'segmented');

console.log('  Single narrador + música: ' + (narrator42 ? 'CUBIERTA' : 'PENDIENTE'));
console.log('  Single hablante visible + lip-sync: ' + (lip42 ? 'CUBIERTA' : 'PENDIENTE'));
console.log('  Multihablante segmentada + lip-sync: ' + (segmented42 ? 'CUBIERTA' : 'PENDIENTE'));

const candidates = [
  {
    label: 'single-lipsync',
    row: pending42.find((row) => row.kind === 'single-lipsync')
  },
  {
    label: 'segmented',
    row: pending42.find((row) => row.kind === 'segmented')
  },
  {
    label: 'single-narrator',
    row: pending42.find((row) => row.kind === 'single-narrator')
  }
].filter((entry) => entry.row);

console.log('\nCANDIDATOS PARA LAS SIGUIENTES PRUEBAS');
if (!candidates.length) {
  console.log('  Ninguno: las clases principales ya tienen una toma 4.2.');
} else {
  for (const item of candidates) {
    const row = item.row!;
    console.log(
      '  ' + item.label + ': E' + row.sceneOrder + '/T' + row.shotOrder +
      ' | ' + row.shotId + ' | ' + row.title
    );
  }
}

console.log('\nSEGURIDAD');
console.log('  SOLO LECTURA');
console.log('  APIs externas: NO');
console.log('  Gasto: US$0');
console.log('FULL_FLOW_STATUS=PASS');
