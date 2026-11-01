import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { v7FilmRoot } from '@/lib/v7/storage/film-store';
import {
  createFileByteRangeStream, parseVideoByteRange
} from '@/lib/v7/media/file-byte-range-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ filmId: string }> };
const FILE = '15-DIAS-LIBROSELLER-4MIN-CORTE-CERRADO.mp4';

async function locateClosedCut(filmId: string) {
  // Fixed filename under approved V7 working directories; no user-provided paths.
  const root = v7FilmRoot(filmId);
  const entries = await readdir(root, { withFileTypes: true });
  const names = entries.filter((entry) => entry.isDirectory() &&
    /^cierre-4min-[a-zA-Z0-9-]+$/.test(entry.name))
    .map((entry) => entry.name).sort().reverse();
  for (const name of names) {
    const full = path.join(root, name, FILE);
    try {
      const info = await stat(full);
      if (info.isFile() && info.size > 10000) return { file: full, size: info.size };
    } catch { /* Try an earlier completed export. */ }
  }
  return null;
}

export async function GET(request: Request, context: Context) {
  return serve(request, context, false);
}
export async function HEAD(request: Request, context: Context) {
  return serve(request, context, true);
}

async function serve(request: Request, context: Context, head: boolean) {
  try {
    const { filmId } = await context.params;
    const cut = await locateClosedCut(filmId);
    if (!cut) return new Response(null, { status: 404 });
    const headers: Record<string, string> = {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline; filename="' + FILE + '"',
      'X-Content-Type-Options': 'nosniff'
    };
    const range = request.headers.get('range');
    const parsed = range === null ? null : parseVideoByteRange(range, cut.size);
    if (range !== null && !parsed) {
      return new Response(null, { status: 416,
        headers: { ...headers, 'Content-Range': 'bytes */' + cut.size } });
    }
    const start = parsed?.start ?? 0;
    const end = parsed?.end ?? cut.size - 1;
    const status = parsed ? 206 : 200;
    headers['Content-Length'] = String(end - start + 1);
    if (parsed) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + cut.size;
    if (head) return new Response(null, { status, headers });
    const handle = await open(cut.file, 'r');
    return new Response(createFileByteRangeStream(handle, start, end), { status, headers });
  } catch {
    return new Response(null, { status: 404 });
  }
}
