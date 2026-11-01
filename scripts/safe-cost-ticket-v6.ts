import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  createSafeRunwayCostTicket,
  type SafeRunwayModel
} from '@/lib/engine/safe-cost-gate-v6';
import { getProject } from '@/lib/storage/project-store';

loadProjectLocalEnvOverride();

const [projectId, sceneRaw, shotRaw, modelRaw] = process.argv.slice(2);
const sceneOrder = Number(sceneRaw);
const shotOrder = Number(shotRaw);
const model = (modelRaw || 'gen4_turbo') as SafeRunwayModel;

if (!projectId || !Number.isInteger(sceneOrder) || !Number.isInteger(shotOrder)) {
  console.error(
    'Uso: npm run safe:ticket -- <projectId> <sceneOrder> <shotOrder> [gen4_turbo|h3_max_480|wan3_480|gen4.5]'
  );
  process.exit(1);
}

const project = await getProject(projectId);
const scene = project.plan?.scenes.find((item) => item.order === sceneOrder);
const shot = scene?.shots.find((item) => item.order === shotOrder);

if (!scene || !shot) {
  throw new Error('No existe la escena/toma solicitada.');
}

const ticket = createSafeRunwayCostTicket({
  projectId,
  sceneOrder,
  shotOrder,
  shotId: shot.id,
  durationSeconds: shot.durationSeconds,
  model,
  ratio: project.input.aspectRatio === '9:16' ? '720:1280' : '1280:720'
});

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — COST TICKET');
console.log('==================================================');
console.log('Proyecto: ' + project.input.title);
console.log('Escena: ' + sceneOrder + ' · ' + scene.title);
console.log('Toma: T' + shotOrder + ' · ' + shot.title);
console.log('Estado actual: ' + shot.status);
console.log('');
console.log('ASSETS EXISTENTES');
console.log('- imagen: ' + (shot.imageAsset || 'NO'));
console.log('- video base: ' + (shot.baseVideoAsset || 'NO'));
console.log('- video final: ' + (shot.videoAsset || 'NO'));
console.log('');
console.log('LLAMADA PROPUESTA');
console.log('- proveedor: Runway');
console.log('- modelo: ' + ticket.model);
console.log('- duración: ' + ticket.durationSeconds + 's');
console.log('- salida: ' + ticket.ratio);
console.log('- tarifa snapshot: ' + ticket.creditsPerSecond + ' créditos/s');
console.log('- créditos máximos: ' + ticket.credits);
console.log('- costo máximo: US$' + ticket.maxUsd.toFixed(2));
console.log('- pricing snapshot: ' + ticket.pricingSnapshotDate);
console.log('- ticket: ' + ticket.ticketId);
console.log('');
console.log('BLOQUEOS');
console.log('- fallback pagado automático: NO');
console.log('- auditoría IA automática: NO');
console.log('- música automática durante preview: NO');
console.log('- este comando llama APIs: NO');
console.log('- este comando genera gasto: US$0');
console.log('');
console.log('AUTORIZACIÓN FUTURA EXACTA');
console.log(ticket.exactConfirmation);
console.log('');
console.log('SAFE_TICKET_ONLY=YES');
