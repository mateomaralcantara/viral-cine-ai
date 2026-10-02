import path from 'node:path';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { getProject } from '@/lib/storage/project-store';
import {
  ensureMixedShotVisualSourceReal,
  inspectMixedShotVisualSource
} from '@/lib/engine/producer-v4';
import { estimateOperationCost } from '@/lib/engine/spend-ledger';
import { estimatedGenerationCost } from '@/lib/engine/spend-guard';

loadProjectLocalEnvOverride();

const [command, projectId, shotId, ...rest] = process.argv.slice(2);
if (!command || !projectId || !shotId || !['preview', 'run'].includes(command)) {
  usage();
  process.exit(1);
}

const project = await getProject(projectId);
if (!project.plan) throw new Error('El proyecto no tiene plan.');

let located:
  | {
      scene: NonNullable<typeof project.plan>['scenes'][number];
      shot: NonNullable<typeof project.plan>['scenes'][number]['shots'][number];
    }
  | undefined;

for (const scene of project.plan.scenes) {
  const shot = scene.shots.find((item) => item.id === shotId);
  if (shot) {
    located = { scene, shot };
    break;
  }
}
if (!located) throw new Error(`No existe la toma '${shotId}'.`);

const inspection = await inspectMixedShotVisualSource(project, located.scene, located.shot);
const imageEstimate = inspection.referenceImageAsset ? 0 : estimateOperationCost('image', 1);
const videoEstimate = inspection.needsGeneration ? estimatedGenerationCost(located.shot, located.scene) : 0;
const totalEstimate = Math.round((imageEstimate + videoEstimate) * 10000) / 10000;
const provider = (process.env.VIDEO_PROVIDER || 'auto').toLowerCase();

console.log('\nMIXED SOURCE REPAIR 4.0 — ' + command.toUpperCase());
console.log('Proyecto: ' + project.id);
console.log(`Toma: E${located.scene.order}/T${located.shot.order} ${located.shot.id}`);
console.log('Proveedor de video configurado: ' + provider);
console.log('Fuente válida actual: ' + (inspection.selectedAsset || 'NO'));
console.log('Requiere regeneración: ' + (inspection.needsGeneration ? 'SI' : 'NO'));

if (inspection.rejected.length) {
  console.log('\nFUENTES RECHAZADAS');
  for (const item of inspection.rejected) {
    console.log('  ' + item.asset);
    console.log('    ' + item.reason);
  }
}

console.log('\nCOSTO PREVENTIVO');
console.log('  Referencia visual estimada: US$' + imageEstimate.toFixed(4));
console.log('  Video base estimado: US$' + videoEstimate.toFixed(4));
console.log('  Total estimado: US$' + totalEstimate.toFixed(4));

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: no modifica project.json ni media.');
  console.log('  No llama OpenAI, Veo ni Fal.ai.');
  console.log('  Gasto: US$0');
  process.exit(inspection.needsGeneration ? 2 : 0);
}

const confirmation = rest.join(' ').trim();
if (confirmation !== '--confirm-paid SI VIDEO') {
  throw new Error(
    'Generación pagada de video bloqueada. Debes usar exactamente: --confirm-paid SI VIDEO'
  );
}

if (!inspection.needsGeneration && inspection.selectedAsset) {
  console.log('\nSOURCE_REPAIR=NOT_NEEDED');
  console.log('Fuente válida: ' + inspection.selectedAsset);
  process.exit(0);
}

if (process.env.PILOT_MODE !== 'true') {
  throw new Error('Reparación piloto bloqueada: PILOT_MODE debe ser true.');
}

process.env.PRODUCTION_MODE = 'real';
process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
process.env.ALLOW_PAID_GENERATION = 'true';
process.env.ALLOW_PAID_PROVIDER_FALLBACK = 'false';

console.log('\nAUTORIZACION');
console.log('  Confirmación exacta recibida: SI VIDEO');
console.log('  Puede generar 1 referencia visual y 1 video base real.');
console.log('  El proveedor de video será únicamente el configurado; fallback pagado global=DESHABILITADO.');

const result = await ensureMixedShotVisualSourceReal(project, located.scene, located.shot);

if (!result.selectedAsset || result.needsGeneration) {
  throw new Error('La reparación terminó sin una fuente visual válida.');
}

console.log('\nMIXED_SOURCE_REPAIR=PASS');
console.log('Fuente nueva válida: ' + result.selectedAsset);
console.log('Tipo: ' + result.selectedKind);
console.log('Referencia: ' + (result.referenceImageAsset || 'N/D'));
console.log('El MP4 histórico no se sobrescribe; la reparación vive en segmented-v4-source/.');
console.log('No se ejecutó lip-sync de Fal en este comando.');

function usage() {
  console.log('Uso:');
  console.log('  npm run source:repair -- preview <projectId> <shotId>');
  console.log('  npm run source:repair -- run <projectId> <shotId> --confirm-paid SI VIDEO');
}
