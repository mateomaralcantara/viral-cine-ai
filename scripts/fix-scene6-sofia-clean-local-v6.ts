import path from 'node:path';
import { access } from 'node:fs/promises';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { getProject, projectAssetDir } from '@/lib/storage/project-store';
import { createCleanVoicePreserveTiming } from '@/lib/media/ffmpeg';
import { probeMediaDurationSeconds } from '@/lib/media/segmented-ffmpeg';

loadProjectLocalEnvOverride();

const [projectId] = process.argv.slice(2);

if (!projectId) {
  console.error('Uso: npm run safe:scene6:sofia-clean-local -- <projectId>');
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
  throw new Error('Solo autorizado para 15 DÍAS.');
}

const audioDir = path.join(
  projectAssetDir(project.id, 'audio'),
  'scene6-v6'
);

const raw = path.join(
  audioDir,
  'scene-006-sofia-audition-coral-raw.mp3'
);

const clean = path.join(
  audioDir,
  'scene-006-sofia-audition-clean.wav'
);

await access(raw);

const duration = await probeMediaDurationSeconds(raw);

await createCleanVoicePreserveTiming(
  raw,
  duration,
  clean
);

await access(clean);

console.log('\n==================================================');
console.log(' VIRALCINE 6 — SOFIA VOZ LIMPIA');
console.log('==================================================');
console.log('Fuente: OpenAI coral RAW ya generada');
console.log('Pitch shift: NO');
console.log('Time stretch: NO');
console.log('EQ agresiva: NO');
console.log('Runway: NO');
console.log('OpenAI nuevo: NO');
console.log('Fal.ai: NO');
console.log('Gasto nuevo: US$0');
console.log('CLEAN_AUDIO=' + clean);
console.log('SOFIA_CLEAN_REVIEW_REQUIRED=YES');
