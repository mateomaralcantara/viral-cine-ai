import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import path from 'node:path';
import OpenAI from 'openai';

loadLocalEnvSafely();

const key = process.env.OPENAI_API_KEY?.trim();
if (!key || key.length < 20) {
  throw new Error('OPENAI_API_KEY no está configurada.');
}

const client = new OpenAI({ apiKey: key });

console.log('\nOpenAI auth check — sin generación');
console.log('Validando la clave mediante una operación de lectura...');

try {
  const page = await client.models.list();
  const models = [];
  for await (const model of page) {
    models.push(model.id);
    if (models.length >= 5) break;
  }
  console.log('OPENAI_AUTH=PASS');
  console.log('Modelos visibles muestreados: ' + models.length);
  console.log('No se generó imagen, audio ni texto.');
} catch (error) {
  const e = error as { status?: number; code?: string; message?: string };
  console.error('OPENAI_AUTH=FAIL');
  console.error('HTTP=' + (e.status ?? 'N/D'));
  console.error('CODE=' + (e.code ?? 'N/D'));
  console.error((e.message || String(error)).replace(key, '[OPENAI_API_KEY]'));
  process.exit(2);
}

function loadLocalEnvSafely() {
  for (const name of ['.env.local', '.env']) {
    const file = path.resolve(process.cwd(), name);
    if (!existsSync(file)) continue;
    loadEnvFile(file);
    break;
  }
}
