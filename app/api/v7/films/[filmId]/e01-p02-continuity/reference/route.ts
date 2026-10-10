import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { v7FilmRoot } from '@/lib/v7/storage/film-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ filmId: string }> };
export async function GET(request: Request, context: Context) {
  const url = new URL(request.url);
  if (process.env.NODE_ENV !== 'development' ||
      !['localhost','127.0.0.1','::1'].includes(url.hostname) ||
      (await context.params).filmId !== 'film-dos-toques-de-bocina-v7') {
    return new Response(null, { status: 403 });
  }
  try {
    const file = path.join(v7FilmRoot('film-dos-toques-de-bocina-v7'),
      'e01-p02', 'continuidad-final-p01.png');
    const info = await stat(file);
    if (!info.isFile() || info.size > 10 * 1024 * 1024) {
      return new Response(null, { status: 404 });
    }
    const bytes = await readFile(file);
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(bytes.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch { return new Response(null, { status: 404 }); }
}
