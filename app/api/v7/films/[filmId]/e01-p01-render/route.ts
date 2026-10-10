import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';
import { readV7FilmBundle, v7FilmRoot } from '@/lib/v7/storage/film-store';
import {
  DOS_TOQUES_FIRST_SHOT_BUDGET as GRANT,
  firstShotQuotedUsd,
  maySubmitFirstShot
} from '@/lib/v7/production/dos-toques-p01-budget';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILM_ID = 'film-dos-toques-de-bocina-v7';
const MODEL = 'veo-3.1-fast-generate-preview';
const RATE = 0.10;
const SHOT_ID = 'E01-P01';
const FILE = 'E01-P01-veo-candidato.mp4';
const REQUIRED_COMPOSITION = 'gabriel-daniel-lucia-on-motorcycle-v2';
const ffprobe = promisify(execFile);

type Context = { params: Promise<{ filmId: string }> };
type ShotStatus = 'reserved' | 'submitted' | 'processing' | 'review-required' | 'failed-unknown';
type ShotRecord = {
  filmId: string;
  shotId: typeof SHOT_ID;
  model: typeof MODEL;
  status: ShotStatus;
  providerSeconds: number;
  maximumApprovedUsd: number;
  estimatedUsd: number;
  referenceSha256: string; // Legacy audit field; in text-to-video it reads 'NO_IMAGE_INPUT'.
  promptSha256?: string;
  createdAt: string;
  updatedAt: string;
  providerOperationName?: string;
  error?: string;
  candidateName?: string;
};

function root() { return path.join(v7FilmRoot(FILM_ID), 'e01-p01'); }
function recordPath() { return path.join(root(), 'provider-operation.json'); }
function videoPath() { return path.join(root(), FILE); }

function requestAllowed(request: Request) {
  if (process.env.NODE_ENV !== 'development') return false;
  const url = new URL(request.url);
  return ['localhost', '127.0.0.1', '::1'].includes(url.hostname) &&
    (!request.headers.get('origin') || request.headers.get('origin') === url.origin);
}

function authorized(request: Request) {
  const stored = process.env.V7_CINEMA_ADMIN_TOKEN || '';
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /i, '') || '';
  if (stored.length < 24 || supplied.length !== stored.length) return false;
  const a = Buffer.from(stored, 'utf8');
  const b = Buffer.from(supplied, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function flagsEnabled() {
  // ONLY this named film/shot is enabled; global ViralCine paid routes stay off.
  return process.env.PRODUCTION_MODE === 'real' &&
    process.env.V7_DOS_TOQUES_P01_PAID_ENABLED === 'true' &&
    process.env.V7_CINEMA_PAID_ENABLED !== 'true' &&
    process.env.ALLOW_PAID_GENERATION !== 'true' &&
    process.env.ALLOW_EXTERNAL_API_CALLS !== 'true';
}

function redactError(error: unknown) {
  return String(error instanceof Error ? error.message : error)
    .replace(/AIza[A-Za-z0-9_-]+/g, '[REDACTED_GOOGLE_KEY]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .slice(0, 700);
}

async function ensureFilm(context: Context) {
  const { filmId } = await context.params;
  if (filmId !== FILM_ID) throw new Error('Película fuera de autorización');
  const bundle = await readV7FilmBundle(FILM_ID);
  if (bundle.film.id !== FILM_ID) throw new Error('Bundle de película no encontrado');
  return bundle;
}

async function getRecord(): Promise<ShotRecord | null> {
  try {
    const record = JSON.parse(await readFile(recordPath(), 'utf8')) as ShotRecord;
    if (record.filmId !== FILM_ID || record.shotId !== SHOT_ID ||
        record.model !== MODEL || record.estimatedUsd !== 0.8 ||
        record.maximumApprovedUsd !== 2) {
      throw new Error('Registro pagado inesperado; detener y auditar');
    }
    return record;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function persistRecord(record: ShotRecord) {
  const temporary = recordPath() + '.' + randomUUID() + '.tmp';
  record.updatedAt = new Date().toISOString();
  await writeFile(temporary, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  try { await rename(temporary, recordPath()); }
  catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
}

async function withLock<T>(task: () => Promise<T>) {
  await mkdir(root(), { recursive: true });
  const lockName = path.join(root(), '.paid-shot-lock');
  const lock = await open(lockName, 'wx').catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('Otra acción de E01-P01 está activa. No se repetirá la solicitud.');
    }
    throw error;
  });
  try { return await task(); }
  finally { await lock.close(); await unlink(lockName).catch(() => undefined); }
}

function promptSha256() {
  return createHash('sha256').update(prompt()).digest('hex');
}

function client() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.length < 12) throw new Error('Configura GEMINI_API_KEY en tu entorno local');
  return new GoogleGenAI({ apiKey: key });
}

