import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { getProject } from '@/lib/storage/project-store';
import {
  generateSegmentedTurnReferencesReal,
  generateSegmentedTurnVideosReal,
  inspectSegmentedTurnVisualSources
} from '@/lib/engine/segmented-visual-sources-v4';

loadProjectLocalEnvOverride();

const [command, projectId, shotId, ...rest] = process.argv.slice(2);
if (!command || !projectId || !shotId || !['preview', 'references', 'videos'].includes(command)) {
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

const inspection = await inspectSegmentedTurnVisualSources(project, located.scene, located.shot);
printInspection(inspection);

if (command === 'preview') {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: no modifica project.json ni media.');
  console.log('  No llama OpenAI, Veo ni Fal.ai.');
  console.log('  Gasto: US$0');
  console.log('VISUAL_TURNS_PREVIEW=PASS');
  process.exit(0);
}

process.env.PRODUCTION_MODE = 'real';
process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
process.env.ALLOW_PAID_GENERATION = 'true';
process.env.ALLOW_PAID_PROVIDER_FALLBACK = 'false';

const confirmation = rest.join(' ').trim();

if (command === 'references') {
  if (confirmation !== '--confirm-paid SI REFERENCES') {
    throw new Error('Generación pagada bloqueada. Debes usar exactamente: --confirm-paid SI REFERENCES');
  }
  console.log('\nAUTORIZACION');
  console.log('  Solo referencias OpenAI por turno.');
  console.log('  Veo=NO | Fal=NO');
  const result = await generateSegmentedTurnReferencesReal(project, located.scene, located.shot);
  printInspection(result);
  console.log('\nVISUAL_TURN_REFERENCES=PASS');
  console.log('Detente aquí y revisa las referencias antes de autorizar videos.');
  process.exit(0);
}

if (confirmation !== '--confirm-paid SI VISUAL TURNS') {
  throw new Error('Generación pagada bloqueada. Debes usar exactamente: --confirm-paid SI VISUAL TURNS');
}

console.log('\nAUTORIZACION');
console.log('  Solo videos Veo por turno usando referencias ya existentes.');
console.log('  OpenAI=NO | Fal=NO');
const result = await generateSegmentedTurnVideosReal(project, located.scene, located.shot);
printInspection(result);
console.log('\nVISUAL_TURN_VIDEOS=PASS');
console.log('Fal no se ejecutó.');

function printInspection(value: Awaited<ReturnType<typeof inspectSegmentedTurnVisualSources>>) {
  console.log('\nSEGMENTED VISUAL TURNS 4.1');
  console.log('Proyecto: ' + project.id);
  console.log('Toma: E' + located!.scene.order + '/T' + located!.shot.order + ' ' + located!.shot.id);
  console.log('Plan: ' + value.planVersion);
  console.log('Referencias listas: ' + (value.allReferencesReady ? 'SI' : 'NO'));
  console.log('Videos listos: ' + (value.allVideosReady ? 'SI' : 'NO'));
  console.log('Costo referencias faltantes: US$' + value.estimatedMissingReferencesUsd.toFixed(4));
  console.log('Costo videos faltantes: US$' + value.estimatedMissingVideosUsd.toFixed(4));

  console.log('\nTURNOS VISUALES');
  for (const turn of value.turns) {
    console.log(
      '  ' + turn.index + '. ' + turn.speakerLabel +
      ' | role=' + turn.role +
      ' | slot=' + turn.slotDurationSeconds.toFixed(3) + 's' +
      ' | Veo=' + turn.providerDurationSeconds + 's' +
      ' | ref=' + (turn.referenceReady ? 'LISTA' : 'PENDIENTE') +
      ' | video=' + (turn.videoReady ? 'LISTO' : 'PENDIENTE')
    );
    console.log('     ref: ' + turn.referenceAsset);
    console.log('     video: ' + turn.videoAsset);
    if (turn.rejectedReason) console.log('     rechazo: ' + turn.rejectedReason);
    console.log('     prompt: ' + turn.prompt);
    console.log('     negativo: ' + turn.negativePrompt);
  }
}

function usage() {
  console.log('Uso:');
  console.log('  npm run visual:turns -- preview <projectId> <shotId>');
  console.log('  npm run visual:turns -- references <projectId> <shotId> --confirm-paid SI REFERENCES');
  console.log('  npm run visual:turns -- videos <projectId> <shotId> --confirm-paid SI VISUAL TURNS');
}
