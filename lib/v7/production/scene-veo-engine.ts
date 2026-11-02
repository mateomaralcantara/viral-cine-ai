/**
 * Estudio de escena con Veo: motor genérico para cualquier escena (E03…E10).
 *
 * Reglas que no se rompen:
 *  - Nada se envía sin tarifa verificada (V7_VEO_USD_PER_SECOND), tope fijo por
 *    escena (V7_SCENE_MAX_USD), interruptor explícito (V7_VEO_SCENES_ENABLED) y
 *    la frase exacta "AUTORIZO <TOMA> US$<importe>".
 *  - El tope NO crece con las correcciones: cada intento (incluidos los
 *    archivados) cuenta para el gasto de la escena.
 *  - Una solicitud dudosa nunca se reenvía; solo se consulta la misma operación.
 *  - Los archivos usan el mismo formato que E01/Veo, así el tablero de
 *    aprobación y el montaje local existentes funcionan sin cambios.
 */
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, open, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { GoogleGenAI } from '@google/genai';
import { readV7FilmBundle, v7FilmRoot } from '@/lib/v7/storage/film-store';
import { indexedScenes } from '@/lib/v7/production/scene-approval-board';
import { veoSeconds } from '@/lib/v7/production/cinema-core-policy';

const command = promisify(execFile);
const SCENE_LABEL = /^E\d{2}$/;
const SHOT_LABEL = /^E\d{2}-P\d{2}$/;
const REVISION_ID = /^v\d{17}-[0-9a-f-]{36}$/;
/** Escenas con motor propio: no se producen desde aquí para no mezclar libros de gasto. */
const LEGACY_SCENES = new Set(['E01', 'E02']);

export type SceneVeoStatus =
  | 'reserved' | 'submitted' | 'processing' | 'review-required'
  | 'failed-unknown' | 'failed-no-video';

export type SceneVeoRecord = {
  schemaVersion: 1;
  provider: 'veo';
  filmId: string;
  shotId: string;
  sceneLabel: string;
  model: string;
  mode: 'text-to-video' | 'image-to-video';
  durationSeconds: number;
  estimatedUsd: number;
  revisionId: string;
  promptHash: string;
  referenceSha256: string | null;
  status: SceneVeoStatus;
  operationName?: string;
  candidateName?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type PromptRevision = {
  schemaVersion: 1;
  shotId: string;
  revisionId: string;
  promptText: string;
  promptHash: string;
  createdAt: string;
};

const sha = (input: string | Buffer) => createHash('sha256').update(input).digest('hex');
const round = (value: number) => Math.round(value * 10000) / 10000;

// ---------- configuración ----------

export function veoSceneModel() {
  return (process.env.V7_VEO_SCENE_MODEL || 'veo-3.1-fast-generate-preview').trim();
}
export function veoSceneRate(): number | null {
  const value = Number(process.env.V7_VEO_USD_PER_SECOND || 0);
  return Number.isFinite(value) && value > 0 && value <= 10 ? value : null;
}
export function sceneCapUsd(): number {
  const value = Number(process.env.V7_SCENE_MAX_USD || 0);
  return Number.isFinite(value) && value > 0 ? round(value) : 0;
}
export function veoScenesEnabled() {
  return process.env.NODE_ENV === 'development' &&
    process.env.V7_VEO_SCENES_ENABLED === 'true' &&
    Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length >= 12);
}
export function estimateShotUsd(editSeconds: number, rate: number) {
  return round(veoSeconds(Math.min(8, editSeconds)) * rate);
}
export function authorizationPhrase(shotId: string, usd: number) {
  return 'AUTORIZO ' + shotId + ' US$' + usd.toFixed(2);
}

// ---------- rutas (mismo formato que E01/Veo) ----------

