import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { v7FilmRoot } from '@/lib/v7/storage/film-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILM_ID = 'film-dos-toques-de-bocina-v7';
type Context = { params: Promise<{ filmId: string }> };

export async function GET(request: Request, context: Context) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (process.env.NODE_ENV !== 'development' ||
      !['localhost', '127.0.0.1', '::1'].includes(url.hostname) ||
      (origin && origin !== url.origin) ||
      (await context.params).filmId !== FILM_ID) {
    return new Response(null, { status: 403 });
  }
  try {
    const filename = path.join(v7FilmRoot(FILM_ID), 'e01-p01', 'referencia-familia-v2.png');
    const info = await stat(filename);
    if (!info.isFile() || info.size > 8 * 1024 * 1024) return new Response(null, { status: 404 });
    const bytes = await readFile(filename);
    return new Response(bytes, { status: 200, headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    }});
  } catch { return new Response(null, { status: 404 }); }
}
