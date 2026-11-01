import path from 'node:path';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { fal } from '@fal-ai/client';

loadProjectLocalEnvOverride();

const key = process.env.FAL_KEY?.trim();
if (!key || key.length < 8) {
  throw new Error('FAL_KEY no está configurada.');
}

fal.config({ credentials: key });

console.log('\nFal storage auth check — sin inferencia de modelo');
console.log('Probando autorización de almacenamiento con un archivo mínimo...');

try {
  const file = new File(['ok'], 'viralcine-fal-check.txt', { type: 'text/plain' });
  const url = await fal.storage.upload(file);
  const host = new URL(url).host;
  console.log('FAL_STORAGE_AUTH=PASS');
  console.log('Host de almacenamiento: ' + host);
  console.log('No se llamó ningún modelo de inferencia.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('FAL_STORAGE_AUTH=FAIL');
  console.error(message.replace(key, '[FAL_KEY]'));
  process.exit(2);
}
