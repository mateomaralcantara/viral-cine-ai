import { open, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { readV7FilmBundle } from '@/lib/v7/storage/film-store';
import { resolveV7AssetAbsolutePath } from '@/lib/v7/storage/asset-resolver';
import { getMasterAsset } from '@/lib/v7/library/library-view';
import { createFileByteRangeStream, parseVideoByteRange } from '@/lib/v7/media/file-byte-range-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ filmId: string; mediaId: string }> };

export async function GET(request: Request, context: Context) {
  return serveMedia(request, context, false);
}

export async function HEAD(request: Request, context: Context) {
  return serveMedia(request, context, true);
}

async function serveMedia(request: Request, context: Context, headersOnly: boolean) {
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
        ? bundle.film.title + ' - MASTER ORIGINAL' + extname(absolute)
        : basename(absolute)
    );
    const commonHeaders: Record<string, string> = {
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType(absolute),
      'Cache-Control': 'private, no-store',
      'Content-Disposition': (download ? 'attachment' : 'inline') + '; filename="' + fileName + '"',
      'X-Content-Type-Options': 'nosniff'
    };

    const range = request.headers.get('range');
    const parsed = range === null ? null : parseVideoByteRange(range, info.size);

    if (range !== null && !parsed) {
      return new Response(null, {
        status: 416,
        headers: {
          ...commonHeaders,
          'Content-Range': 'bytes */' + info.size
        }
      });
    }

    const start = parsed?.start ?? 0;
    const end = parsed?.end ?? info.size - 1;
    const status = parsed ? 206 : 200;
    const headers: Record<string, string> = {
      ...commonHeaders,
      'Content-Length': String(parsed ? end - start + 1 : info.size)
    };
    if (parsed) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + info.size;

    if (headersOnly || info.size === 0) return new Response(null, { status, headers });

    // Open AFTER all validation and range checks; no source files are modified.
    const file = await open(absolute, 'r');
    // The response reads one bounded chunk per pull and releases the handle
    // on a finished range or a cancelled seek.
    const stream = createFileByteRangeStream(file, start, end);
    return new Response(stream, { status, headers });
  } catch {
    return new Response('Video no encontrado', { status: 404 });
  }
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