function assertShotLabel(label: string) {
  if (!SHOT_LABEL.test(label)) throw new Error('Etiqueta de toma inválida.');
}
export function shotDir(filmId: string, label: string) {
  assertShotLabel(label);
  return path.join(v7FilmRoot(filmId), label.toLowerCase());
}
export function recordPath(filmId: string, label: string) {
  return path.join(shotDir(filmId, label), 'provider-operation.json');
}
export function candidatePath(filmId: string, label: string) {
  return path.join(shotDir(filmId, label), label + '-veo-candidato.mp4');
}
function attemptsDir(filmId: string, label: string) {
  return path.join(shotDir(filmId, label), 'veo-attempts');
}
function promptsDir(filmId: string, label: string) {
  return path.join(shotDir(filmId, label), 'veo-prompts');
}
/** Foto opcional de la toma: si existe, Veo parte de ella (image-to-video). */
export function shotReferencePath(filmId: string, label: string) {
  return path.join(shotDir(filmId, label), label + '-referencia.jpg');
}

// ---------- plan de escena ----------

export type ScenePlanShot = {
  shotId: string; bundleShotId: string; title: string; camera: string;
  editSeconds: number; providerSeconds: number; spokenText: string; defaultPrompt: string;
};

export async function scenePlan(filmId: string, sceneLabel: string) {
  if (!SCENE_LABEL.test(sceneLabel)) throw new Error('Escena inválida.');
  const film = (await readV7FilmBundle(filmId)).film;
  const entry = indexedScenes(film).find((s) => s.label === sceneLabel);
  if (!entry) throw new Error('La escena ' + sceneLabel + ' no existe en el guion.');
  const shots: ScenePlanShot[] = entry.shots.map(({ shot, label }) => ({
    shotId: label,
    bundleShotId: shot.id,
    title: shot.title,
    camera: shot.camera,
    editSeconds: shot.durationSeconds,
    providerSeconds: veoSeconds(Math.min(8, shot.durationSeconds)),
    spokenText: shot.spokenText,
    defaultPrompt: defaultPrompt(shot.visualPrompt || shot.title, shot.camera)
  }));
  return { filmId, sceneLabel, sceneId: entry.scene.id, title: entry.scene.title, shots, legacy: LEGACY_SCENES.has(sceneLabel) };
}

function defaultPrompt(visual: string, camera: string) {
  return [
    visual.trim(),
    camera ? 'Camera: ' + camera.trim() + '.' : '',
    'One continuous realistic cinematic take, natural motion, consistent faces and wardrobe.',
    'No subtitles, no text, no logos, no visible lip-synced dialogue.'
  ].filter(Boolean).join(' ').slice(0, 3500);
}

async function planShot(filmId: string, shotId: string) {
  assertShotLabel(shotId);
  const plan = await scenePlan(filmId, shotId.slice(0, 3));
  const shot = plan.shots.find((s) => s.shotId === shotId);
  if (!shot) throw new Error('La toma ' + shotId + ' no existe en el guion.');
  return { plan, shot };
}

// ---------- versiones de prompt (inmutables) ----------

