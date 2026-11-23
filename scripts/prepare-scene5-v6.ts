import { access } from 'node:fs/promises';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  assetAbsolutePath,
  getProject,
  saveProject
} from '@/lib/storage/project-store';
import {
  applyFifteenDaysCoreVoiceLocksV5
} from '@/lib/engine/fifteen-days-voice-lock-v5';
import {
  planScene5ReunionV6,
  validateScene5ReunionV6,
  SCENE5_ELENA_ID_V6,
  SCENE5_SOFIA_ID_V6,
  SCENE5_MATEO_ID_V6,
  SCENE5_MAX_VIDEO_USD_V6,
  SCENE5_MAX_VOICE_USD_V6
} from '@/lib/engine/scene5-reunion-plan-v6';
import {
  grokLiteImageToVideoCredits,
  wan3VideoCredits
} from '@/lib/providers/runway-router-v6';
import {
  estimateOperationCost
} from '@/lib/engine/spend-ledger';

loadProjectLocalEnvOverride();

const [projectId] = process.argv.slice(2);
if (!projectId) {
  console.error(
    'Uso: npm run safe:scene5:prepare -- <projectId>'
  );
  process.exit(1);
}

let project = await getProject(projectId);

if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
  throw new Error('Este comando solo está autorizado para 15 DÍAS.');
}

if (!project.plan || project.plan.scenes.length !== 6) {
  throw new Error(
    'Este preflight exige 15 DÍAS short de 6 escenas.'
  );
}

const scene4 = project.plan.scenes.find((item) => item.order === 4);
if (!scene4 || scene4.status !== 'ready') {
  throw new Error(
    'La Escena 4 debe estar aprobada/ready antes de preparar Escena 5.'
  );
}

if (!scene4.videoAsset) {
  throw new Error('Escena 4 aprobada no tiene video final.');
}
await access(assetAbsolutePath(project.id, scene4.videoAsset));

applyFifteenDaysCoreVoiceLocksV5(project);
planScene5ReunionV6(project);
const validation = validateScene5ReunionV6(project);
project = await saveProject(project);

const t1Credits = grokLiteImageToVideoCredits(7, 'auto_720p');
const t2Credits = grokLiteImageToVideoCredits(7, 'auto_720p');
const dialogueCredits = wan3VideoCredits(4, '1280:720') * 4;
const videoCredits = t1Credits + t2Credits + dialogueCredits;
const videoUsd = videoCredits * 0.01;
const referenceImageUsd = estimateOperationCost('image', 1);

if (Math.abs(videoUsd - SCENE5_MAX_VIDEO_USD_V6) > 0.0001) {
  throw new Error(
    'SAFE COST GATE: video Escena 5 cambió a US$' +
      videoUsd.toFixed(2) +
      '.'
  );
}

const refs = await Promise.all([
  referenceStatus(project, SCENE5_ELENA_ID_V6, 'elena-d-restored'),
  referenceStatus(project, SCENE5_SOFIA_ID_V6, 'sofia-main'),
  referenceStatus(project, SCENE5_MATEO_ID_V6, 'mateo-main')
]);

const allRefsReady = refs.every((item) => item.ready);

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 5 / PREPRODUCCION');
console.log('==================================================');
console.log('Proyecto: 15 DÍAS short · 6 escenas');
console.log('Escena 5: De verdad · 30s');
console.log('Escena 4 aprobada: SI');
console.log('');
console.log('ARQUITECTURA');
console.log('T1 · 7s · La puerta · SILENCIO · Runway/Grok Lite');
console.log('T2 · 7s · El regreso/abrazo · SILENCIO · Runway/Grok Lite');
console.log('T3 · 4s · Mateo: “¿Esta es nuestra casa?” · WAN 3.0 audio-reference');
console.log('T4 · 4s · Elena: “Sí.” · WAN 3.0 audio-reference');
console.log('T5 · 4s · Mateo: “¿De verdad?” · WAN 3.0 audio-reference');
console.log('T6 · 4s · Elena: “De verdad.” · WAN 3.0 audio-reference');
console.log('');
console.log('VOCES CANDIDATAS / LOCK');
console.log('Elena: OpenAI marin');
console.log('Mateo: OpenAI alloy · true-child obligatorio para master final');
console.log('Sofía: OpenAI coral · instrucciones niña latina de 10 años');
console.log('IMPORTANTE: Mateo jamás puede quedar con voz adulta; master final exige true-child.');
console.log('');
console.log('REFERENCIAS VISUALES');
for (const ref of refs) {
  console.log(
    ref.label + ': ' +
      (ref.ready ? 'READY · ' + ref.asset : 'MISSING')
  );
}
console.log('');
console.log('COSTO VIDEO SI SE AUTORIZA DESPUES');
console.log('T1 Grok Lite 7s: ' + t1Credits + ' créditos = US$' + (t1Credits * 0.01).toFixed(2));
console.log('T2 Grok Lite 7s: ' + t2Credits + ' créditos = US$' + (t2Credits * 0.01).toFixed(2));
console.log('T3-T6 WAN 3.0 4s: ' + dialogueCredits + ' créditos = US$' + (dialogueCredits * 0.01).toFixed(2));
console.log('Video total: ' + videoCredits + ' créditos = US$' + videoUsd.toFixed(2));
console.log('Voces: máximo US$' + SCENE5_MAX_VOICE_USD_V6.toFixed(2));
console.log(
  'Composición de referencia T1, si se necesita: máximo interno US$' +
    referenceImageUsd.toFixed(2)
);
console.log(
  'Tope provisional con referencias ya existentes: US$' +
    (videoUsd + SCENE5_MAX_VOICE_USD_V6 + referenceImageUsd).toFixed(2)
);
console.log('');
console.log('Fal.ai: PROHIBIDO / NO USADO');
console.log('Fallback pagado automático: NO');
console.log('Generación de video ejecutada: NO');
console.log('Generación de voz ejecutada: NO');
console.log('APIs externas: NO');
console.log('Gasto de este preflight: US$0');
console.log('');
console.log(
  'SCENE5_REFERENCES_READY=' + (allRefsReady ? 'YES' : 'NO')
);
console.log('SCENE5_PREPARE=PASS');

async function referenceStatus(
  currentProject: typeof project,
  characterId: string,
  stateId: string
) {
  const character = currentProject.plan!.characters.find(
    (item) => item.id === characterId
  );
  const bible = currentProject.plan!.realMotion?.characterBible.find(
    (item) => item.characterId === characterId
  );
  const state = bible?.states.find((item) => item.id === stateId);

  const candidates = [
    state?.referenceAsset,
    bible?.bodyReferenceAsset,
    bible?.masterReferenceAsset,
    character?.referenceAsset
  ].filter((value): value is string => Boolean(value));

  for (const asset of candidates) {
    try {
      await access(assetAbsolutePath(currentProject.id, asset));
      return {
        label: character?.name || characterId,
        ready: true,
        asset
      };
    } catch {
      // probar siguiente candidato
    }
  }

  return {
    label: character?.name || characterId,
    ready: false,
    asset: ''
  };
}
