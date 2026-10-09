/**
 * ViralCine V7 - Supabase Film Reader
 *
 * Server-only, read-only.
 * No INSERT, UPDATE, DELETE, rendering or paid APIs.
 */

import 'server-only';

export type SupabaseFilmSummary = {
  id: string;
  title: string;
  duration_minutes: number;
  genre: string;
  language: string;
  updated_at: string;
};

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error('Supabase V7 no configurado');
  }

  const parsed = new URL(url);

  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'wrxeerltoapvybhaxlmu.supabase.co'
  ) {
    throw new Error('Proyecto Supabase inesperado');
  }

  return {
    url: parsed.origin,
    secret
  };
}

export async function listSupabaseV7Films(
  limit = 20
): Promise<SupabaseFilmSummary[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Limite invalido');
  }

  const { url, secret } = configuration();

  const params = new URLSearchParams({
    select: 'id,title,duration_minutes,genre,language,updated_at',
    order: 'updated_at.desc',
    limit: String(limit)
  });

  const response = await fetch(
    `${url}/rest/v1/films?${params}`,
    {
      method: 'GET',
      headers: {
        apikey: secret,
        Accept: 'application/json',
        'User-Agent': 'ViralCine-Backend/7.0'
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(20000)
    }
  );

  if (!response.ok) {
    throw new Error(
      `Lectura Supabase fallida: HTTP ${response.status}`
    );
  }

  const data: unknown = await response.json();

  if (!Array.isArray(data)) {
    throw new Error('Respuesta de Supabase invalida');
  }

  return data as SupabaseFilmSummary[];
}