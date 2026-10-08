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
  planScene6ClosingV6,
  validateScene6ClosingV6,
  SCENE6_ELENA_ID_V6,
  SCENE6_SOFIA_ID_V6,
  SCENE6_MATEO_ID_V6,
  SCENE6_MAX_VIDEO_USD_V6,
  SCENE6_MAX_VOICE_USD_V6,
  SCENE6_SAFE_MAX_USD_V6
} from '@/lib/engine/scene6-closing-plan-v6';
import {
  grokLiteImageToVideoCredits,
  wan3VideoCredits
} from '@/lib/providers/runway-router-v6';

loadProjectLocalEnvOverride();

const [projectId] = process.argv.slice(2);
if (!projectId) {
  console.error('Uso: npm run safe:scene6:prepare -- <projectId>');
  process.exit(1);
}

if (
  process.env.ALLOW_EXTERNAL_API_CALLS === 'true' ||
  process.env.ALLOW_PAID_GENERATION === 'true'
) {
  throw new Error('Scene 6 prepare exige APIs pagadas bloqueadas.');
}

let project = await getProject(projectId);

if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
  throw new Error('Este preflight solo está autorizado para 15 DÍAS.');
}
if (!project.plan || project.plan.scenes.length !== 6) {
  throw new Error('Se esperaba 15 DÍAS short de 6 escenas.');
}

const scene5 = project.plan.scenes.find((item) => item.order === 5);
if (
  !scene5 ||
  scene5.status !== 'ready' ||
  !scene5.qualityOverrideApproved ||
  !scene5.videoAsset?.endsWith('scene-005-wan3-reunion-v6-mateo-true-child.mp4')
) {
  throw new Error(
    'Escena 5 debe estar aprobada/congelada con el master Mateo true-child.'
  );
}
await access(assetAbsolutePath(project.id, scene5.videoAsset));

applyFifteenDaysCoreVoiceLocksV5(project);
planScene6ClosingV6(project);
const validation = validateScene6ClosingV6(project);
project = await saveProject(project);

const wanCredits = wan3VideoCredits(4, '1280:720');
const runwayCredits = grokLiteImageToVideoCredits(4, 'auto_720p') * 2;
const videoCredits = wanCredits + runwayCredits;
const videoUsd = videoCredits * 0.01;

if (Math.abs(videoUsd - SCENE6_MAX_VIDEO_USD_V6) > 0.0001) {
  throw new Error(
    'SAFE COST GATE: video Escena 6 cambió a US$' +
      videoUsd.toFixed(2) +
      '.'
  );
}
if (Math.abs(videoUsd + SCENE6_MAX_VOICE_USD_V6 - SCENE6_SAFE_MAX_USD_V6) > 0.0001) {
  throw new Error('SAFE COST GATE total Escena 6 cambió.');
}

const refs = await Promise.all([
  referenceStatus(project, SCENE6_ELENA_ID_V6, 'elena-d-restored'),
  referenceStatus(project, SCENE6_SOFIA_ID_V6, 'sofia-main'),
  referenceStatus(project, SCENE6_MATEO_ID_V6, 'mateo-main')
]);

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 6 / PREPRODUCCION');
console.log('==================================================');
console.log('Escena 5 aprobada: SI');
console.log('Escena 6: Esta es nuestra casa · 12s');
console.log('');
console.log('ARQUITECTURA');
console.log('T1 · 4s · reacción silenciosa de Sofía · Runway/Grok Lite');
console.log('T2 · 4s · Elena: “¿Ves? Te lo prometí… esta es nuestra casa.” · WAN 3.0 audio-reference');
console.log('T3 · 4s · abrazo familiar silencioso dentro de la casa · Runway/Grok Lite');
console.log('');
console.log('VOCES');
console.log('Sofía: SIN DIÁLOGO · no requiere voz');
console.log('Elena: OpenAI marin · aprobada');
console.log('');
console.log('REFERENCIAS');
for (const ref of refs) {
  console.log(ref.label + ': ' + (ref.ready ? 'READY · ' + ref.asset : 'MISSING'));
}
console.log('');
console.log('COSTO SI SE AUTORIZA DESPUES');
console.log('T2 WAN: ' + wanCredits + ' créditos = US
console.log('Video total: US$' + SCENE6_MAX_VIDEO_USD_V6.toFixed(2));
console.log('Voces máximo: US$' + SCENE6_MAX_VOICE_USD_V6.toFixed(2));
console.log('Tope total provisional: US$' + SCENE6_SAFE_MAX_USD_V6.toFixed(2));
console.log('');
console.log('Fal.ai: PROHIBIDO / NO USADO');
console.log('Generación ejecutada: NO');
console.log('APIs externas: NO');
console.log('Gasto de este preflight: US$0');
console.log('SCENE6_SOFIA_AUDITION_REQUIRED=NO');
console.log('SCENE6_ELENA_APPROVED_VOICE=marin');
console.log('SCENE6_PREPARE=PASS');

async function referenceStatus(
  currentProject: typeof project,
  characterId: string,
  stateId: string
) {
  const character = currentProject.plan!.characters.find((item) => item.id === characterId);
  const bible = currentProject.plan!.realMotion?.characterBible.find((item) => item.characterId === characterId);
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
    } catch {}
  }

  return {
    label: character?.name || characterId,
    ready: false,
    asset: ''
  };
}
 + (wanCredits * 0.01).toFixed(2));
console.log('T1+T3 Grok Lite: ' + runwayCredits + ' créditos = US
console.log('Video total: US$' + SCENE6_MAX_VIDEO_USD_V6.toFixed(2));
console.log('Voces máximo: US$' + SCENE6_MAX_VOICE_USD_V6.toFixed(2));
console.log('Tope total provisional: US$' + SCENE6_SAFE_MAX_USD_V6.toFixed(2));
console.log('');
console.log('Fal.ai: PROHIBIDO / NO USADO');
console.log('Generación ejecutada: NO');
console.log('APIs externas: NO');
console.log('Gasto de este preflight: US$0');
console.log('SCENE6_SOFIA_AUDITION_REQUIRED=YES');
console.log('SCENE6_PREPARE=PASS');

async function referenceStatus(
  currentProject: typeof project,
  characterId: string,
  stateId: string
) {
  const character = currentProject.plan!.characters.find((item) => item.id === characterId);
  const bible = currentProject.plan!.realMotion?.characterBible.find((item) => item.characterId === characterId);
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
    } catch {}
  }

  return {
    label: character?.name || characterId,
    ready: false,
    asset: ''
  };
}
 + (runwayCredits * 0.01).toFixed(2));
console.log('Video total: US$' + SCENE6_MAX_VIDEO_USD_V6.toFixed(2));
console.log('Voces máximo: US$' + SCENE6_MAX_VOICE_USD_V6.toFixed(2));
console.log('Tope total provisional: US$' + SCENE6_SAFE_MAX_USD_V6.toFixed(2));
console.log('');
console.log('Fal.ai: PROHIBIDO / NO USADO');
console.log('Generación ejecutada: NO');
console.log('APIs externas: NO');
console.log('Gasto de este preflight: US$0');
console.log('SCENE6_SOFIA_AUDITION_REQUIRED=YES');
console.log('SCENE6_PREPARE=PASS');

async function referenceStatus(
  currentProject: typeof project,
  characterId: string,
  stateId: string
) {
  const character = currentProject.plan!.characters.find((item) => item.id === characterId);
  const bible = currentProject.plan!.realMotion?.characterBible.find((item) => item.characterId === characterId);
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
    } catch {}
  }

  return {
    label: character?.name || characterId,
    ready: false,
    asset: ''
  };
}
