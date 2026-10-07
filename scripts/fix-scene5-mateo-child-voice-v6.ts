import path from 'node:path';
import { access } from 'node:fs/promises';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import {
  assetAbsolutePath,
  assetRelativePath,
  getProject,
  projectAssetDir,
  saveProject
} from '@/lib/storage/project-store';
import {
  concatenate,
  replaceAudioPreserveVideo
} from '@/lib/media/ffmpeg';
import {
  assertCinematicSceneVideo
} from '@/lib/media/probe';

loadProjectLocalEnvOverride();

const [projectId, confirmation] = process.argv.slice(2);
const EXPECTED = '--fix-mateo-child-voice-local';

if (!projectId || confirmation !== EXPECTED) {
  console.error(
    'Uso: npm run safe:scene5:fix-mateo-voice -- <projectId> ' + EXPECTED
  );
  process.exit(1);
}

if (
  process.env.ALLOW_EXTERNAL_API_CALLS === 'true' ||
  process.env.ALLOW_PAID_GENERATION === 'true'
) {
  throw new Error(
    'Este arreglo local exige APIs pagadas bloqueadas.'
  );
}

const project = await getProject(projectId);

if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
  throw new Error('Este arreglo solo está autorizado para 15 DÍAS.');
}
if (!project.plan || project.plan.scenes.length !== 6) {
  throw new Error('Se esperaba 15 DÍAS short de 6 escenas.');
}

const scene5 = project.plan.scenes.find((item) => item.order === 5);
if (!scene5 || scene5.id !== 'scene-15d-short-05') {
  throw new Error('No encuentro Escena 5 short.');
}

const videoDir = path.join(
  projectAssetDir(project.id, 'video'),
  'scene5-v6'
);
const audioDir = path.join(
  projectAssetDir(project.id, 'audio'),
  'scene5-v6'
);

const fixes = [
  {
    order: 3,
    sourceVideo: path.join(
      videoDir,
      'scene-005-shot-03-wan3-final.mp4'
    ),
    childVoice: path.join(
      audioDir,
      'scene-005-shot-03-master.wav'
    ),
    outputVideo: path.join(
      videoDir,
      'scene-005-shot-03-child-voice-final.mp4'
    )
  },
  {
    order: 5,
    sourceVideo: path.join(
      videoDir,
      'scene-005-shot-05-wan3-final.mp4'
    ),
    childVoice: path.join(
      audioDir,
      'scene-005-shot-05-master.wav'
    ),
    outputVideo: path.join(
      videoDir,
      'scene-005-shot-05-child-voice-final.mp4'
    )
  }
];

for (const fix of fixes) {
  await mustExist(fix.sourceVideo, 'video WAN final T' + fix.order);
  await mustExist(fix.childVoice, 'voz infantil master T' + fix.order);

  if (!(await exists(fix.outputVideo))) {
    await replaceAudioPreserveVideo(
      fix.sourceVideo,
      fix.childVoice,
      4,
      fix.outputVideo
    );
  }

  await assertCinematicSceneVideo(
    fix.outputVideo,
    4,
    {
      requireMotion: true,
      requireAudibleAudio: true
    }
  );

  const shot = scene5.shots.find((item) => item.order === fix.order);
  if (!shot) {
    throw new Error('No encuentro E5/T' + fix.order + '.');
  }

  shot.videoAsset = assetRelativePath(project.id, fix.outputVideo);
  shot.voiceAsset = assetRelativePath(project.id, fix.childVoice);
  shot.status = 'ready';
  shot.error = undefined;
  shot.lastProvider = 'local-remux / Mateo child voice';
  shot.pipelineVersion = '6.0-scene5-child-voice-fix';
}

const ordered = [...scene5.shots].sort((a, b) => a.order - b.order);
const allReady = ordered.every((shot) => {
  if (!shot.videoAsset) return false;
  return true;
});

let finalScenePath = '';

if (allReady) {
  const clips = ordered.map((shot) =>
    assetAbsolutePath(project.id, shot.videoAsset!)
  );

  for (const clip of clips) {
    await mustExist(clip, 'clip final Escena 5');
  }

  finalScenePath = path.join(
    projectAssetDir(project.id, 'video'),
    'scene-005-wan3-reunion-v6-child-voice.mp4'
  );

  await concatenate(clips, finalScenePath);

  await assertCinematicSceneVideo(
    finalScenePath,
    30,
    {
      requireMotion: true,
      requireAudibleAudio: true
    }
  );

  scene5.videoAsset = assetRelativePath(project.id, finalScenePath);
  scene5.status = 'review-required';
  scene5.error =
    'Mateo corregido localmente con la voz infantil OpenAI ash ya aprobada en T3 y T5. Revisión humana requerida.';
}

project.productionLog.push(
  new Date().toISOString() +
    ' ViralCine 6 Safe: Mateo corregido localmente en E5/T3 y E5/T5 usando los masters ash originales; video WAN preservado; APIs externas NO; gasto US$0.'
);

await saveProject(project);

console.log('\n==================================================');
console.log(' VIRALCINE 6 — MATEO VOZ INFANTIL CORREGIDA');
console.log('==================================================');
console.log('T3 video: PRESERVADO');
console.log('T3 voz: master OpenAI ash original');
console.log('T5 video: PRESERVADO');
console.log('T5 voz: master OpenAI ash original');
console.log('Runway llamado: NO');
console.log('OpenAI llamado: NO');
console.log('Fal.ai llamado: NO');
console.log('Gasto nuevo: US$0');
console.log(
  'Escena recompuesta: ' + (finalScenePath ? 'SI' : 'NO')
);
if (finalScenePath) {
  console.log('SCENE_VIDEO=' + finalScenePath);
}
console.log('MATEO_CHILD_VOICE_FIX=PASS');

async function mustExist(filePath: string, label: string) {
  if (!(await exists(filePath))) {
    throw new Error(
      'Falta ' + label + ': ' + filePath
    );
  }
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
