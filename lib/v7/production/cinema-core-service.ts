import { createHash, timingSafeEqual } from 'node:crypto';
import { open, readFile, readdir, mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { readV7FilmBundle, v7FilmRoot } from '@/lib/v7/storage/film-store';
import {
  canSubmitCinema, cinemaExposure, estimateVeoUsd, veoSeconds,
  type CinemaRecord
} from './cinema-core-policy';

const MODEL = 'veo-3.1-fast-generate-preview';
const PROJECT_PREFIX = 'produccion-libroseller-50s-';
const ID_PATTERN = /^LS0[1-7]$/;

type ProductionShot = {
  id: string;
  seconds: number;
  title: string;
  prompt: string;
  voice: string;
  source: 'WEB' | 'V6';
};
type ProductionManifest = {
  filmId: string;
  durationSeconds: number;
  shots: ProductionShot[];
};
type PackageInfo = { root: string; manifest: ProductionManifest };
type CinemaApproval = {
  action: 'submit' | 'resume';
  shotId: string;
  referenceSha256?: string;
  approvedEstimateUsd?: number;
  confirm?: boolean;
};

function stripError(error: unknown) {
  return String(error instanceof Error ? error.message : error)
    .replace(/AIza[A-Za-z0-9_-]+/g, '[GOOGLE_KEY]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .slice(0, 900);
}

function workRoot(filmId: string) {
  return path.join(v7FilmRoot(filmId), 'cinema-core');
}
function recordPath(filmId: string, shotId: string) {
  if (!ID_PATTERN.test(shotId)) throw new Error('ID de toma no permitido');
  return path.join(workRoot(filmId), shotId + '.json');
}
function videoPath(filmId: string, shotId: string) {
  if (!ID_PATTERN.test(shotId)) throw new Error('ID de toma no permitido');
  return path.join(workRoot(filmId), shotId + '-veo-candidato.mp4');
}

async function loadPackage(filmId: string): Promise<PackageInfo> {
  const filmRoot = v7FilmRoot(filmId);
  const entries = await readdir(filmRoot, { withFileTypes: true });
  const folders = entries.filter((entry) =>
    entry.isDirectory() && entry.name.startsWith(PROJECT_PREFIX)
  ).map((entry) => entry.name).sort().reverse();

  for (const folder of folders) {
    const root = path.join(filmRoot, folder);
    try {
      const parsed = JSON.parse(await readFile(path.join(root, 'PRODUCCION-50S.json'), 'utf8')) as ProductionManifest;
      if (parsed.filmId !== filmId || parsed.durationSeconds !== 50 ||
          !Array.isArray(parsed.shots) || parsed.shots.length !== 7) continue;
      if (parsed.shots.some((s) =>
        !ID_PATTERN.test(s.id) || typeof s.prompt !== 'string' ||
        !Number.isFinite(s.seconds) || s.seconds <= 0 || s.seconds > 8
      )) continue;
      return { root, manifest: parsed };
    } catch {
      // A broken or incomplete package must not prevent reading an older valid package.
    }
  }
  throw new Error('Paquete Libroseller de siete tomas no disponible en el disco V7');
}

async function loadRecords(filmId: string): Promise<CinemaRecord[]> {
  const root = workRoot(filmId);
  let names: string[] = [];
  try { names = await readdir(root); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const output: CinemaRecord[] = [];
  for (const name of names) {
    if (!/^LS0[1-7]\.json$/.test(name)) continue;
    try {
      const row = JSON.parse(await readFile(path.join(root, name), 'utf8')) as CinemaRecord;
      if (row.filmId === filmId && ID_PATTERN.test(row.shotId) &&
          Number.isFinite(row.estimatedUsd) && row.estimatedUsd >= 0) {
        output.push(row);
      }
    } catch {
      // Invalid records are never silently overwritten.
      throw new Error('Registro de producción corrupto: ' + name + '. Intervención manual necesaria.');
    }
  }
  return output;
}

function configuredRate() {
  const value = Number(process.env.V7_VEO_USD_PER_SECOND || 0);
  return Number.isFinite(value) && value > 0 && value <= 10 ? value : null;
}
function configuredCap() {
  const value = Number(process.env.V7_CINEMA_MAX_USD || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

async function referenceFile(packageInfo: PackageInfo, shotId: string) {
  // UI reference: show a real public-site capture for WEB shots, never a fabricated screen.
  const candidate = path.join(packageInfo.root, 'referencias',
    shotId === 'LS02' || shotId === 'LS05'
      ? 'LIBROSELLER-WEB-PUBLICA.png'
      : shotId + '-referencia.jpg');
  const info = await stat(candidate);
  if (!info.isFile() || info.size < 10000) throw new Error('Referencia JPEG inválida');
  return candidate;
}

function authToken(request: Request) {
  const configured = process.env.V7_CINEMA_ADMIN_TOKEN || '';
  if (configured.length < 24) return false;
  const actual = request.headers.get('authorization')?.replace(/^Bearer /i, '') || '';
  const a = Buffer.from(configured, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function assertCinemaWriteAccess(request: Request) {
  if (!authToken(request)) {
    throw new Error('V7_CINEMA_UNAUTHORIZED: configura V7_CINEMA_ADMIN_TOKEN y autoriza esta sesión.');
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw new Error('V7_CINEMA_ORIGIN_BLOCKED');
  }
}

function assertPaidGuard() {
  if (process.env.V7_CINEMA_PAID_ENABLED !== 'true' ||
      process.env.PRODUCTION_MODE !== 'real' ||
      process.env.ALLOW_EXTERNAL_API_CALLS !== 'true' ||
      process.env.ALLOW_PAID_GENERATION !== 'true') {
    throw new Error('V7_CINEMA_PAID_DISABLED: generación deshabilitada por defecto.');
  }
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.length < 12) {
    throw new Error('GEMINI_API_KEY no configurada');
  }
}

function googleClient() {
  // Preserve the explicit GEMINI_API_KEY in environments also defining GOOGLE_API_KEY.
  const other = process.env.GOOGLE_API_KEY;
  try {
    delete process.env.GOOGLE_API_KEY;
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  } finally {
    if (other !== undefined) process.env.GOOGLE_API_KEY = other;
  }
}

async function saveRecord(filmId: string, record: CinemaRecord) {
  const target = recordPath(filmId, record.shotId);
  const temp = target + '.tmp';
  record.updatedAt = new Date().toISOString();
  await writeFile(temp, JSON.stringify(record, null, 2), { flag: 'w' });
  // Windows rename to an existing file is not always atomic. This file is protected
  // by the cinema-core lock; if rename fails, original record remains recoverable.
  const { rename } = await import('node:fs/promises');
  await rename(temp, target);
}

async function withLock<T>(filmId: string, fn: () => Promise<T>): Promise<T> {
  const root = workRoot(filmId);
  await mkdir(root, { recursive: true });
  const lock = path.join(root, '.cinema.lock');
  let handle;
  try {
    handle = await open(lock, 'wx');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('V7_CINEMA_BUSY: otra operación está activa; no se repetirá la generación.');
    }
    throw error;
  }
  try {
    return await fn();
  } finally {
    await handle.close();
    await unlink(lock);
  }
}

export async function getCinemaBoard(filmId: string) {
  const bundle = await readV7FilmBundle(filmId);
  const pkg = await loadPackage(filmId);
  const records = await loadRecords(filmId);
  const exposureUsd = cinemaExposure(records);
  const rate = configuredRate();
  const limitUsd = Math.min(bundle.film.budgetUsd, configuredCap());
  return {
    filmId,
    filmTitle: bundle.film.title,
    model: MODEL,
    paidEnabled: process.env.V7_CINEMA_PAID_ENABLED === 'true',
    tariffConfigured: rate !== null,
    maxSpendUsd: limitUsd,
    exposureUsd,
    remainingUsd: Math.max(0, Math.round((limitUsd - exposureUsd) * 10000) / 10000),
    shotCount: pkg.manifest.shots.length,
    shots: await Promise.all(pkg.manifest.shots.map(async (shot) => {
      const existing = records.find((r) => r.shotId === shot.id);
      let referenceSha256: string | null = null;
      try {
        const file = await referenceFile(pkg, shot.id);
        referenceSha256 = createHash('sha256').update(await readFile(file)).digest('hex');
      } catch {
        // The shot must remain blocked until the source is present.
      }
      const duration = veoSeconds(shot.seconds);
      const estimatedUsd = rate === null ? null : estimateVeoUsd(shot.seconds, rate);
      return {
        id: shot.id, title: shot.title, seconds: shot.seconds,
        providerSeconds: duration,
        source: shot.source,
        videoModelAllowed: shot.source !== 'WEB',
        referenceReady: Boolean(referenceSha256),
        referenceSha256, referenceUrl: '/api/v7/films/' + encodeURIComponent(filmId) +
          '/cinema/reference/' + shot.id,
        estimatedUsd, status: existing?.status || 'not-started',
        operationKnown: Boolean(existing?.operationName),
        videoUrl: existing?.status === 'review-required'
          ? '/api/v7/films/' + encodeURIComponent(filmId) + '/cinema/video/' + shot.id
          : null,
        error: existing?.error || null
      };
    }))
  };
}

export async function getCinemaReference(filmId: string, shotId: string) {
  const pkg = await loadPackage(filmId);
  if (!pkg.manifest.shots.some((s) => s.id === shotId)) {
    throw new Error('Toma desconocida');
  }
  return readFile(await referenceFile(pkg, shotId));
}

export async function getCinemaVideo(filmId: string, shotId: string) {
  const record = (await loadRecords(filmId)).find((row) => row.shotId === shotId);
  if (record?.status !== 'review-required') throw new Error('Video aún no disponible');
  return readFile(videoPath(filmId, shotId));
}

export async function cinemaAction(filmId: string, input: CinemaApproval) {
  if (!ID_PATTERN.test(input.shotId)) throw new Error('ID de toma inválido');
  if (input.action !== 'submit' && input.action !== 'resume') {
    throw new Error('Acción de producción inválida');
  }
  return withLock(filmId, async () => {
    const pkg = await loadPackage(filmId);
    const shot = pkg.manifest.shots.find((row) => row.id === input.shotId);
    if (!shot) throw new Error('Toma inexistente');

    if (input.action === 'resume') {
      const current = (await loadRecords(filmId)).find((r) => r.shotId === shot.id);
      if (!current) throw new Error('No existe una generación que recuperar');
      if (current.status === 'review-required') return { status: current.status, alreadyDownloaded: true };
      if (!current.operationName) {
        throw new Error('Solicitud incierta sin ID del proveedor. No reintentar; reconciliar manualmente.');
      }
      // A status query is never a new generateVideos() call.
      const ai = googleClient();
      try {
        const operation = await ai.operations.getVideosOperation({
          operation: { name: current.operationName } as Parameters<typeof ai.operations.getVideosOperation>[0]['operation']
        });
        if (!operation.done) {
          current.status = 'processing';
          await saveRecord(filmId, current);
          return { status: 'processing', operationKnown: true };
        }
        const video = operation.response?.generatedVideos?.[0]?.video;
        if (!video) {
          current.status = 'failed-unknown';
          current.error = 'La operación terminó sin video. Reconciliar cobro antes de un nuevo intento.';
          await saveRecord(filmId, current);
          return { status: current.status, error: current.error };
        }
        await ai.files.download({ file: video, downloadPath: videoPath(filmId, shot.id) });
        const info = await stat(videoPath(filmId, shot.id));
        if (info.size < 10000) throw new Error('La descarga no parece un MP4 válido');
        current.status = 'review-required';
        current.candidateName = path.basename(videoPath(filmId, shot.id));
        await saveRecord(filmId, current);
        return { status: current.status, videoReady: true };
      } catch (error) {
        // Retain the provider operation ID so the same operation can be resumed.
        current.error = stripError(error);
        await saveRecord(filmId, current);
        throw new Error('No se pudo consultar el resultado de Veo: ' + current.error);
      }
    }

    assertPaidGuard();
    if (shot.source === 'WEB') {
      throw new Error('No generar pantallas de Libroseller con IA: utilizar captura o grabación real de la interfaz.');
    }
    const rate = configuredRate();
    if (rate === null) throw new Error('Tarifa de Veo sin validar');
    const bundle = await readV7FilmBundle(filmId);
    const all = await loadRecords(filmId);
    const durationSeconds = veoSeconds(shot.seconds);
    const estimatedUsd = estimateVeoUsd(shot.seconds, rate);
    const cap = Math.min(bundle.film.budgetUsd, configuredCap());
    if (!canSubmitCinema({
      alreadyExists: all.some((r) => r.shotId === shot.id),
      budgetUsd: cap, exposureUsd: cinemaExposure(all), estimatedUsd
    })) {
      throw new Error('BUDGET_OR_DUPLICATE_BLOCKED: presupuesto insuficiente o toma ya solicitada.');
    }
    const reference = await referenceFile(pkg, shot.id);
    const data = await readFile(reference);
    const sha = createHash('sha256').update(data).digest('hex');
    if (input.confirm !== true || input.referenceSha256 !== sha ||
        input.approvedEstimateUsd !== estimatedUsd) {
      throw new Error('Debes comprobar la imagen y aprobar exactamente el costo estimado.');
    }
    const record: CinemaRecord = {
      filmId, shotId: shot.id, model: MODEL,
      durationSeconds, estimatedUsd,
      referenceSha256: sha, status: 'reserved',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    // Atomic one-shot reservation. The file is never removed after a provider error.
    await writeFile(recordPath(filmId, shot.id), JSON.stringify(record, null, 2), { flag: 'wx' });
    try {
      const ai = googleClient();
      const operation = await ai.models.generateVideos({
        model: MODEL,
        source: {
          prompt: [
            'Cinematic realistic drama. Respect the exact persons, faces and wardrobe of the input image.',
            'Physical movement must be plausible. One continuous take. No speaking or lips visibly talking.',
            'Maintain location and framing. No subtitles, no logos invented, no face morphing.',
            shot.prompt
          ].join(' '),
          image: { imageBytes: data.toString('base64'), mimeType: 'image/jpeg' }
        },
        config: {
          aspectRatio: '16:9',
          numberOfVideos: 1,
          durationSeconds,
          resolution: '720p',
          personGeneration: 'allow_adult'
        }
      });
      if (!operation.name) throw new Error('Google no devolvió operation.name; riesgo de cobro incierto.');
      record.operationName = operation.name;
      record.status = 'submitted';
      await saveRecord(filmId, record);
      return { status: 'submitted', operationKnown: true, nextAction: 'resume' };
    } catch (error) {
      record.status = 'failed-unknown';
      record.error = stripError(error);
      await saveRecord(filmId, record);
      throw new Error('Solicitud registrada, resultado incierto. No reintentar. ' + record.error);
    }
  });
}
