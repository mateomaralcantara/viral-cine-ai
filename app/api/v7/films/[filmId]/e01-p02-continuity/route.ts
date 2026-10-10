import { createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';
import { readV7FilmBundle, v7FilmRoot } from '@/lib/v7/storage/film-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILM_ID = 'film-dos-toques-de-bocina-v7';
const SHOT_ID = 'E01-P02';
const SOURCE_FILE = 'E01-P01-veo-candidato.mp4';
const FRAME_FILE = 'continuidad-final-p01.png';
const capture = promisify(execFile);
type Context = { params: Promise<{ filmId: string }> };
type ApprovedP01 = {
  filmId: string; shotId: string; status: string;
  sourceVideoName: string; sourceVideoSha256: string;
};
function directory() { return v7FilmRoot(FILM_ID); }
function sourceDir() { return path.join(directory(), 'e01-p01'); }
function sourceFile() { return path.join(sourceDir(), SOURCE_FILE); }
function targetDir() { return path.join(directory(), 'e01-p02'); }
function targetFile() { return path.join(targetDir(), FRAME_FILE); }

function localOnly(request: Request) {
  if (process.env.NODE_ENV !== 'development') return false;
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  return ['localhost', '127.0.0.1', '::1'].includes(url.hostname) &&
    (!origin || origin === url.origin);
}
function hasAdminToken(request: Request) {
  const secret = process.env.V7_CINEMA_ADMIN_TOKEN || '';
  const bearer = request.headers.get('authorization')?.replace(/^Bearer /i, '') || '';
  if (secret.length < 24 || bearer.length !== secret.length) return false;
  const a = Buffer.from(secret, 'utf8');
  const b = Buffer.from(bearer, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
async function ensureFilm(context: Context) {
  if ((await context.params).filmId !== FILM_ID) throw new Error('Película distinta.');
  const bundle = await readV7FilmBundle(FILM_ID);
  const firstScene = bundle.film.acts
    .flatMap(act => act.sequences.flatMap(seq => seq.scenes))
    .find(scene => scene.id === FILM_ID + '-scene-01');
  const p02 = firstScene?.shots.find(shot => shot.id === FILM_ID + '-scene-01-shot-02');
  if (!p02) throw new Error('E01-P02 no existe en el guion V7.');
  return p02;
}
async function approvedSource() {
  try {
    const approval = JSON.parse(
      await readFile(path.join(sourceDir(), 'artistic-approval.json'), 'utf8')
    ) as ApprovedP01;
    if (approval.filmId !== FILM_ID || approval.shotId !== 'E01-P01' ||
        approval.status !== 'artistic-approved' ||
        approval.sourceVideoName !== SOURCE_FILE ||
        !/^[a-f0-9]{64}$/.test(approval.sourceVideoSha256)) return null;
    const info = await stat(sourceFile());
    if (!info.isFile() || info.size < 10000) return null;
    return approval;
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '')) return null;
    throw error;
  }
}
async function frameExists() {
  try {
    const info = await stat(targetFile());
    return info.isFile() && info.size > 5000;
  } catch { return false; }
}
async function sha256Video() {
  const sha = createHash('sha256');
  for await (const chunk of createReadStream(sourceFile())) sha.update(chunk as Buffer);
  return sha.digest('hex');
}
async function responseBody(context: Context) {
  const shot = await ensureFilm(context);
  const approval = await approvedSource();
  const hasReference = await frameExists();
  return {
    ok: true, filmId: FILM_ID, shotId: SHOT_ID,
    p01ArtisticApproved: Boolean(approval),
    p02ContinuityFrameReady: hasReference,
    referenceUrl: hasReference
      ? '/api/v7/films/' + FILM_ID + '/e01-p02-continuity/reference' : null,
    frameCapturedAtSeconds: 7.0,
    previewStartSeconds: 8, previewEndSeconds: 15,
    canonicalDurationSeconds: shot.durationSeconds,
    canonicalStartSeconds: 172 / 24,
    providerClipIfLaterAuthorizedSeconds: 8,
    status: 'preproduction-only',
    paidCallsAuthorized: 0,
    additionalSpendUsd: 0,
    noNewGeneration: true,
    warnings: [
      'El fotograma de P01 es solo referencia editorial; no se enviará a Google.',
      'Revisar casco y posición de los menores antes de homologar continuidad.',
      'P02 muestra el motor totalmente detenido y a los niños en posición segura.',
      'Para generar P02 hará falta una autorización económica independiente.'
    ]
  };
}
export async function GET(request: Request, context: Context) {
  if (!localOnly(request)) return NextResponse.json({ ok: false }, { status: 403 });
  try { return NextResponse.json(await responseBody(context), {
    headers: { 'Cache-Control': 'private, no-store' }
  }); } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Error de lectura' }, { status: 404 });
  }
}
export async function POST(request: Request, context: Context) {
  if (!localOnly(request) || !hasAdminToken(request)) {
    return NextResponse.json({ ok: false, error: 'Token local u origen inválido' }, { status: 403 });
  }
  try {
    const body = await request.json() as { action?: string };
    if (body.action !== 'prepare-continuity') {
      return NextResponse.json({ ok: false, error: 'Acción no autorizada' }, { status: 400 });
    }
    await ensureFilm(context);
    if (await frameExists()) return NextResponse.json({
      ...(await responseBody(context)), alreadyPrepared: true
    });
    const source = await approvedSource();
    if (!source) {
      return NextResponse.json({ ok: false,
        error: 'E01-P01 debe estar aprobada artísticamente y tener su MP4 original intacto.'
      }, { status: 409 });
    }
    if ((await sha256Video()) !== source.sourceVideoSha256) {
      return NextResponse.json({ ok: false,
        error: 'Huella de P01 no coincide con la aprobación: detener y revisar.'
      }, { status: 409 });
    }
    await mkdir(targetDir(), { recursive: true });
    const lock = await open(path.join(targetDir(), '.continuity.lock'), 'wx').catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error('Preparación ya iniciada en otra pestaña. Actualiza estado.');
      }
      throw error;
    });
    const temp = path.join(targetDir(), '.continuidad-' + process.pid + '-' + Date.now() + '.png');
    try {
      if (await frameExists()) return NextResponse.json(await responseBody(context));
      await capture('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
        '-ss', '7.000', '-i', sourceFile(), '-an',
        '-frames:v', '1', '-f', 'image2', '-vcodec', 'png',
        temp
      ], { timeout: 30000, maxBuffer: 1024 * 1024 });
      const info = await stat(temp);
      if (info.size < 5000 || info.size > 10000000) throw new Error('Fotograma generado inválido.');
      // Atomic no-overwrite promotion: never replace an existing continuity frame.
      const { link } = await import('node:fs/promises');
      await link(temp, targetFile());
    } finally {
      await unlink(temp).catch(() => undefined);
      await lock.close();
      await unlink(path.join(targetDir(), '.continuity.lock')).catch(() => undefined);
    }
    return NextResponse.json({ ...(await responseBody(context)),
      madePaidCalls: 0, sourceVideoUntouched: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false,
      error: message.includes('ffmpeg') ? 'No se pudo extraer el fotograma con FFmpeg.' : message.slice(0, 200)
    }, { status: 409 });
  }
}
