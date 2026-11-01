import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { getProject } from '@/lib/storage/project-store';
import {
  generateSingleReferenceReal,
  generateSingleVideoReal,
  inspectSingleVisualSource
} from '@/lib/engine/single-visual-source-v4';

loadProjectLocalEnvOverride();

const [command, projectId, shotId, ...rest] = process.argv.slice(2);
if (!command || !projectId || !shotId || !['preview', 'reference', 'video'].includes(command)) {
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

if (!located) throw new Error("No existe la toma '" + shotId + "'.");

const inspection = await inspectSingleVisualSource(project, located.scene, located.shot);
printInspection(inspection);

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: no modifica project.json ni media.');
  console.log('  OpenAI=NO | Veo=NO | ElevenLabs=NO | Fal=NO');
  console.log('  Gasto: US$0');
  console.log('SINGLE_VISUAL_PREVIEW=PASS');
  process.exit(0);
}

process.env.PRODUCTION_MODE = 'real';
process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
process.env.ALLOW_PAID_GENERATION = 'true';
process.env.ALLOW_PAID_PROVIDER_FALLBACK = 'false';

const confirmation = rest.join(' ').trim();

if (command === 'reference') {
  if (confirmation !== '--confirm-paid SI SINGLE REFERENCE') {
    throw new Error('Generación pagada bloqueada. Debes usar exactamente: --confirm-paid SI SINGLE REFERENCE');
  }
  console.log('\nAUTORIZACION');
  console.log('  Solo UNA referencia OpenAI para esta toma.');
  console.log('  Veo=NO | ElevenLabs=NO | Fal=NO');
  const result = await generateSingleReferenceReal(project, located.scene, located.shot);
  printInspection(result);
  console.log('\nSINGLE_VISUAL_REFERENCE=PASS');
  console.log('Detente aquí y revisa la referencia antes de autorizar Veo.');
  process.exit(0);
}

if (confirmation !== '--confirm-paid SI SINGLE VIDEO') {
  throw new Error('Generación pagada bloqueada. Debes usar exactamente: --confirm-paid SI SINGLE VIDEO');
}

console.log('\nAUTORIZACION');
console.log('  Solo UN video Veo usando la referencia ya aprobada.');
console.log('  OpenAI=NO | ElevenLabs=NO | Fal=NO');
const result = await generateSingleVideoReal(project, located.scene, located.shot);
printInspection(result);
console.log('\nSINGLE_VISUAL_VIDEO=PASS');
console.log('Fal no se ejecutó.');

function printInspection(value: Awaited<ReturnType<typeof inspectSingleVisualSource>>) {
  console.log('\nSINGLE VISUAL 4.1');
  console.log('Proyecto: ' + project.id);
  console.log('Toma: E' + located!.scene.order + '/T' + located!.shot.order + ' ' + located!.shot.id);
  console.log('Plan: ' + value.planVersion);
  console.log('Referencia: ' + (value.referenceReady ? 'LISTA' : 'PENDIENTE'));
  console.log('Video: ' + (value.videoReady ? 'LISTO' : 'PENDIENTE'));
  console.log('Duración proveedor: ' + value.providerDurationSeconds + 's');
  console.log('Costo referencia faltante: US$' + value.estimatedReferenceUsd.toFixed(4));
  console.log('Costo video faltante: US$' + value.estimatedVideoUsd.toFixed(4));
  console.log('\nASSETS');
  console.log('  ref: ' + value.referenceAsset);
  console.log('  video: ' + value.videoAsset);
  if (value.rejectedReason) console.log('  rechazo: ' + value.rejectedReason);
  console.log('\nREFERENCE-PROMPT');
  console.log(value.prompt);
  console.log('\nVIDEO-PROMPT');
  console.log(value.videoPrompt);
  console.log('\nNEGATIVO');
  console.log(value.negativePrompt);
}

function usage() {
  console.log('Uso:');
  console.log('  npm run visual:single -- preview <projectId> <shotId>');
  console.log('  npm run visual:single -- reference <projectId> <shotId> --confirm-paid SI SINGLE REFERENCE');
  console.log('  npm run visual:single -- video <projectId> <shotId> --confirm-paid SI SINGLE VIDEO');
}
