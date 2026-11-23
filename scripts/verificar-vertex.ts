/**
 * Comprueba la configuración de Vertex AI sin generar nada ni cobrar.
 *   npm run verificar:vertex
 * Lee .env.local: GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, V7_VERTEX_KEY_FILE, V7_VEO_SCENE_MODEL.
 * Nunca imprime la clave privada de la cuenta de servicio.
 */
import { readFile } from 'node:fs/promises';
import nextEnv from '@next/env';
import { GoogleAuth } from 'google-auth-library';

nextEnv.loadEnvConfig(process.cwd());
const ok = (t: string) => console.log('  OK    ' + t);
const bad = (t: string) => console.log('  FALLA ' + t);
const warn = (t: string) => console.log('  AVISO ' + t);

const project = (process.env.GOOGLE_CLOUD_PROJECT || '').trim();
const location = (process.env.GOOGLE_CLOUD_LOCATION || 'us-central1').trim();
const keyFile = (process.env.V7_VERTEX_KEY_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
const model = (process.env.V7_VEO_SCENE_MODEL || '').trim();
const platform = process.env.V7_VIDEO_PLATFORM?.trim().toLowerCase() === 'vertex' ? 'vertex' : 'gemini';

console.log('=== Vertex AI (solo comprobación, sin costo) ===');
platform === 'vertex' ? ok('V7_VIDEO_PLATFORM=vertex') : warn('V7_VIDEO_PLATFORM no es "vertex": el estudio sigue usando AI Studio');
project ? ok('Proyecto: ' + project) : bad('Falta GOOGLE_CLOUD_PROJECT');
ok('Región: ' + location);
model ? (model.startsWith('gemini-omni') ? bad('Modelo ' + model + ': Omni no existe en Vertex; usa un modelo Veo') : ok('Modelo: ' + model)) : bad('Falta V7_VEO_SCENE_MODEL');
if (!keyFile) { bad('Falta V7_VERTEX_KEY_FILE (ruta al JSON de la cuenta de servicio)'); process.exit(1); }

let email = '';
try {
  const json = JSON.parse(await readFile(keyFile, 'utf8')) as { client_email?: string; project_id?: string; type?: string };
  if (json.type !== 'service_account') throw new Error('el archivo no es de tipo service_account');
  email = json.client_email || '';
  ok('Cuenta de servicio: ' + email);
  if (project && json.project_id && json.project_id !== project) warn('El JSON es del proyecto ' + json.project_id + ', distinto de GOOGLE_CLOUD_PROJECT');
} catch (e) {
  bad('No se pudo leer ' + keyFile + ': ' + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
}

try {
  const auth = new GoogleAuth({ keyFilename: keyFile, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  if (!token) throw new Error('sin token');
  ok('Autenticación con Google Cloud correcta');
  if (project && model && !model.startsWith('gemini-omni')) {
    // Catálogo de modelos de Google (Model Garden): consulta gratuita, no genera nada.
    const url = `https://${location}-aiplatform.googleapis.com/v1beta1/publishers/google/models/${model}`;
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token, 'x-goog-user-project': project } });
    if (res.ok) {
      const info = await res.json() as { launchStage?: string; versionState?: string };
      ok('El modelo ' + model + ' está disponible en ' + location + (info.launchStage ? ' (' + info.launchStage + ')' : ''));
    }
    else {
      const body = await res.text();
      bad('Vertex respondió HTTP ' + res.status + ' para ' + model + ': ' + body.replace(/\s+/g, ' ').slice(0, 300));
      if (res.status === 403) warn('Activa la API "Vertex AI" en el proyecto y da a la cuenta el rol "Vertex AI User".');
      if (res.status === 404) warn('Ese ID de modelo no existe en esa región; revisa el nombre exacto en Model Garden.');
    }
  }
} catch (e) {
  bad('Autenticación fallida: ' + (e instanceof Error ? e.message : String(e)));
}
console.log('Recuerda: los créditos gratuitos de Google Cloud se ven en Facturación > Créditos de la consola.');
