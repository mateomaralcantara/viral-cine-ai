import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { getProject } from '@/lib/storage/project-store';
import {
  assertPricingSnapshotFresh,
  candidateFromRunwayDryRun,
  estimateVertexVideoCandidates,
  rankSafeVideoCandidates
} from '@/lib/engine/safe-provider-compare-v6';

loadProjectLocalEnvOverride();

const [
  projectId,
  sceneRaw,
  shotRaw,
  runwayCreditsRaw = '24',
  runwayModel = 'grok_imagine_1_5_lite',
  resolutionRaw = '720p'
] = process.argv.slice(2);

const sceneOrder = Number(sceneRaw);
const shotOrder = Number(shotRaw);
const runwayCredits = Number(runwayCreditsRaw);
const resolution =
  resolutionRaw === '1080p' ? '1080p' : '720p';

if (!projectId || !Number.isInteger(sceneOrder) || !Number.isInteger(shotOrder)) {
  console.error(
    'Uso: npm run safe:compare -- <projectId> <sceneOrder> <shotOrder> [runwayCredits] [runwayModel] [720p|1080p]'
  );
  process.exit(1);
}

if (process.env.ALLOW_PAID_GENERATION === 'true') {
  throw new Error(
    'SAFE COMPARE exige ALLOW_PAID_GENERATION=false.'
  );
}

assertPricingSnapshotFresh();

const project = await getProject(projectId);
const scene = project.plan?.scenes.find(
  (item) => item.order === sceneOrder
);
const shot = scene?.shots.find(
  (item) => item.order === shotOrder
);

if (!scene || !shot) {
  throw new Error('No existe la escena/toma solicitada.');
}

const maxUsd = Number(
  process.env.SAFE_MAX_SINGLE_CALL_USD || '0.50'
);

const runway = candidateFromRunwayDryRun({
  model: runwayModel,
  credits: runwayCredits,
  durationSeconds: shot.durationSeconds,
  resolution
});

const vertex = estimateVertexVideoCandidates(
  shot.durationSeconds,
  resolution
);

const ranked = rankSafeVideoCandidates(
  [runway, ...vertex],
  maxUsd
);

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — PROVIDER COMPARATOR');
console.log('==================================================');
console.log('Proyecto: ' + project.input.title);
console.log('Escena: ' + scene.order + ' · ' + scene.title);
console.log('Toma: T' + shot.order + ' · ' + shot.title);
console.log('Duración: ' + shot.durationSeconds + 's');
console.log('Resolución objetivo: ' + resolution);
console.log('Tope local por llamada: US$' + maxUsd.toFixed(2));
console.log('');
console.log('CANDIDATOS');

for (const item of [runway, ...vertex].sort(
  (a, b) => a.estimatedUsd - b.estimatedUsd
)) {
  const allowed =
    item.estimatedUsd <= maxUsd + 0.0001 ? 'ELEGIBLE' : 'BLOQUEADO';
  console.log(
    '- ' +
      item.provider +
      ' / ' +
      item.model +
      ' = US$' +
      item.estimatedUsd.toFixed(2) +
      ' [' +
      allowed +
      ']'
  );
}

console.log('');
if (ranked.winner) {
  console.log(
    'GANADOR POR COSTO: ' +
      ranked.winner.provider +
      ' / ' +
      ranked.winner.model +
      ' / US$' +
      ranked.winner.estimatedUsd.toFixed(2)
  );
} else {
  console.log('GANADOR POR COSTO: NINGUNO');
}

console.log('');
console.log('Runway: costo tomado del dryRun que tú acabas de comprobar.');
console.log(
  'Vertex: snapshot ' +
    vertex[0].pricingSnapshotDate +
    ' · video-only.'
);
console.log('APIs externas llamadas por este comando: NO');
console.log('Generación de video: NO');
console.log('Gasto nuevo: US$0');
console.log('SAFE_PROVIDER_COMPARE_ONLY=YES');