export async function savePromptRevision(filmId: string, shotId: string, promptText: string) {
  await planShot(filmId, shotId);
  const prompt = promptText.trim();
  if (prompt.length < 60 || prompt.length > 3500) throw new Error('El prompt debe tener entre 60 y 3500 caracteres.');
  const now = new Date().toISOString();
  const revisionId = 'v' + now.replace(/\D/g, '').padEnd(17, '0').slice(0, 17) + '-' + randomUUID();
  const revision: PromptRevision = { schemaVersion: 1, shotId, revisionId, promptText: prompt, promptHash: sha(prompt), createdAt: now };
  const dir = promptsDir(filmId, shotId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, revisionId + '.json'), JSON.stringify(revision, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const pointer = path.join(dir, 'latest.json');
  const temp = pointer + '.' + randomUUID() + '.tmp';
  await writeFile(temp, JSON.stringify({ revisionId }) + '\n', { flag: 'wx', mode: 0o600 });
  await rename(temp, pointer);
  return revision;
}

export async function latestPromptRevision(filmId: string, shotId: string): Promise<PromptRevision | null> {
  try {
    const pointer = JSON.parse(await readFile(path.join(promptsDir(filmId, shotId), 'latest.json'), 'utf8')) as { revisionId: string };
    if (!REVISION_ID.test(pointer.revisionId)) throw new Error('Puntero de versión dañado.');
    const revision = JSON.parse(await readFile(path.join(promptsDir(filmId, shotId), pointer.revisionId + '.json'), 'utf8')) as PromptRevision;
    if (revision.shotId !== shotId || revision.promptHash !== sha(revision.promptText)) throw new Error('Versión de prompt dañada.');
    return revision;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

// ---------- registros y libro de gasto ----------

export async function readShotRecord(filmId: string, shotId: string): Promise<SceneVeoRecord | null> {
  try {
    const record = JSON.parse(await readFile(recordPath(filmId, shotId), 'utf8')) as SceneVeoRecord;
    if (record.filmId !== filmId || record.shotId !== shotId) throw new Error('Registro de Veo no coincide con la toma.');
    return record;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

async function archivedRecords(filmId: string, shotId: string): Promise<SceneVeoRecord[]> {
  try {
    const names = (await readdir(attemptsDir(filmId, shotId))).filter((n) => n.endsWith('.json'));
    return Promise.all(names.map(async (n) => JSON.parse(await readFile(path.join(attemptsDir(filmId, shotId), n), 'utf8')) as SceneVeoRecord));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

/** Gasto comprometido de la escena: activos + archivados. Un intento dudoso nunca libera presupuesto. */
export async function sceneExposureUsd(filmId: string, sceneLabel: string) {
  const plan = await scenePlan(filmId, sceneLabel);
  let total = 0;
  for (const shot of plan.shots) {
    const active = await readShotRecord(filmId, shot.shotId);
    if (active?.provider === 'veo') total += active.estimatedUsd;
    for (const old of await archivedRecords(filmId, shot.shotId)) total += old.estimatedUsd;
  }
  return round(total);
}

async function writeRecord(filmId: string, record: SceneVeoRecord) {
  record.updatedAt = new Date().toISOString();
  const target = recordPath(filmId, record.shotId);
  const temp = target + '.' + randomUUID() + '.tmp';
  await writeFile(temp, JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  try { await rename(temp, target); } catch (e) { await unlink(temp).catch(() => undefined); throw e; }
}

async function withSceneLock<T>(filmId: string, sceneLabel: string, work: () => Promise<T>): Promise<T> {
  const dir = path.join(v7FilmRoot(filmId), 'scenes', sceneLabel.toLowerCase());
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, '.veo-scene.lock');
  const handle = await open(file, 'wx').catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'EEXIST') throw new Error('Ya hay una operación de Veo en curso en esta escena. Espera y recupera la misma tarea.');
    throw e;
  });
  try { return await work(); } finally { await handle.close(); await unlink(file).catch(() => undefined); }
}

function safeError(error: unknown) {
  return String(error instanceof Error ? error.message : error)
    .replace(/AIza[A-Za-z0-9_-]+/g, '[GOOGLE_KEY]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/https?:\/\/\S+/g, '[URL]')
    .slice(0, 400);
}

function googleClient() {
  const other = process.env.GOOGLE_API_KEY;
  try {
    delete process.env.GOOGLE_API_KEY;
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  } finally {
    if (other !== undefined) process.env.GOOGLE_API_KEY = other;
  }
}

async function optionalReference(filmId: string, shotId: string) {
  try {
    const file = shotReferencePath(filmId, shotId);
    const info = await stat(file);
    if (!info.isFile() || info.size < 3000) return null;
    const bytes = await readFile(file);
    return { bytes, sha256: sha(bytes) };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

// ---------- tablero ----------

export async function sceneStudioBoard(filmId: string, sceneLabel: string) {
  const plan = await scenePlan(filmId, sceneLabel);
  const rate = veoSceneRate();
  const cap = sceneCapUsd();
  const exposure = await sceneExposureUsd(filmId, sceneLabel);
  const shots = await Promise.all(plan.shots.map(async (shot) => {
    const record = await readShotRecord(filmId, shot.shotId);
    const revision = await latestPromptRevision(filmId, shot.shotId);
    const reference = await optionalReference(filmId, shot.shotId);
    const estimatedUsd = rate === null ? null : estimateShotUsd(shot.editSeconds, rate);
    return {
      ...shot,
      status: record?.provider === 'veo' ? record.status : record ? 'other-provider' : 'not-started',
      operationKnown: Boolean(record?.operationName),
      error: record?.error ?? null,
      promptText: revision?.promptText ?? shot.defaultPrompt,
      revisionId: revision?.revisionId ?? null,
      revisionUsed: Boolean(record && revision && record.revisionId === revision.revisionId),
      mode: reference ? 'image-to-video' : 'text-to-video',
      referenceSha256: reference?.sha256 ?? null,
      estimatedUsd,
      authorization: estimatedUsd === null ? null : authorizationPhrase(shot.shotId, estimatedUsd),
      videoReady: record?.status === 'review-required'
    };
  }));
  return {
    ...plan,
    model: veoSceneModel(),
    providerEnabled: veoScenesEnabled(),
    tariffConfigured: rate !== null,
    ratePerSecondUsd: rate,
    capUsd: cap,
    exposureUsd: exposure,
    remainingUsd: round(Math.max(0, cap - exposure)),
    shots
  };
}

// ---------- envío (único paso con costo) ----------

export async function submitSceneShot(filmId: string, shotId: string, input: { revisionId: string; authorization: string }) {
  const { plan, shot } = await planShot(filmId, shotId);
  if (plan.legacy) throw new Error(plan.sceneLabel + ' tiene su propio motor y libro de gasto. Usa su panel.');
  if (!veoScenesEnabled()) throw new Error('Veo para escenas está apagado (V7_VEO_SCENES_ENABLED) o falta GEMINI_API_KEY.');
  const rate = veoSceneRate();
  if (rate === null) throw new Error('Tarifa de Veo sin verificar: configura V7_VEO_USD_PER_SECOND según la página de precios de Google.');
  const cap = sceneCapUsd();
  if (cap <= 0) throw new Error('Configura V7_SCENE_MAX_USD: tope fijo de gasto por escena.');
  if (!REVISION_ID.test(input.revisionId)) throw new Error('Guarda primero una versión del prompt.');
  const estimatedUsd = estimateShotUsd(shot.editSeconds, rate);
  if (input.authorization.trim() !== authorizationPhrase(shotId, estimatedUsd)) {
    throw new Error('Escribe exactamente: ' + authorizationPhrase(shotId, estimatedUsd));
  }
  return withSceneLock(filmId, plan.sceneLabel, async () => {
    const revision = await latestPromptRevision(filmId, shotId);
    if (!revision || revision.revisionId !== input.revisionId) throw new Error('El prompt cambió: revisa y autoriza la versión más reciente.');
    const existing = await readShotRecord(filmId, shotId);
    if (existing) {
      if (existing.status !== 'failed-no-video') {
        throw new Error('La toma ya tiene una operación (' + existing.status + '). Recupera la misma tarea; nunca se reenvía.');
      }
      if (existing.revisionId === revision.revisionId) throw new Error('Esta versión ya se usó. Guarda una versión corregida antes de otro intento.');
    }
    const exposure = await sceneExposureUsd(filmId, plan.sceneLabel);
    if (exposure + estimatedUsd > cap + 0.000001) {
      throw new Error('Tope de la escena alcanzado: US$' + exposure.toFixed(2) + ' de US$' + cap.toFixed(2) + '. Súbelo solo si lo decides tú (V7_SCENE_MAX_USD).');
    }
    if (existing) {
      await mkdir(attemptsDir(filmId, shotId), { recursive: true });
      await rename(recordPath(filmId, shotId), path.join(attemptsDir(filmId, shotId), existing.revisionId + '.json'));
    }
    const reference = await optionalReference(filmId, shotId);
    const now = new Date().toISOString();
    const record: SceneVeoRecord = {
      schemaVersion: 1, provider: 'veo', filmId, shotId, sceneLabel: plan.sceneLabel,
      model: veoSceneModel(), mode: reference ? 'image-to-video' : 'text-to-video',
      durationSeconds: shot.providerSeconds, estimatedUsd,
      revisionId: revision.revisionId, promptHash: revision.promptHash,
      referenceSha256: reference?.sha256 ?? null, status: 'reserved', createdAt: now, updatedAt: now
    };
    await mkdir(shotDir(filmId, shotId), { recursive: true });
    // Reserva atómica ANTES de llamar al proveedor; nunca se borra tras un error.
    await writeFile(recordPath(filmId, shotId), JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    try {
      const operation = await googleClient().models.generateVideos({
        model: record.model,
        source: {
          prompt: revision.promptText,
          ...(reference ? { image: { imageBytes: reference.bytes.toString('base64'), mimeType: 'image/jpeg' } } : {})
        },
        config: {
          aspectRatio: '16:9', numberOfVideos: 1, durationSeconds: shot.providerSeconds, resolution: '720p',
          personGeneration: reference ? 'allow_adult' : 'allow_all'
        }
      });
      if (!operation.name) throw new Error('Google no devolvió el ID de la operación; resultado incierto.');
      record.operationName = operation.name;
      record.status = 'submitted';
      await writeRecord(filmId, record);
      return { shotId, status: record.status, estimatedUsd, noAutomaticRetries: true };
    } catch (error) {
      record.status = 'failed-unknown';
      record.error = safeError(error);
      await writeRecord(filmId, record);
      throw new Error('Veo no confirmó la solicitud. No se reenviará: ' + record.error);
    }
  });
}

// ---------- recuperar (gratis: solo consulta la misma operación) ----------

export async function resumeSceneShot(filmId: string, shotId: string) {
  const { plan } = await planShot(filmId, shotId);
  return withSceneLock(filmId, plan.sceneLabel, async () => {
    const record = await readShotRecord(filmId, shotId);
    if (!record || record.provider !== 'veo') throw new Error('No hay una operación de Veo que recuperar en ' + shotId + '.');
    if (record.status === 'review-required') return { shotId, status: record.status, videoReady: true };
    if (!record.operationName) throw new Error('Solicitud sin ID de Google: resultado incierto. No reenviar; reconciliar.');
    if (!process.env.GEMINI_API_KEY) throw new Error('Falta GEMINI_API_KEY para consultar la operación.');
    const ai = googleClient();
    const operation = await ai.operations.getVideosOperation({
      operation: { name: record.operationName } as Parameters<typeof ai.operations.getVideosOperation>[0]['operation']
    });
    if (!operation.done) {
      record.status = 'processing';
      await writeRecord(filmId, record);
      return { shotId, status: record.status, videoReady: false };
    }
    const video = operation.response?.generatedVideos?.[0]?.video;
    if (!video) {
      const filtered = operation.response?.raiMediaFilteredReasons?.join('; ');
      record.status = operation.error || filtered ? 'failed-no-video' : 'failed-unknown';
      record.error = safeError(filtered || (operation.error ? JSON.stringify(operation.error) : 'La operación terminó sin video.'));
      await writeRecord(filmId, record);
      return { shotId, status: record.status, videoReady: false, error: record.error };
    }
    const target = candidatePath(filmId, shotId);
    const temp = path.join(shotDir(filmId, shotId), '.veo-' + randomUUID() + '.mp4');
    try {
      await ai.files.download({ file: video, downloadPath: temp });
      const { stdout } = await command('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', temp], { timeout: 30000 });
      const info = JSON.parse(stdout) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string }> };
      const seconds = Number(info.format?.duration ?? 0);
      if (seconds < record.durationSeconds - 1 || !info.streams?.some((s) => s.codec_type === 'video')) {
        throw new Error('El video de Veo no supera la verificación técnica.');
      }
      await rename(temp, target);
    } finally {
      await unlink(temp).catch(() => undefined);
    }
    record.status = 'review-required';
    record.candidateName = path.basename(target);
    delete record.error;
    await writeRecord(filmId, record);
    return { shotId, status: record.status, videoReady: true };
  });
}
