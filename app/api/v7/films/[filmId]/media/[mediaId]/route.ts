import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { Readable } from 'node:stream';
import { readV7FilmBundle } from '@/lib/v7/storage/film-store';
import { resolveV7AssetAbsolutePath } from '@/lib/v7/storage/asset-resolver';
import { getMasterAsset } from '@/lib/v7/library/library-view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ filmId: string; mediaId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { filmId, mediaId } = await context.params;
    const bundle = await readV7FilmBundle(filmId);
    const asset = mediaId === 'master'
      ? getMasterAsset(bundle)
      : bundle.assets.find((candidate) => candidate.id === mediaId);

    if (!asset) return new Response('Video no encontrado', { status: 404 });
    if (!['video', 'master'].includes(asset.type)) {
      return new Response('El asset solicitado no es video', { status: 400 });
    }

    const absolute = resolveV7AssetAbsolutePath(bundle.film, asset);
    const info = await stat(absolute);
    if (!info.isFile()) return new Response('Video no encontrado', { status: 404 });

    const url = new URL(request.url);
    const download = url.searchParams.get('download') === '1';
    const fileName = safeFileName(
      mediaId === 'master'
        ? bundle.film.title + ' - PELICULA FINAL' + extname(absolute)
        : basename(absolute)
    );
    const commonHeaders: Record<string, string> = {
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType(absolute),
      'Cache-Control': 'private, no-store',
      'Content-Disposition': (download ? 'attachment' : 'inline') + '; filename="' + fileName + '"'
    };

    const range = request.headers.get('range');
    if (!range) {
      const stream = createReadStream(absolute);
      return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
        status: 200,
        headers: {
          ...commonHeaders,
          'Content-Length': String(info.size)
        }
      });
    }

    const parsed = parseRange(range, info.size);
    if (!parsed) {
      return new Response('Rango inválido', {
        status: 416,
        headers: { 'Content-Range': 'bytes */' + info.size }
      });
    }

    const { start, end } = parsed;
    const stream = createReadStream(absolute, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status: 206,
      headers: {
        ...commonHeaders,
        'Content-Length': String(end - start + 1),
        'Content-Range': 'bytes ' + start + '-' + end + '/' + info.size
      }
    });
  } catch {
    return new Response('Video no encontrado', { status: 404 });
  }
}

function parseRange(value: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match) return undefined;

  let start: number;
  let end: number;

  if (!match[1] && match[2]) {
    const suffix = Number(match[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) return undefined;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = match[1] ? Number(match[1]) : 0;
    end = match[2] ? Number(match[2]) : size - 1;
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) return undefined;

  return { start, end: Math.min(end, size - 1) };
}

function contentType(filePath: string) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  return 'application/octet-stream';
}

function safeFileName(value: string) {
  return value.replace(/[\r\n"]/g, '').replace(/[\\/:*?<>|]+/g, '-').trim() || 'video.mp4';
}
