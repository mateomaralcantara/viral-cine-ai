// ViralCine V7: verificación read-only, no publica secretos ni escribe en DB.
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const pub = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim();
const secret = (process.env.SUPABASE_SECRET_KEY || '').trim();
const expected = 'https://wrxeerltoapvybhaxlmu.supabase.co';

async function check(name, endpoint, key) {
  if (!key) throw new Error(`${name}: credencial ausente`);
  const response = await fetch(`${url}${endpoint}`, {
    method: 'GET',
    headers: {
      apikey: key,
      accept: 'application/json',
      'user-agent': 'ViralCine-Backend/7.0',
    },
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`${name}: HTTP ${response.status} (consulta read-only)`);
  }
  console.log(`[OK] ${name} HTTP ${response.status}`);
}

try {
  if (url !== expected) throw new Error('Project URL distinta de ViralCine V7');
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(pub)) throw new Error('Formato publishable incorrecto');
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(secret)) throw new Error('Formato secret incorrecto');
  await check('Publishable', '/auth/v1/settings', pub);
  await check('Secret / films', '/rest/v1/films?select=id&limit=1', secret);
  console.log('[OK] Supabase accesible. Sin escrituras ni consumo de proveedores de vídeo.');
} catch (e) {
  console.error('[ERROR]', e instanceof Error ? e.message : 'Error desconocido');
  process.exitCode = 1;
}
