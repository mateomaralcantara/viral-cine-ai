import { randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { v7FilmRoot } from '@/lib/v7/storage/film-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILM = 'film-dos-toques-de-bocina-v7';
const CHARACTERS = new Set(['gabriel', 'daniel', 'lucia']);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
type Context = { params: Promise<{ filmId: string; character: string }> };

function isLocal(request: Request) {
  if (process.env.NODE_ENV !== 'development') return false;
  const actual = new URL(request.url);
  const local = ['localhost', '127.0.0.1', '::1'].includes(actual.hostname);
  const origin = request.headers.get('origin');
  return local && (!origin || origin === actual.origin);
}
async function imagePath(context: Context) {
  const { filmId, character } = await context.params;
  if (filmId !== FILM || !CHARACTERS.has(character)) throw new Error('Identidad fuera de este proyecto');
  return path.join(v7FilmRoot(FILM), 'casting', character + '-candidate-v1.png');
}
function validatePng(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 512 || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('La referencia debe ser PNG de 512 bytes a 4 MB.');
  }
  const header = Buffer.from([137,80,78,71,13,10,26,10]);
  if (!buffer.subarray(0,8).equals(header) || buffer.toString('ascii',12,16) !== 'IHDR') {
    throw new Error('Se requiere una imagen PNG real, no un archivo renombrado.');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width < 512 || height < 512 || width > 4096 || height > 4096) {
    throw new Error('Referencia de 512 a 4096 píxeles por lado.');
  }
  return { width, height };
}

export async function HEAD(request: Request, context: Context) {
  if (!isLocal(request)) return new Response(null, { status: 403 });
  try {
    const image = await imagePath(context);
    const info = await stat(image);
    return new Response(null, { status: info.isFile() ? 200 : 404,
      headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response(null, { status: 404 }); }
}
export async function GET(request: Request, context: Context) {
  if (!isLocal(request)) return new Response(null, { status: 403 });
  try {
    const image = await imagePath(context);
    const file = await readFile(image);
    return new Response(file, {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Content-Length': String(file.length),
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
    });
  } catch { return new Response(null, { status: 404 }); }
}
export async function POST(request: Request, context: Context) {
  if (!isLocal(request)) {
    return NextResponse.json({ ok: false, error: 'Solo disponible en estudio local.' }, { status: 403 });
  }
  let tmp: string | undefined;
  try {
    const target = await imagePath(context);
    const data = await request.formData();
    const file = data.get('reference');
    if (!(file instanceof File) || file.size > MAX_IMAGE_BYTES || file.size === 0) {
      return NextResponse.json({ ok: false, error: 'Selecciona una imagen PNG inferior a 4 MB.' },
        { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { width, height } = validatePng(bytes);
    const base = path.dirname(target);
    await mkdir(base, { recursive: true });
    tmp = path.join(base, '.reference-' + randomUUID() + '.png');
    await writeFile(tmp, bytes, { flag: 'wx' });
    // Atomic no-overwrite: even concurrent requests cannot replace a canonical candidate.
    await link(tmp, target);
    await unlink(tmp);
    tmp = undefined;
    return NextResponse.json({
      ok: true, width, height,
      state: 'uploaded-candidate-not-canonical-or-approved',
      externalApiCalls: 0
    }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const conflict = (error as NodeJS.ErrnoException)?.code === 'EEXIST';
    return NextResponse.json({ ok: false, error: conflict
      ? 'Ya hay referencia candidata: no se sobrescribe.'
      : error instanceof Error ? error.message : String(error) }, { status: conflict ? 409 : 400 });
  } finally {
    if (tmp) await unlink(tmp).catch(() => undefined);
  }
}
