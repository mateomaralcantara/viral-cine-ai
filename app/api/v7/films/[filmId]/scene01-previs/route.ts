import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { link, mkdir, open, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';
import { readV7FilmBundle, v7FilmRoot } from '@/lib/v7/storage/film-store';
import {
  createFileByteRangeStream,
  parseVideoByteRange
} from '@/lib/v7/media/file-byte-range-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILM_ID = 'film-dos-toques-de-bocina-v7';
const E01_PREVIS = 'E01-LA-SENAL-PREVIS-50S.mp4';
const MAX_VIDEO_BYTES = 35 * 1024 * 1024;
const ffprobe = promisify(execFile);
type Context = { params: Promise<{ filmId: string }> };

function isLocalStudio(request: Request) {
  if (process.env.NODE_ENV !== 'development') return false;
  const target = new URL(request.url);
  if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname)) return false;
  const origin = request.headers.get('origin');
  return !origin || origin === target.origin;
}

async function previewPath(context: Context) {
  const { filmId } = await context.params;
  if (filmId !== FILM_ID) throw new Error('La previsualización pertenece a otra película.');
  const bundle = await readV7FilmBundle(FILM_ID);
  if (bundle.film.id !== FILM_ID) throw new Error('Película no disponible.');
  return path.join(v7FilmRoot(FILM_ID), 'previsualizacion', E01_PREVIS);
}

function headersForVideo(size: number) {
  return {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline; filename="' + E01_PREVIS + '"',
    'Content-Length': String(size)
  };
}

export async function HEAD(request: Request, context: Context) {
  if (!isLocalStudio(request)) return new Response(null, { status: 403 });
  try {
    const file = await previewPath(context);
    const info = await stat(file);
    if (!info.isFile()) return new Response(null, { status: 404 });
    return new Response(null, { status: 200, headers: headersForVideo(info.size) });
  } catch {
    return new Response(null, { status: 404 });
  }
}

export async function GET(request: Request, context: Context) {
  if (!isLocalStudio(request)) return new Response(null, { status: 403 });
  try {
    const file = await previewPath(context);
    const info = await stat(file);
    if (!info.isFile() || info.size < 100000) return new Response(null, { status: 404 });

    const headers: Record<string, string> = headersForVideo(info.size);
    const range = request.headers.get('range');
    const parsed = range === null ? null : parseVideoByteRange(range, info.size);
    if (range !== null && !parsed) {
      return new Response(null, {
        status: 416,
        headers: { ...headers, 'Content-Range': 'bytes */' + info.size }
      });
    }
    const start = parsed?.start ?? 0;
    const end = parsed?.end ?? info.size - 1;
    headers['Content-Length'] = String(end - start + 1);
    if (parsed) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + info.size;
    const handle = await open(file, 'r');
    return new Response(createFileByteRangeStream(handle, start, end), {
      status: parsed ? 206 : 200, headers
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}

export async function POST(request: Request, context: Context) {
  // This is a local preview-import operation, NOT final-scene approval.
  if (!isLocalStudio(request)) {
    return NextResponse.json({ ok: false, error: 'Importación restringida a estudio local.' },
      { status: 403 });
  }
  let temporary: string | undefined;
  try {
    const target = await previewPath(context);
    const data = await request.formData();
    const uploaded = data.get('file');
    if (!(uploaded instanceof File) || !/\.mp4$/i.test(uploaded.name) ||
        uploaded.size < 100000 || uploaded.size > MAX_VIDEO_BYTES) {
      return NextResponse.json({ ok: false,
        error: 'Selecciona un MP4 de la previsualización de E01, máximo 35 MB.' },
        { status: 400 });
    }
    const bytes = Buffer.from(await uploaded.arrayBuffer());
    if (bytes.toString('ascii', 4, 8) !== 'ftyp') {
      return NextResponse.json({ ok: false, error: 'El archivo no contiene cabecera MP4 válida.' },
        { status: 400 });
    }

    await mkdir(path.dirname(target), { recursive: true });
    temporary = path.join(path.dirname(target), '.E01-previs-' + randomUUID() + '.mp4');
    await writeFile(temporary, bytes, { flag: 'wx' });

    const { stdout } = await ffprobe('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name',
      '-of', 'json', temporary
    ], { maxBuffer: 1024 * 1024 });
    const probe = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type?: string; codec_name?: string }>
    };
    const duration = Number(probe.format?.duration ?? 0);
    const videos = (probe.streams ?? []).filter(s => s.codec_type === 'video');
    const audios = (probe.streams ?? []).filter(s => s.codec_type === 'audio');
    if (Math.abs(duration - 50) > 0.15 || videos.length !== 1 ||
        videos[0].codec_name !== 'h264' || audios.length < 1 ||
        !audios.some(s => s.codec_name === 'aac')) {
      throw new Error('El piloto requiere exactamente 50 s, video H.264 y audio AAC.');
    }

    // Atomic no-overwrite, including concurrent imports.
    await link(temporary, target);
    await unlink(temporary);
    temporary = undefined;
    return NextResponse.json({
      ok: true,
      filmId: FILM_ID,
      sceneId: 'E01',
      durationSeconds: duration,
      status: 'previsualizacion-importada-no-es-video-final',
      providerCalls: 0,
      paidGeneration: false
    }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const conflict = (error as NodeJS.ErrnoException).code === 'EEXIST';
    return NextResponse.json({ ok: false,
      error: conflict
        ? 'Ya existe una previsualización de E01; no se sobrescribirá.'
        : error instanceof Error ? error.message : String(error)
    }, { status: conflict ? 409 : 400 });
  } finally {
    if (temporary) await unlink(temporary).catch(() => undefined);
  }
}
