import { open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  createFileByteRangeStream,
  parseVideoByteRange
} from '@/lib/v7/media/file-byte-range-stream';
import { v7FilmRoot } from '@/lib/v7/storage/film-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILM = 'film-dos-toques-de-bocina-v7';
const FILE = 'E01-P02-veo-candidato.mp4';
type Context = { params: Promise<{ filmId: string }> };

async function candidate(request: Request, ctx: Context) {
  if (process.env.NODE_ENV !== 'development') return null;
  const url = new URL(request.url);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return null;
  if ((await ctx.params).filmId !== FILM) return null;
  const dir = path.join(v7FilmRoot(FILM), 'e01-p02');
  const record = JSON.parse(await readFile(path.join(dir, 'provider-operation.json'), 'utf8')) as {
    filmId: string; shotId: string; status: string;
  };
  if (record.filmId !== FILM || record.shotId !== 'E01-P02' ||
      record.status !== 'review-required') return null;
  const file = path.join(dir, FILE);
  const info = await stat(file);
  return info.isFile() && info.size > 10000 ? { file, length: info.size } : null;
}

async function serve(request: Request, ctx: Context, headOnly: boolean) {
  try {
    const video = await candidate(request, ctx);
    if (!video) return new Response(null, { status: 404 });
    const requested = request.headers.get('range');
    const parsed = requested === null ? null : parseVideoByteRange(requested, video.length);
    const headers: Record<string, string> = {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline; filename="' + FILE + '"',
      'X-Content-Type-Options': 'nosniff'
    };
    if (requested !== null && !parsed) return new Response(null, {
      status: 416, headers: { ...headers, 'Content-Range': 'bytes */' + video.length }
    });
    const start = parsed?.start ?? 0;
    const end = parsed?.end ?? video.length - 1;
    headers['Content-Length'] = String(end - start + 1);
    if (parsed) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + video.length;
    const status = parsed ? 206 : 200;
    if (headOnly) return new Response(null, { status, headers });
    const handle = await open(video.file, 'r');
    return new Response(createFileByteRangeStream(handle, start, end), { status, headers });
  } catch { return new Response(null, { status: 404 }); }
}

export async function GET(request: Request, ctx: Context) { return serve(request, ctx, false); }
export async function HEAD(request: Request, ctx: Context) { return serve(request, ctx, true); }
