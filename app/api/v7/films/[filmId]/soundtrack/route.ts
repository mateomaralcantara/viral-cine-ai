import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';
import { v7FilmRoot } from '@/lib/v7/storage/film-store';
import { createFileByteRangeStream, parseVideoByteRange } from '@/lib/v7/media/file-byte-range-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILM_ID = 'film-dos-toques-de-bocina-v7';
const AUDIO_NAME = 'DOS-TOQUES-BANDA-SONORA-10MIN-V1.mp3';
const MAX_UPLOAD = 20 * 1024 * 1024;
const ffprobe = promisify(execFile);
type Context = { params: Promise<{ filmId: string }> };

async function musicPath(context: Context) {
  const { filmId } = await context.params;
  if (filmId !== FILM_ID) throw new Error('El recurso no pertenece a esta película.');
  return path.join(v7FilmRoot(FILM_ID), 'soundtrack', AUDIO_NAME);
}

function allowedLocalRequest(request: Request) {
  const host = new URL(request.url).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) return false;
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

export async function HEAD(request: Request, context: Context) {
  try {
    const file = await musicPath(context);
    const info = await stat(file);
    return new Response(null, {
      status: info.isFile() ? 200 : 404,
      headers: info.isFile() ? {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(info.size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-store'
      } : {}
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}

export async function GET(request: Request, context: Context) {
  try {
    const file = await musicPath(context);
    const info = await stat(file);
    if (!info.isFile()) return new Response(null, { status: 404 });
    const headers: Record<string, string> = {
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Content-Disposition': 'inline; filename="' + AUDIO_NAME + '"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    };
    const range = request.headers.get('range');
    const parsed = range === null ? null : parseVideoByteRange(range, info.size);
    if (range !== null && !parsed) return new Response(null, {
      status: 416, headers: { ...headers, 'Content-Range': 'bytes */' + info.size }
    });
    const start = parsed?.start ?? 0;
    const end = parsed?.end ?? info.size - 1;
    headers['Content-Length'] = String(end - start + 1);
    if (parsed) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + info.size;
    const handle = await open(file, 'r');
    return new Response(createFileByteRangeStream(handle, start, end),
      { status: parsed ? 206 : 200, headers });
  } catch {
    return new Response(null, { status: 404 });
  }
}

export async function POST(request: Request, context: Context) {
  // Local development import: production/serverless writes are not authenticated.
  if (process.env.NODE_ENV !== 'development' || !allowedLocalRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Solo se permite importar música en estudio local.' },
      { status: 403 });
  }
  let tempFile: string | undefined;
  try {
    const target = await musicPath(context);
    const data = await request.formData();
    const uploaded = data.get('file');
    if (!(uploaded instanceof File) || uploaded.size < 100000 ||
        uploaded.size > MAX_UPLOAD || !/\.mp3$/i.test(uploaded.name)) {
      return NextResponse.json({
        ok: false, error: 'Selecciona un MP3 válido de máximo 20 MB y diez minutos.'
      }, { status: 400 });
    }
    try {
      const existing = await stat(target);
      if (existing.isFile()) {
        return NextResponse.json({ ok: false, error: 'La banda sonora ya fue importada. No se sobrescribe.' },
          { status: 409 });
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }

    const { mkdir } = await import('node:fs/promises');
    await mkdir(path.dirname(target), { recursive: true });
    tempFile = path.join(path.dirname(target), '.score-import-' + randomUUID() + '.mp3');
    await writeFile(tempFile, Buffer.from(await uploaded.arrayBuffer()), { flag: 'wx' });
    const { stdout } = await ffprobe('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name',
      '-of', 'json', tempFile
    ], { maxBuffer: 1024 * 1024 });
    const probe = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type?: string; codec_name?: string }>
    };
    const duration = Number(probe.format?.duration ?? 0);
    if (Math.abs(duration - 600) > 1 ||
        !probe.streams?.some((stream) => stream.codec_type === 'audio' && stream.codec_name === 'mp3') ||
        probe.streams.some((stream) => stream.codec_type === 'video')) {
      throw new Error('La banda sonora debe ser MP3, solo audio, de 600 segundos.');
    }
    // No overwrite, even if two requests race for the same film.
    // fs.link creates the final file exclusively, leaving a temp for cleanup.
    const { link } = await import('node:fs/promises');
    await link(tempFile, target);
    await unlink(tempFile);
    tempFile = undefined;
    return NextResponse.json({
      ok: true, status: 'imported-pending-editorial-approval',
      durationSeconds: duration, paidApiCalls: 0, musicUrl: request.url
    }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg.slice(0, 600) },
      { status: (e as NodeJS.ErrnoException).code === 'EEXIST' ? 409 : 400 });
  } finally {
    if (tempFile) await unlink(tempFile).catch(() => undefined);
  }
}
