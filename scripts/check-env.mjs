import { spawnSync } from 'node:child_process';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const mode = process.env.PRODUCTION_MODE === 'real' ? 'real' : 'demo';
const enabled = (name) => ['1', 'true', 'yes', 'on'].includes((process.env[name] || '').trim().toLowerCase());
const usable = (name) => {
  const value = (process.env[name] || '').trim();
  return value.length >= 8 && !/^(?:disabled(?:_offline)?|off|none|null|undefined|your[_-].*|replace[_-].*|changeme|example)$/i.test(value);
};
const externalAllowed = mode === 'real' && enabled('ALLOW_EXTERNAL_API_CALLS');
const paidAllowed = externalAllowed && enabled('ALLOW_PAID_GENERATION');
const checks = [
  ['Node.js 22+', Number(process.versions.node.split('.')[0]) >= 22],
  ['FFmpeg', spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-version'], { stdio: 'ignore', windowsHide: true }).status === 0],
  ['Llamadas externas autorizadas', externalAllowed],
  ['Generación pagada autorizada', paidAllowed],
  ['OpenAI: guion, imagen y voz', usable('OPENAI_API_KEY')],
  ['Google Gemini Omni / Veo', usable('GEMINI_API_KEY')],
  ['Fal: video, avatar y música', usable('FAL_KEY')]
];

console.log(`\nViralCine Studio · modo ${mode.toUpperCase()}\n`);
for (const [label, ok] of checks) console.log(`${ok ? '[OK]' : '[--]'} ${label}`);
if (mode === 'real' && (!externalAllowed || !paidAllowed)) process.exitCode = 1;
if (mode === 'real' && !usable('OPENAI_API_KEY')) process.exitCode = 1;
if (mode === 'real' && !usable('GEMINI_API_KEY') && !usable('FAL_KEY')) process.exitCode = 1;
console.log(mode === 'real'
  ? '\nModo real: exige dos autorizaciones explícitas, OpenAI y al menos Gemini o Fal.\n'
  : '\nModo demo seguro: las APIs externas y pagadas permanecen bloqueadas.\n');
