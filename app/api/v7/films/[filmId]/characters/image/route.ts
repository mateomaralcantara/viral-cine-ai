import { readFile } from 'node:fs/promises';
import { localOriginAllowed } from '@/lib/v7/security/local-studio-session';
import { filmSerie } from '@/lib/v7/production/character-studio';
import { assertKey, imageKind, photoFilePath } from '@/lib/v7/production/character-identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ filmId: string }> };
const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;

/** Muestra el retrato oficial (file=maestro) o una foto subida de un personaje. */
export async function GET(request: Request, context: Context) {
  if (!localOriginAllowed(request)) return new Response('Solo estudio local.', { status: 403 });
  try {
    const { filmId } = await context.params;
    const url = new URL(request.url);
    const key = assertKey(url.searchParams.get('key') ?? '', 'personaje');
    const { serie } = await filmSerie(filmId);
    const bytes = await readFile(photoFilePath(serie, key, url.searchParams.get('file') ?? ''));
    const kind = imageKind(bytes);
    if (!kind) return new Response('No es una imagen.', { status: 415 });
    return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': TYPES[kind], 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return new Response('No encontrada.', { status: 404 });
  }
}
