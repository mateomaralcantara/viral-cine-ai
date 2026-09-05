import { spawnSync } from 'node:child_process';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const mode = process.env.PRODUCTION_MODE === 'real' ? 'real' : 'demo';
const checks = [
  ['Node.js 22+', Number(process.versions.node.split('.')[0]) >= 22],
  ['FFmpeg', spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-version'], { stdio: 'ignore', windowsHide: true }).status === 0],
  ['OpenAI: guion, imagen y voz', Boolean(process.env.OPENAI_API_KEY)],
  ['Google Gemini Omni / Veo', Boolean(process.env.GEMINI_API_KEY)],
  ['Fal: video, avatar y música', Boolean(process.env.FAL_KEY)]
];

console.log(`\nViralCine Studio · modo ${mode.toUpperCase()}\n`);
for (const [label, ok] of checks) console.log(`${ok ? '[OK]' : '[--]'} ${label}`);
if (mode === 'real' && !process.env.OPENAI_API_KEY) process.exitCode = 1;
if (mode === 'real' && !process.env.GEMINI_API_KEY && !process.env.FAL_KEY) process.exitCode = 1;
console.log('\nEn modo real necesitas OpenAI y al menos Gemini (Omni/Veo) o Fal.\n');
