import 'server-only';

import { randomUUID } from 'node:crypto';

type TestFilmResult = {
  id: string;
  title: string;
};

function config() {
  if (process.env.V7_SUPABASE_TEST_WRITE_ENABLED !== 'true') {
    throw new Error('Escritura de prueba desactivada');
  }

  if (process.env.V7_PERSISTENCE_MODE !== 'shadow') {
    throw new Error('Se requiere modo shadow autorizado');
  }

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!rawUrl || !secret) {
    throw new Error('Configuracion Supabase incompleta');
  }

  const url = new URL(rawUrl);

  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'wrxeerltoapvybhaxlmu.supabase.co'
  ) {
    throw new Error('Proyecto Supabase no autorizado');
  }

  return { baseUrl: url.origin, secret };
}

/**
 * Inserta exclusivamente una pelicula sintetica nueva.
 *
 * No usa UPSERT, UPDATE ni DELETE.
 * No incorpora esta funcion a rutas HTTP.
 */
export async function insertSyntheticV7Film(): Promise<TestFilmResult> {
  const { baseUrl, secret } = config();

  const id = `v7-test-${randomUUID()}`;
  const title = 'V7 Synthetic Persistence Test';

  const response = await fetch(`${baseUrl}/rest/v1/films`, {
    method: 'POST',
    headers: {
      apikey: secret,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
      'User-Agent': 'ViralCine-Backend/7.0'
    },
    body: JSON.stringify({
      id,
      title,
      premise: 'Registro tecnico sintetico, sin produccion audiovisual.',
      duration_minutes: 1,
      genre: 'Test',
      language: 'es',
      aspect_ratio: '16:9',
      budget_usd: 0,
      metadata: {
        synthetic: true,
        origin: 'v7-integration-test'
      }
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    throw new Error(`Insercion de prueba fallida: HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();

  if (!Array.isArray(payload) || payload.length !== 1) {
    throw new Error('Respuesta inesperada tras insertar prueba');
  }

  const record = payload[0] as Record<string, unknown>;

  if (record.id !== id || record.title !== title) {
    throw new Error('Respuesta inconsistente de Supabase');
  }

  return { id, title };
}