function prompt() {
  return [
    'Single continuous 8-second cinematic realistic TEXT-TO-VIDEO shot; 16:9 720p.',
    'Generate this as TEXT-TO-VIDEO; there is no uploaded first-frame image.',
    'Outside a fictional Dominican neighborhood school at golden dawn.',
    'A Dominican father Gabriel Santos, 39 years old, faded blue work shirt,',
    'matte black safety helmet, rides his old dark-blue commuter motorcycle',
    'with a patched black-tape seat very slowly toward the entrance of',
    'a modest fictional school. BOTH of his children are CLEARLY VISIBLE:',
    'Daniel Santos (11-year-old boy, short curly hair, school uniform, well-fitted',
    'protective helmet) seated securely behind his father, and Lucía Santos',
    '(7-year-old girl, two braids, school uniform, well-fitted light blue',
    'protective helmet), also clearly visible in a safely composited',
    'cinematic riding arrangement. The three characters keep the same',
    'apparent ages, clothes and helmets across all frames. No additional riders.',
    'Three human beings and one intact motorcycle throughout. The bike travels',
    'at walking pace on a quiet controlled street, approaching school then',
    'braking gently. Film as a safely staged cinematic composite, not real',
    'unsafe child transport. No child without a helmet.',
    'Golden Caribbean dawn, natural neighborhood traffic in the distance,',
    'birds and restrained motorcycle ambience, very subtle expressive piano',
    'to be mixed after generation. Slow smooth wide lateral tracking,',
    '35mm lens, realistic wheel motion and perspective, no cuts.',
    'No dialogue, no lipsync, no names on screen, no overlays, no posters,',
    'no title cards, no invented signs or logos, no duplicated limbs,',
    'no identity or clothing swaps, no frame-to-frame motorcycle morphing.'
  ].join(' ');
}

function envRateMatches() {
  const rate = Number(process.env.V7_VEO_USD_PER_SECOND || 0);
  return Number.isFinite(rate) && rate === RATE;
}

function envCapEnough() {
  const cap = Number(process.env.V7_CINEMA_MAX_USD || 0);
  return Number.isFinite(cap) && cap >= firstShotQuotedUsd(RATE) &&
    cap <= GRANT.maxTotalUsd;
}

function clearResult(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

async function statusBody(context: Context) {
  await ensureFilm(context);
  const record = await getRecord();
  const approvedPromptSha256 = promptSha256();
  return {
    ok: true, filmId: FILM_ID, shotId: SHOT_ID,
    maximumApprovedUsd: GRANT.maxTotalUsd,
    estimatedUsd: firstShotQuotedUsd(RATE),
    maxProviderSubmissions: GRANT.maxProviderSubmissions,
    automaticRetries: GRANT.automaticRetries,
    providerMode: 'text-to-video',
    imageReferenceNotSentToGoogle: true,
    referenceReady: true, // No source image required in Veo text-to-video.
    referenceSha256: null,
    promptSha256: approvedPromptSha256,
    childCharactersPresentInPrompt: true,
    identityAccuracyNeedsHumanReview: true,
    flagsEnabled: flagsEnabled(),
    rateVerifiedInEnv: envRateMatches(),
    capVerifiedInEnv: envCapEnough(),
    credentialConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length >= 12),
    adminTokenConfigured: Boolean(process.env.V7_CINEMA_ADMIN_TOKEN &&
      process.env.V7_CINEMA_ADMIN_TOKEN.length >= 24),
    recordStatus: record?.status ?? 'not-started',
    providerOperationKnown: Boolean(record?.providerOperationName),
    hasSubmittedOrReserved: record !== null,
    videoReady: record?.status === 'review-required',
    videoUrl: record?.status === 'review-required'
      ? '/api/v7/films/' + encodeURIComponent(FILM_ID) + '/e01-p01-render/video' : null,
    error: record?.error || null,
    canSubmitAfterUserClick: record === null && flagsEnabled() &&
      envRateMatches() && envCapEnough() && Boolean(process.env.GEMINI_API_KEY) &&
      Boolean(process.env.V7_CINEMA_ADMIN_TOKEN)
  };
}

