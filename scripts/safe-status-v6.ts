import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';

loadProjectLocalEnvOverride();

const keys = [
  'ALLOW_EXTERNAL_API_CALLS',
  'ALLOW_PAID_GENERATION',
  'ALLOW_PAID_PROVIDER_FALLBACK',
  'STRICT_SCENE_QUALITY',
  'SAFE_MAX_SINGLE_CALL_USD'
];

console.log('\n=== VIRALCINE 6 SAFE — ESTADO DE GASTO ===');
for (const key of keys) {
  const value = process.env[key];
  console.log(key + '=' + (value === undefined ? '(no definido)' : value));
}

const locked =
  process.env.ALLOW_EXTERNAL_API_CALLS !== 'true' &&
  process.env.ALLOW_PAID_GENERATION !== 'true';

console.log('');
console.log('PAID_APIS_LOCKED=' + (locked ? 'YES' : 'NO'));
console.log('Este comando no llama APIs externas.');
