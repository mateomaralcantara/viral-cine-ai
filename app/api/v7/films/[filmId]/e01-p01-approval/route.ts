import { createHash, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';
import { readV7FilmBundle, v7FilmRoot } from '@/lib/v7/storage/film-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILM_ID = 'film-dos-toques-de-bocina-v7';
const SHOT_ID = 'E01-P01';
const FILE = 'E01-P01-veo-candidato.mp4';
const runFfprobe = promisify(execFile);
type Context = { params: Promise<{ filmId: string }> };

type CandidateRecord = {
  filmId: string; shotId: string; status: string;
  candidateName?: string; providerOperationName?: string;
};
type ArtApproval = {
  schemaVersion: 1;
  filmId: typeof FILM_ID;
  shotId: typeof SHOT_ID;
  status: 'artistic-approved';
  approvedAt: string;
  sourceVideoName: typeof FILE;
  sourceVideoSha256: string;
  videoSeconds: number;
  videoBytes: number;
  providerOperationName: string;
  productionNotes: string;
  technicalQaStatus: 'pending';
  continuityQaStatus: 'pending';
  editingStatus: 'pending';
  externalApiCalls: 0;
  additionalSpendUsd: 0;
};
function filmDir() { return path.join(v7FilmRoot(FILM_ID), 'e01-p01'); }
function approvalPath() { return path.join(filmDir(), 'artistic-approval.json'); }
function candidatePath() { return path.join(filmDir(), FILE); }
function errorResult(code: number, detail: string) {
  return NextResponse.json({ ok: false, error: detail }, { status: code,
    headers: { 'Cache-Control': 'private, no-store' } });
}
function isLocal(request: Request) {
  if (process.env.NODE_ENV !== 'development') return false;
  const url = new URL(request.url);
  const host = url.hostname;
  const origin = request.headers.get('origin');
  return ['localhost', '127.0.0.1', '::1'].includes(host) &&
    (!origin || origin === url.origin);
}
function authorized(request: Request) {
  const secret = process.env.V7_CINEMA_ADMIN_TOKEN || '';
  const bearer = request.headers.get('authorization')?.replace(/^Bearer /i, '') || '';
  if (secret.length < 24 || secret.length !== bearer.length) return false;
  const a = Buffer.from(secret, 'utf8');
  const b = Buffer.from(bearer, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
async function ensureFilm(context: Context) {
  if ((await context.params).filmId !== FILM_ID) {
    throw new Error('Este control corresponde solamente a DOS TOQUES DE BOCINA.');
  }
  const bundle = await readV7FilmBundle(FILM_ID);
  if (bundle.film.id !== FILM_ID) throw new Error('Película distinta.');
}
async function loadApproval(): Promise<ArtApproval | null> {
  try {
    const parsed = JSON.parse(await readFile(approvalPath(), 'utf8')) as ArtApproval;
    if (parsed.filmId !== FILM_ID || parsed.shotId !== SHOT_ID ||
        parsed.status !== 'artistic-approved' || parsed.sourceVideoName !== FILE ||
        !/^[a-f0-9]{64}$/.test(parsed.sourceVideoSha256)) {
      throw new Error('El registro de aprobación requiere revisión manual.');
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
async function loadCandidate() {
  const record = JSON.parse(await readFile(
    path.join(filmDir(), 'provider-operation.json'), 'utf8')) as CandidateRecord;
  if (record.filmId !== FILM_ID || record.shotId !== SHOT_ID ||
      record.status !== 'review-required' || !record.providerOperationName ||
      record.candidateName !== FILE) {
    throw new Error('No se puede aprobar un video que aún no esté recuperado para revisión.');
  }
  const info = await stat(candidatePath());
  if (!info.isFile() || info.size < 10000) {
    throw new Error('El MP4 candidato no está disponible.');
  }
  return { record, info };
}
async function sha256File() {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(candidatePath())) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}
export async function GET(request: Request, context: Context) {
  if (!isLocal(request)) return errorResult(403, 'Acceso solo desde el estudio local.');
  try {
    await ensureFilm(context);
    const saved = await loadApproval();
    return NextResponse.json({
      ok: true, filmId: FILM_ID, shotId: SHOT_ID,
      artisticApproved: Boolean(saved),
      approval: saved,
      finalVideoApproved: false,
      paidSubmissionRequired: false
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return errorResult(404, 'Película o registro de aprobación no disponible.');
  }
}
export async function POST(request: Request, context: Context) {
  if (!isLocal(request) || !authorized(request)) {
    return errorResult(403, 'Token administrativo local u origen inválido.');
  }
  let body: { action?: unknown; confirmWatched?: unknown; confirmArtistic?: unknown; notes?: unknown };
  try { body = await request.json() as typeof body; }
  catch { return errorResult(400, 'JSON de aprobación inválido.'); }
  if (body.action !== 'approve-artistic' ||
      body.confirmWatched !== true || body.confirmArtistic !== true) {
    return errorResult(400, 'Debes ver la toma completa y confirmar la aprobación artística.');
  }
  if (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.length > 1000)) {
    return errorResult(400, 'Observaciones inválidas: máximo 1000 caracteres.');
  }
  try {
    await ensureFilm(context);
    const existing = await loadApproval();
    if (existing) return NextResponse.json({
      ok: true, status: 'artistic-approved',
      alreadyApproved: true, approval: existing,
      externalApiCalls: 0, additionalSpendUsd: 0
    });
    const { record, info } = await loadCandidate();
    const { stdout } = await runFfprobe('ffprobe', [
      '-v', 'error', '-show_entries',
      'format=duration:stream=codec_type,codec_name',
      '-of', 'json', candidatePath()
    ], { maxBuffer: 1024 * 1024 });
    const probe = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type?: string; codec_name?: string }>;
    };
    const videoSeconds = Number(probe.format?.duration || 0);
    if (!Number.isFinite(videoSeconds) || videoSeconds < 7.7 ||
        videoSeconds > 8.3 || !probe.streams?.some(s => s.codec_type === 'video')) {
      return errorResult(422, 'El clip no cumple 8 s aproximados o carece de video válido.');
    }
    const hash = await sha256File();
    const now = new Date().toISOString();
    const approval: ArtApproval = {
      schemaVersion: 1, filmId: FILM_ID, shotId: SHOT_ID,
      status: 'artistic-approved', approvedAt: now,
      sourceVideoName: FILE, sourceVideoSha256: hash,
      videoSeconds, videoBytes: info.size,
      providerOperationName: record.providerOperationName!,
      productionNotes: typeof body.notes === 'string' ? body.notes.trim() : '',
      technicalQaStatus: 'pending',
      continuityQaStatus: 'pending',
      editingStatus: 'pending',
      externalApiCalls: 0, additionalSpendUsd: 0
    };
    // Atomic first approval; provider-operation.json and original MP4 stay untouched.
    await mkdir(filmDir(), { recursive: true });
    const handle = await open(approvalPath(), 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(approval, null, 2) + '\n', 'utf8'); }
    finally { await handle.close(); }
    return NextResponse.json({ ok: true, status: 'artistic-approved',
      approval, externalApiCalls: 0, additionalSpendUsd: 0,
      originalVideoPreserved: true }, { status: 201 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return errorResult(409, 'Otro proceso ya registró esta aprobación. Actualiza estado.');
    }
    const message = error instanceof Error ? error.message : 'No se pudo registrar la aprobación.';
    // Never echo filesystem paths, secrets or raw provider errors.
    return errorResult(409, message.includes('No se puede aprobar') || message.includes('MP4 candidato')
      ? message : 'No se pudo validar el MP4 local; comprueba el estado y ffprobe.');
  }
}
