import { access } from 'node:fs/promises';
import path from 'node:path';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  assetAbsolutePath,
  getProject,
  projectAssetDir
} from '@/lib/storage/project-store';
import {
  grokLiteImageToVideoCredits,
  wan3VideoCredits
} from '@/lib/providers/runway-router-v6';
import {
  SCENE6_ELENA_ID_V6,
  SCENE6_SOFIA_ID_V6,
  SCENE6_MATEO_ID_V6
} from '@/lib/engine/scene6-closing-plan-v6';
import {
  buildScene6BRepairShotsV6,
  validateScene6BRepairShotsV6,
  SCENE6B_MAX_VIDEO_USD_V6,
  SCENE6B_AUTHORIZED_MAX_USD_V6
} from '@/lib/engine/scene6b-repair-spec-v6';

loadProjectLocalEnvOverride();

const [projectId] = process.argv.slice(2);
if (!projectId) {
  console.error(
    'Uso: npm run safe:scene6b:prepare -- <projectId>'
  );
  process.exit(1);
}

if (
  process.env.ALLOW_EXTERNAL_API_CALLS === 'true' ||
  process.env.ALLOW_PAID_GENERATION === 'true' ||
  process.env.ALLOW_PAID_PROVIDER_FALLBACK === 'true'
) {
  throw new Error(
    'Scene 6B prepare exige APIs pagadas bloqueadas.'
  );
}

const project = await getProject(projectId);

if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
  throw new Error(
    'Este preflight solo está autorizado para 15 DÍAS.'
  );
}
if (!project.plan || project.plan.scenes.length !== 6) {
  throw new Error(
    'Se esperaba 15 DÍAS short de 6 escenas.'
  );
}

const scene5 = project.plan.scenes.find(
  (item) => item.order === 5
);
if (
  !scene5 ||
  scene5.status !== 'ready' ||
  !scene5.qualityOverrideApproved ||
  !scene5.videoAsset?.endsWith(
    'scene-005-wan3-reunion-v6-mateo-true-child.mp4'
  )
) {
  throw new Error(
    'Escena 5 debe estar aprobada/congelada con el master true-child.'
  );
}
await access(
  assetAbsolutePath(project.id, scene5.videoAsset)
);

const scene6 = project.plan.scenes.find(
  (item) => item.order === 6
);
if (!scene6) {
  throw new Error('No existe Escena 6.');
}

const originalMaster = path.join(
  projectAssetDir(project.id, 'video'),
  'scene-006-home-promise-v6.mp4'
);
await access(originalMaster);

const originalElenaAudio = path.join(
  projectAssetDir(project.id, 'audio'),
  'scene6-v6',
  'scene-006-shot-02-elena-master.wav'
);
await access(originalElenaAudio);

const familyReference = path.join(
  projectAssetDir(project.id, 'images'),
  'scene5-v6',
  'scene-005-shot-01-family-reference.png'
);
await access(familyReference);

const refs = {
  elena: await characterReference(
    project,
    SCENE6_ELENA_ID_V6,
    'elena-d-restored'
  ),
  sofia: await characterReference(
    project,
    SCENE6_SOFIA_ID_V6,
    'sofia-main'
  ),
  mateo: await characterReference(
    project,
    SCENE6_MATEO_ID_V6,
    'mateo-main'
  )
};

const repairShots = buildScene6BRepairShotsV6(scene6.id);
validateScene6BRepairShotsV6(repairShots);

const grokCredits =
  grokLiteImageToVideoCredits(4, 'auto_720p') * 2;
const wanCredits = wan3VideoCredits(4, '1280:720');
const totalCredits = grokCredits + wanCredits;
const videoUsd = totalCredits * 0.01;

if (Math.abs(videoUsd - SCENE6B_MAX_VIDEO_USD_V6) > 0.0001) {
  throw new Error(
    'SAFE COST GATE 6B: video cambió a US$' +
      videoUsd.toFixed(2) +
      '.'
  );
}

if (
  videoUsd >
  SCENE6B_AUTHORIZED_MAX_USD_V6 + 0.0001
) {
  throw new Error(
    'SAFE COST GATE 6B: video excede autorización US$' +
      SCENE6B_AUTHORIZED_MAX_USD_V6.toFixed(2) +
      '.'
  );
}

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — ESCENA 6B / REPAIR PREFLIGHT');
console.log('==================================================');
console.log('Master original preservado: SI');
console.log('Audio Elena marin reutilizable: SI');
console.log('Imagen OpenAI nueva: NO');
console.log('');
console.log('ARQUITECTURA 6B');
console.log('T1 · 4s · SOLO Sofía · Grok Lite');
console.log('T2 · 4s · SOLO Elena · audio marin reutilizado + WAN 3.0');
console.log('T3 · 4s · abrazo familiar DESDE ATRÁS · Grok Lite');
console.log('');
console.log('IDENTITY LOCK');
console.log('T1 personajes visibles: Sofía únicamente');
console.log('T2 personajes visibles: Elena únicamente');
console.log('T3 rostros visibles: NINGUNO');
console.log('T3 estructura: Elena centro / Sofía izquierda / Mateo derecha');
console.log('');
console.log('REFERENCIAS');
console.log('Elena: READY · ' + refs.elena);
console.log('Sofía: READY · ' + refs.sofia);
console.log('Mateo: READY · ' + refs.mateo);
console.log('Familia E5: READY · ' + familyReference);
console.log('');
console.log('COSTO SI SE EJECUTA');
console.log(
  'T1+T3 Grok Lite: ' +
    grokCredits +
    ' créditos = US$' +
    (grokCredits * 0.01).toFixed(2)
);
console.log(
  'T2 WAN: ' +
    wanCredits +
    ' créditos = US$' +
    (wanCredits * 0.01).toFixed(2)
);
console.log('Voz nueva: US$0.00 · se reutiliza marin existente');
console.log(
  'Máximo real 6B: US$' +
    SCENE6B_MAX_VIDEO_USD_V6.toFixed(2)
);
console.log(
  'Autorización vigente: US$' +
    SCENE6B_AUTHORIZED_MAX_USD_V6.toFixed(2)
);
console.log('');
console.log('Fal.ai: PROHIBIDO / NO USADO');
console.log('Retry automático: NO');
console.log('Generación ejecutada: NO');
console.log('Gasto de este preflight: US$0');
console.log('SCENE6B_PREPARE=PASS');

async function characterReference(
  currentProject: typeof project,
  characterId: string,
  stateId: string
) {
  const character =
    currentProject.plan!.characters.find(
      (item) => item.id === characterId
    );
  const bible =
    currentProject.plan!.realMotion?.characterBible.find(
      (item) => item.characterId === characterId
    );
  const state = bible?.states.find(
    (item) => item.id === stateId
  );

  const candidates = [
    state?.referenceAsset,
    bible?.bodyReferenceAsset,
    bible?.masterReferenceAsset,
    character?.referenceAsset
  ].filter((value): value is string => Boolean(value));

  for (const asset of candidates) {
    const full = assetAbsolutePath(
      currentProject.id,
      asset
    );
    try {
      await access(full);
      return full;
    } catch {}
  }

  throw new Error(
    'No existe referencia utilizable para ' +
      (character?.name || characterId) +
      ' / ' +
      stateId +
      '.'
  );
}