export async function GET(request: Request, context: Context) {
  if (!requestAllowed(request)) return clearResult(403, 'Acceso permitido solo en localhost durante el desarrollo.');
  try { return NextResponse.json(await statusBody(context), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { return clearResult(404, redactError(error)); }
}

export async function POST(request: Request, context: Context) {
  if (!requestAllowed(request) || !authorized(request)) return clearResult(403, 'Token administrativo u origen inválido.');
  let body: { action?: string; promptSha256?: string; approvedEstimateUsd?: number; confirm?: boolean; compositionConfirmed?: string };
  try { body = await request.json() as typeof body; }
  catch { return clearResult(400, 'Solicitud JSON inválida.'); }
  if (body.action !== 'submit' && body.action !== 'resume') return clearResult(400, 'Solo submit o resume.');
  try {
    await ensureFilm(context);
    return await withLock(async () => {
      const existing = await getRecord();
      if (body.action === 'resume') {
        if (!existing) throw new Error('No hay operación que consultar.');
        if (existing.status === 'review-required') return NextResponse.json({
          ok: true, status: existing.status, alreadyDownloaded: true
        });
        if (!existing.providerOperationName) {
          throw new Error('La operación pudo cobrarse, pero no se registró ID del proveedor. Prohibido reintentar.');
        }
        const ai = client();
        const operation = await ai.operations.getVideosOperation({
          operation: { name: existing.providerOperationName } as
            Parameters<typeof ai.operations.getVideosOperation>[0]['operation']
        });
        if (!operation.done) {
          existing.status = 'processing';
          await persistRecord(existing);
          return NextResponse.json({ ok: true, status: 'processing', providerOperationKnown: true });
        }
        const video = operation.response?.generatedVideos?.[0]?.video;
        if (!video) {
          existing.status = 'failed-unknown';
          existing.error = 'Operación terminada sin video. Reconciliar el costo antes de decidir algo más.';
          await persistRecord(existing);
          return NextResponse.json({ ok: true, status: existing.status, error: existing.error });
        }
        const target = videoPath();
        try { await stat(target); }
        catch {
          const temp = path.join(root(), '.' + randomUUID() + '-veo-candidate.mp4');
          await ai.files.download({ file: video, downloadPath: temp });
          try {
            const info = await stat(temp);
            if (info.size < 10000) throw new Error('Video descargado demasiado pequeño.');
            const { stdout } = await ffprobe('ffprobe',
              ['-v','error','-show_entries','format=duration:stream=codec_type,codec_name',
                '-of','json',temp], { maxBuffer: 1024 * 1024 });
            const parsed = JSON.parse(stdout) as {
              format?: { duration?: string };
              streams?: Array<{codec_type?: string;codec_name?: string}>;
            };
            const length = Number(parsed.format?.duration ?? 0);
            if (!(length >= 7.7 && length <= 8.3) ||
                !parsed.streams?.some(stream => stream.codec_type === 'video')) {
              throw new Error('El clip no tiene duración válida de aproximadamente ocho segundos.');
            }
            const { link } = await import('node:fs/promises');
            await link(temp, target);
          } finally { await unlink(temp).catch(() => undefined); }
        }
        existing.status = 'review-required';
        existing.candidateName = FILE;
        existing.error = undefined;
        await persistRecord(existing);
        return NextResponse.json({
          ok: true, status: 'review-required', videoReady: true,
          videoUrl: '/api/v7/films/' + encodeURIComponent(FILM_ID) + '/e01-p01-render/video'
        });
      }

      // ONE text-to-video attempt (allows children); save reservation BEFORE external call.
      if (existing) throw new Error('Esta toma ya tiene una reserva/operación. No se permite otro intento.');
      if (!flagsEnabled()) throw new Error('Generación pagada desactivada en el servidor.');
      if (!envRateMatches()) throw new Error('Tarifa diferente a US$0.10/s; detén la solicitud.');
      if (!envCapEnough()) throw new Error('Configura V7_CINEMA_MAX_USD entre 0.80 y 2.00.');
      const sha = promptSha256();
      if (body.confirm !== true || body.compositionConfirmed !== REQUIRED_COMPOSITION || body.promptSha256 !== sha ||
          body.approvedEstimateUsd !== firstShotQuotedUsd(RATE)) {
        throw new Error('Debes confirmar la referencia vigente y exactamente US$0.80 estimados.');
      }
      if (!maySubmitFirstShot({
        shotId: SHOT_ID, model: MODEL, rateUsdPerSecond: RATE,
        providerSubmissions: 0, referenceReady: true, alreadyReserved: false,
        localCapUsd: Number(process.env.V7_CINEMA_MAX_USD)
      })) throw new Error('Reglas de autorización por toma no cumplidas.');

      const now = new Date().toISOString();
      const record: ShotRecord = {
        filmId: FILM_ID, shotId: SHOT_ID, model: MODEL,
        status: 'reserved', providerSeconds: 8,
        maximumApprovedUsd: 2, estimatedUsd: 0.8,
        referenceSha256: 'NO_IMAGE_INPUT', promptSha256: sha, createdAt: now, updatedAt: now
      };
      await writeFile(recordPath(), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
      // From this point onward a timeout may mean the provider accepted a paid request.
      try {
        const ai = client();
        const operation = await ai.models.generateVideos({
          model: MODEL,
          source: { prompt: prompt() }, 
          config: {
            aspectRatio: '16:9', numberOfVideos: 1,
            durationSeconds: 8, resolution: '720p',
            personGeneration: 'allow_all'
          }
        });
        if (!operation.name) throw new Error('Veo no devolvió ID de operación. Posible costo incierto.');
        record.providerOperationName = operation.name;
        record.status = 'submitted';
        await persistRecord(record);
        return NextResponse.json({
          ok: true, status: 'submitted', operationKnown: true,
          estimatedUsd: record.estimatedUsd, maxAuthorizedUsd: 2,
          nextAction: 'resume'
        });
      } catch (error) {
        record.status = 'failed-unknown';
        record.error = redactError(error);
        await persistRecord(record);
        throw new Error('Solicitud incierta, no reintentar. ' + record.error);
      }
    });
  } catch (error) {
    return clearResult(409, redactError(error));
  }
}
