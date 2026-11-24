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
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { mkdir, open, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { GenerateVideosOperation, GoogleGenAI } from '@google/genai';
import { activeLessons, applyLessons, readCounts, speakableDialogue } from '@/lib/v7/qa/lessons';
import { isLocked, isRemoved } from '@/lib/v7/production/shot-lock';
import { readV7FilmBundle, v7DataRoot, v7FilmRoot } from '@/lib/v7/storage/film-store';
import { indexedScenes } from '@/lib/v7/production/scene-approval-board';
import { veoSeconds } from '@/lib/v7/production/cinema-core-policy';
import { DOS_TOQUES_SCENE_PROMPTS } from '@/lib/v7/presets/dos-toques-scene-prompts';
import { continuityBlock } from '@/lib/v7/production/continuity-chain';
import { serieOf } from '@/lib/v7/production/character-identity';

const command = promisify(execFile);
const SCENE_LABEL = /^E\d{2}$/;
const SHOT_LABEL = /^E\d{2}-P\d{2}$/;
const REVISION_ID = /^v\d{17}-[0-9a-f-]{36}$/;
/** Escenas con motor propio (solo en «Dos toques»): no se producen aquí para no mezclar libros de gasto. */
const DOS_TOQUES_FILM_ID = 'film-dos-toques-de-bocina-v7';
const LEGACY_SCENES = new Set(['E01', 'E02']);
function isLegacyScene(filmId: string, sceneLabel: string) {
  return filmId === DOS_TOQUES_FILM_ID && LEGACY_SCENES.has(sceneLabel);
}
/** Prompt inicial: curado por película (datos) o, si no, derivado del guion. */
function curatedPrompt(filmId: string, label: string, shot: { visualPrompt: string; title: string; camera: string; metadata: Record<string, unknown> }) {
  if (filmId === DOS_TOQUES_FILM_ID && DOS_TOQUES_SCENE_PROMPTS[label]) return DOS_TOQUES_SCENE_PROMPTS[label];
  if (shot.metadata?.curatedPrompt === true && shot.visualPrompt.trim().length >= 60) return shot.visualPrompt.trim().slice(0, 3500);
  return defaultPrompt(shot.visualPrompt || shot.title, shot.camera);
}

/** Etiquetas de escena del guion (E01, E02…) y la primera que se produce en el estudio. */
export async function sceneLabels(filmId: string) {
  const film = (await readV7FilmBundle(filmId)).film;
  const labels = indexedScenes(film).map((s) => s.label);
  return { labels, studioLabels: labels.filter((l) => !isLegacyScene(filmId, l)) };
}

export type SceneVeoStatus =
  | 'reserved' | 'submitted' | 'processing' | 'review-required'
  | 'failed-unknown' | 'failed-no-video'
  /** Google rechazó por cuota (HTTP 429) antes de crear el trabajo: sin costo, se reintenta igual. */
  | 'quota-rejected';

export type SceneVeoRecord = {
  schemaVersion: 1;
  provider: 'veo';
  filmId: string;
  shotId: string;
  sceneLabel: string;
  model: string;
  /** Plataforma de Google usada al crear la toma (los registros antiguos son AI Studio). */
  platform?: VideoPlatform;
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
  /** Lecciones aprendidas aplicadas al enviar esta toma. */
  lessons?: string[];
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
/** Los modelos «gemini-omni-*» usan la API Interactions en segundo plano; el resto, Veo (generateVideos). */
/** AI Studio (Gemini API, con clave) o Vertex AI (Google Cloud, con cuenta de servicio). */
export type VideoPlatform = 'gemini' | 'vertex';
export function videoPlatform(): VideoPlatform {
  return process.env.V7_VIDEO_PLATFORM?.trim().toLowerCase() === 'vertex' ? 'vertex' : 'gemini';
}
function vertexConfig() {
  return {
    project: (process.env.GOOGLE_CLOUD_PROJECT || '').trim(),
    location: (process.env.GOOGLE_CLOUD_LOCATION || 'us-central1').trim(),
    keyFile: (process.env.V7_VERTEX_KEY_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim()
  };
}
/** Comprueba la configuración sin red: qué falta para usar la plataforma. */
export function platformProblem(platform: VideoPlatform = videoPlatform()): string | null {
  if (platform === 'gemini') {
    return process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length >= 12 ? null : 'Falta GEMINI_API_KEY (AI Studio).';
  }
  const v = vertexConfig();
  if (!v.project) return 'Falta GOOGLE_CLOUD_PROJECT (ID del proyecto de Google Cloud).';
  if (!v.keyFile) return 'Falta V7_VERTEX_KEY_FILE (ruta al JSON de la cuenta de servicio).';
  if (!existsSync(v.keyFile)) return 'No existe el archivo de la cuenta de servicio: ' + v.keyFile;
  return null;
}

export function isOmniModel(model = veoSceneModel()) {
  return model.startsWith('gemini-omni');
}
/** Un 4xx al crear significa que Google rechazó la solicitud y no creó ningún trabajo. */
function rejectedBeforeCreation(error: unknown) {
  const status = Number((error as { status?: unknown })?.status);
  return Number.isInteger(status) && status >= 400 && status < 500 && status !== 408 && status !== 429;
}
const INTERACTION_PREFIX = 'interaction:';
/** Lo que nunca debe aparecer en una toma (se envía como prompt negativo a Veo). */
export const VEO_NEGATIVE_PROMPT = 'subtítulos, subtitles, captions, texto en pantalla, letras, palabras escritas, rótulos, marca de agua, logotipo, números en pantallas, interfaz de usuario, manos deformes, dedos extra';
const QUOTA_PATTERN = /"code":\s*429|\b429\b|RESOURCE_EXHAUSTED|Quota exceeded/i;
/** Rechazo por cuota al crear: Google no creó ningún trabajo, así que no hay cobro posible. */
function quotaRejected(error: unknown) {
  const status = Number((error as { status?: unknown })?.status);
  return status === 429 || QUOTA_PATTERN.test(String(error instanceof Error ? error.message : error));
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
    platformProblem() === null;
}
export function estimateShotUsd(editSeconds: number, rate: number) {
  return round(veoSeconds(Math.min(8, editSeconds)) * rate);
}
export function sceneAuthorizationPhrase(sceneLabel: string, usd: number) {
  return 'AUTORIZO ' + sceneLabel + ' COMPLETA US$' + usd.toFixed(2);
}
/** Frase distinta para rehacer una toma que ya tiene video: nunca se confunde con un primer envío. */
export function redoAuthorizationPhrase(shotId: string, usd: number) {
  return 'AUTORIZO REHACER ' + shotId + ' US$' + usd.toFixed(2);
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
    defaultPrompt: curatedPrompt(filmId, label, shot)
  }));
  return { filmId, sceneLabel, sceneId: entry.scene.id, title: entry.scene.title, shots, legacy: isLegacyScene(filmId, sceneLabel) };
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

async function readRevision(filmId: string, shotId: string, revisionId: string): Promise<PromptRevision | null> {
  if (!REVISION_ID.test(revisionId)) return null;
  try {
    const r = JSON.parse(await readFile(path.join(promptsDir(filmId, shotId), revisionId + '.json'), 'utf8')) as PromptRevision;
    return r.shotId === shotId && r.promptHash === sha(r.promptText) ? r : null;
  } catch { return null; }
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
    // Normalización de solo lectura: un 429 sin ID de operación nunca creó un trabajo.
    return normalizeRecord(record);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

/** Un bloqueo del filtro de Google («You will not be charged for blocked videos») no cuesta nada. */
export const FILTERED_PATTERN = /filtered out|will not be charged|usage guidelines|raiMediaFiltered|support codes?:/i;

/** Normalización de solo lectura: lo que Google confirma que no cobró, no cuenta en el tope. */
function normalizeRecord(record: SceneVeoRecord): SceneVeoRecord {
  // Un 429 sin ID de operación nunca creó un trabajo.
  if (record.status === 'failed-unknown' && !record.operationName && QUOTA_PATTERN.test(record.error ?? '')) {
    return { ...record, status: 'quota-rejected', estimatedUsd: 0 };
  }
  if (record.status === 'failed-no-video' && FILTERED_PATTERN.test(record.error ?? '')) return { ...record, estimatedUsd: 0 };
  return record;
}

async function archivedRecords(filmId: string, shotId: string): Promise<SceneVeoRecord[]> {
  try {
    const names = (await readdir(attemptsDir(filmId, shotId))).filter((n) => n.endsWith('.json'));
    return Promise.all(names.map(async (n) => normalizeRecord(JSON.parse(await readFile(path.join(attemptsDir(filmId, shotId), n), 'utf8')) as SceneVeoRecord)));
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

export function googleClient(platform: VideoPlatform = 'gemini', location?: string) {
  if (platform === 'vertex') {
    const v = vertexConfig();
    const problem = platformProblem('vertex');
    if (problem) throw new Error(problem);
    return new GoogleGenAI({
      vertexai: true, project: v.project, location: location || v.location,
      googleAuthOptions: { keyFilename: v.keyFile, scopes: ['https://www.googleapis.com/auth/cloud-platform'] }
    });
  }
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
  const receipt = await readSceneAuthorization(filmId, sceneLabel);
  const queued = new Set(receipt?.shots.map((s) => s.shotId) ?? []);
  const shots = await Promise.all(plan.shots.map(async (shot) => {
    const record = await readShotRecord(filmId, shot.shotId);
    const revision = await latestPromptRevision(filmId, shot.shotId);
    const reference = await optionalReference(filmId, shot.shotId);
    const estimatedUsd = rate === null ? null : estimateShotUsd(shot.editSeconds, rate);
    return {
      ...shot,
      status: record?.provider === 'veo' ? record.status : record ? 'other-provider' : queued.has(shot.shotId) ? 'queued' : 'not-started',
      operationKnown: Boolean(record?.operationName),
      error: record?.error ?? null,
      promptText: revision?.promptText ?? shot.defaultPrompt,
      revisionId: revision?.revisionId ?? null,
      revisionUsed: Boolean(record && revision && record.status !== 'quota-rejected' && record.revisionId === revision.revisionId),
      mode: reference ? 'image-to-video' : 'text-to-video',
      referenceSha256: reference?.sha256 ?? null,
      estimatedUsd,
      authorization: estimatedUsd === null ? null : authorizationPhrase(shot.shotId, estimatedUsd),
      redoAuthorization: estimatedUsd === null ? null : redoAuthorizationPhrase(shot.shotId, estimatedUsd),
      videoReady: record?.status === 'review-required',
      locked: await isLocked(shotDir(filmId, shot.shotId)),
      removed: await isRemoved(shotDir(filmId, shot.shotId)),
      hasReference: Boolean(reference),
      authorPhoto: existsSync(path.join(shotDir(filmId, shot.shotId), 'foto-del-autor.json')),
      stillShot: existsSync(path.join(shotDir(filmId, shot.shotId), shot.shotId + '-plano-fijo.mp4')),
      gate: await readFile(path.join(shotDir(filmId, shot.shotId), 'puerta.json'), 'utf8').then((t) => JSON.parse(t) as { pass: boolean; reasons: string[] }, () => null)
    };
  }));
  const pending = shots.filter((s) => s.status === 'not-started' && s.estimatedUsd !== null);
  const sceneTotalUsd = round(pending.reduce((sum, s) => sum + (s.estimatedUsd ?? 0), 0));
  return {
    ...plan,
    pendingShots: pending.map((s) => s.shotId),
    characters: await readV7FilmBundle(filmId).then(({ film }) => film.characters.map((c) => ({ key: c.id.replace(/^.*-character-/, ''), name: c.name, image: !/sin imagen/i.test(c.appearance) })), () => []),
    sceneTotalUsd,
    sceneAuthorization: pending.length ? sceneAuthorizationPhrase(plan.sceneLabel, sceneTotalUsd) : null,
    model: veoSceneModel(),
    providerEnabled: veoScenesEnabled() && !isFrozenFilm(filmId),
    platform: videoPlatform(),
    platformProblem: platformProblem(),
    frozen: isFrozenFilm(filmId),
    tariffConfigured: rate !== null,
    ratePerSecondUsd: rate,
    capUsd: cap,
    exposureUsd: exposure,
    remainingUsd: round(Math.max(0, cap - exposure)),
    shots
  };
}

// ---------- envío (único paso con costo) ----------

/** Películas congeladas (V7_FROZEN_FILMS, separadas por coma): sin ninguna generación pagada. */
export function isFrozenFilm(filmId: string) {
  return (process.env.V7_FROZEN_FILMS || '').split(',').map((x) => x.trim()).filter(Boolean).includes(filmId);
}
function paidPreconditions(legacy: boolean, sceneLabel: string, filmId: string) {
  if (isFrozenFilm(filmId)) throw new Error('Película congelada (V7_FROZEN_FILMS): no se genera nada nuevo.');
  if (legacy) throw new Error(sceneLabel + ' tiene su propio motor y libro de gasto. Usa su panel.');
  const problem = platformProblem();
  if (problem) throw new Error(problem);
  if (!veoScenesEnabled()) throw new Error('Veo para escenas está apagado (V7_VEO_SCENES_ENABLED=false).');
  if (videoPlatform() === 'vertex' && isOmniModel()) {
    throw new Error('Gemini Omni solo está en AI Studio. En Vertex AI usa un modelo Veo (V7_VEO_SCENE_MODEL).');
  }
  const rate = veoSceneRate();
  if (rate === null) throw new Error('Tarifa de Veo sin verificar: configura V7_VEO_USD_PER_SECOND según la página de precios de Google.');
  const cap = sceneCapUsd();
  if (cap <= 0) throw new Error('Configura V7_SCENE_MAX_USD: tope fijo de gasto por escena.');
  return { rate, cap };
}

export async function submitSceneShot(filmId: string, shotId: string, input: { revisionId: string; authorization: string; redo?: boolean }) {
  const { plan, shot } = await planShot(filmId, shotId);
  if (await isLocked(shotDir(filmId, shotId))) {
    throw new Error('La toma ' + shotId + ' está FIJADA (quedó bien): no se vuelve a generar. Si de verdad quieres cambiarla: npm run frase -- <película> --soltar ' + shotId);
  }
  const { rate, cap } = paidPreconditions(plan.legacy, plan.sceneLabel, filmId);
  if (!REVISION_ID.test(input.revisionId)) throw new Error('Guarda primero una versión del prompt.');
  const estimatedUsd = estimateShotUsd(shot.editSeconds, rate);
  const phrase = input.redo ? redoAuthorizationPhrase(shotId, estimatedUsd) : authorizationPhrase(shotId, estimatedUsd);
  if (input.authorization.trim() !== phrase) throw new Error('Escribe exactamente: ' + phrase);
  return withSceneLock(filmId, plan.sceneLabel, () => submitLocked(filmId, plan, shot, input.revisionId, estimatedUsd, cap, input.redo === true));
}

/** Máximo de trabajos de video simultáneos por escena (Google rechaza el exceso con «failed»). */
export function sceneMaxInFlight() {
  // 3 a la vez por defecto: respeta mejor el límite por minuto de Google (sube con V7_SCENE_MAX_IN_FLIGHT si amplías la cuota).
  const value = Number(process.env.V7_SCENE_MAX_IN_FLIGHT || 3);
  return Number.isInteger(value) && value >= 1 && value <= 9 ? value : 3;
}
const IN_FLIGHT = new Set<SceneVeoStatus>(['reserved', 'submitted', 'processing']);

type SceneAuthorization = {
  schemaVersion: 1; sceneLabel: string; totalUsd: number; createdAt: string;
  shots: Array<{ shotId: string; revisionId: string; estimatedUsd: number }>;
};
function sceneAuthorizationPath(filmId: string, sceneLabel: string) {
  return path.join(v7FilmRoot(filmId), 'scenes', sceneLabel.toLowerCase(), 'veo-scene-authorization.json');
}
async function readSceneAuthorization(filmId: string, sceneLabel: string): Promise<SceneAuthorization | null> {
  try { return JSON.parse(await readFile(sceneAuthorizationPath(filmId, sceneLabel), 'utf8')) as SceneAuthorization; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
}

/**
 * Escena completa de un solo tirón: una autorización por el total exacto de las
 * tomas pendientes. Queda guardada como recibo y las tomas se envían por tandas
 * (V7_SCENE_MAX_IN_FLIGHT a la vez); «Recuperar» envía la siguiente tanda al
 * terminar la anterior. Se detiene ante el primer error, sin reintentos.
 */
export async function submitWholeScene(filmId: string, sceneLabel: string, authorization: string) {
  const plan = await scenePlan(filmId, sceneLabel);
  const { rate, cap } = paidPreconditions(plan.legacy, plan.sceneLabel, filmId);
  return withSceneLock(filmId, plan.sceneLabel, async () => {
    const pending = [];
    const previous = new Set((await readSceneAuthorization(filmId, sceneLabel))?.shots.map((s) => s.shotId) ?? []);
    for (const shot of plan.shots) if (!(await readShotRecord(filmId, shot.shotId)) && !previous.has(shot.shotId)) pending.push(shot);
    if (!pending.length) throw new Error('No quedan tomas pendientes en ' + sceneLabel + '.');
    const total = round(pending.reduce((sum, s) => sum + estimateShotUsd(s.editSeconds, rate), 0));
    if (authorization.trim() !== sceneAuthorizationPhrase(sceneLabel, total)) {
      throw new Error('Escribe exactamente: ' + sceneAuthorizationPhrase(sceneLabel, total));
    }
    const exposure = await sceneExposureUsd(filmId, sceneLabel);
    if (exposure + total > cap + 0.000001) {
      throw new Error('La escena completa (US$' + total.toFixed(2) + ') supera el tope: ya comprometido US$' + exposure.toFixed(2) + ' de US$' + cap.toFixed(2) + '. Súbelo solo si lo decides tú (V7_SCENE_MAX_USD).');
    }
    const receipt: SceneAuthorization = { schemaVersion: 1, sceneLabel, totalUsd: total, createdAt: new Date().toISOString(), shots: [] };
    for (const shot of pending) {
      const revision = (await latestPromptRevision(filmId, shot.shotId)) ?? await savePromptRevision(filmId, shot.shotId, shot.defaultPrompt);
      receipt.shots.push({ shotId: shot.shotId, revisionId: revision.revisionId, estimatedUsd: estimateShotUsd(shot.editSeconds, rate) });
    }
    await mkdir(path.dirname(sceneAuthorizationPath(filmId, sceneLabel)), { recursive: true });
    await writeFile(sceneAuthorizationPath(filmId, sceneLabel), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    const results = await dispatchAuthorized(filmId, plan, cap);
    return { sceneLabel, authorizedUsd: total, submitted: results.filter((r) => r.status === 'submitted').length,
      queued: receipt.shots.length - results.filter((r) => r.status === 'submitted').length, results, noAutomaticRetries: true };
  });
}

/** Envía tomas ya autorizadas mientras haya hueco. Requiere el candado de la escena. */
async function dispatchAuthorized(filmId: string, plan: Awaited<ReturnType<typeof scenePlan>>, cap: number) {
  const receipt = await readSceneAuthorization(filmId, plan.sceneLabel);
  const results: Array<{ shotId: string; status: string; error?: string }> = [];
  if (!receipt) return results;
  let inFlight = 0;
  for (const shot of plan.shots) {
    const record = await readShotRecord(filmId, shot.shotId);
    if (record && IN_FLIGHT.has(record.status)) inFlight++;
  }
  for (const item of receipt.shots) {
    if (inFlight >= sceneMaxInFlight()) break;
    const current = await readShotRecord(filmId, item.shotId);
    if (current && current.status !== 'quota-rejected') continue;
    if (await isLocked(shotDir(filmId, item.shotId))) continue;
    const shot = plan.shots.find((s) => s.shotId === item.shotId)!;
    try {
      // Si después de autorizar se guardó otra versión con EXACTAMENTE el mismo texto (p. ej. al crear
      // los fotogramas), se envía esa: lo autorizado no cambió. Si el texto cambió, se detiene y se avisa.
      let revisionId = item.revisionId;
      const latest = await latestPromptRevision(filmId, shot.shotId);
      if (latest && latest.revisionId !== revisionId) {
        const authorized = await readRevision(filmId, shot.shotId, revisionId);
        if (authorized && authorized.promptHash === latest.promptHash) revisionId = latest.revisionId;
        else throw new Error('El texto de ' + shot.shotId + ' cambió después de autorizar la escena: autoriza esa toma por separado.');
      }
      const r = await submitLocked(filmId, plan, shot, revisionId, item.estimatedUsd, cap, false, true);
      results.push({ shotId: shot.shotId, status: r.status });
      inFlight++;
    } catch (error) {
      if (error instanceof PaceWait) break; // aún no toca: la siguiente vuelta (30 s) lo envía
      results.push({ shotId: shot.shotId, status: 'stopped', error: safeError(error) });
      break; // Ante cualquier duda, no seguir gastando.
    }
  }
  return results;
}

/** Recupera (solo consulta) las tomas enviadas y, si hay hueco, envía la siguiente tanda ya autorizada. */
export async function resumeWholeScene(filmId: string, sceneLabel: string) {
  const plan = await scenePlan(filmId, sceneLabel);
  const results: Array<{ shotId: string; status: string; error?: string }> = [];
  for (const shot of plan.shots) {
    const record = await readShotRecord(filmId, shot.shotId);
    if (!record || record.provider !== 'veo' || !record.operationName || record.status === 'review-required') continue;
    try {
      const r = await resumeSceneShot(filmId, shot.shotId);
      results.push({ shotId: shot.shotId, status: r.status });
    } catch (error) {
      results.push({ shotId: shot.shotId, status: 'error', error: safeError(error) });
    }
  }
  let dispatched: Array<{ shotId: string; status: string; error?: string }> = [];
  if (!plan.legacy && !isFrozenFilm(filmId) && veoScenesEnabled() && veoSceneRate() !== null && sceneCapUsd() > 0) {
    dispatched = await withSceneLock(filmId, plan.sceneLabel, () => dispatchAuthorized(filmId, plan, sceneCapUsd()));
  }
  return { sceneLabel, results, dispatched };
}

// ---------- ritmo de envío (cuota de Google por minuto) ----------
/**
 * Google limita los PEDIDOS de video por minuto y por modelo (cuentas nuevas: 1/min).
 * Se espacian los envíos (compartido entre el estudio y los agentes vía un archivo):
 * V7_VEO_SUBMITS_PER_MINUTE (por defecto 1). Varias tomas pueden procesarse a la vez.
 */
export function veoSubmitIntervalMs() {
  const per = Number(process.env.V7_VEO_SUBMITS_PER_MINUTE || 1);
  return Number.isFinite(per) && per > 0 ? Math.ceil(60000 / Math.min(per, 60)) + 5000 : 0;
}
const paceFile = () => path.join(v7DataRoot(), 'ritmo-veo.json');
async function msUntilSubmitSlot() {
  const interval = veoSubmitIntervalMs();
  if (!interval) return 0;
  try {
    const last = Number(JSON.parse(await readFile(paceFile(), 'utf8')).ultimo) || 0;
    return Math.max(0, last + interval - Date.now());
  } catch { return 0; }
}
async function markSubmit() {
  await mkdir(path.dirname(paceFile()), { recursive: true });
  await writeFile(paceFile(), JSON.stringify({ ultimo: Date.now() }) + '\n');
}
export class PaceWait extends Error { constructor(public ms: number) { super('Esperando el turno de envío (límite por minuto de Google).'); } }

async function submitLocked(filmId: string, plan: Awaited<ReturnType<typeof scenePlan>>, shot: ScenePlanShot,
  revisionId: string, estimatedUsd: number, cap: number, redo = false, noWait = false) {
  const shotId = shot.shotId;
  // HARNESS DE CONTINUIDAD: una toma con personaje oficial no sale sin su foto de continuidad.
  {
    const { film } = await readV7FilmBundle(filmId);
    const entry = indexedScenes(film).flatMap((x) => x.shots).find((x) => x.label === shotId);
    const revision = await latestPromptRevision(filmId, shotId);
    if (entry) {
      const block = await continuityBlock({ film, serie: serieOf(film), shot: entry.shot, prompt: revision?.promptText ?? entry.shot.visualPrompt ?? '', label: shotId, referenceFile: shotReferencePath(filmId, shotId) });
      if (block) throw new Error(block);
    }
  }
  // Turno de envío: la cola de escena no espera (lo intenta en la siguiente vuelta); un envío directo espera su turno.
  const wait = await msUntilSubmitSlot();
  if (wait > 0) {
    if (noWait) throw new PaceWait(wait);
    await new Promise((r) => setTimeout(r, Math.min(wait, 75000)));
  }
  {
    const input = { revisionId };
    const revision = await latestPromptRevision(filmId, shotId);
    if (!revision || revision.revisionId !== input.revisionId) throw new Error('El prompt cambió: revisa y autoriza la versión más reciente.');
    const existing = await readShotRecord(filmId, shotId);
    if (existing) {
      const redoable = existing.status === 'failed-no-video' || existing.status === 'quota-rejected' ||
        (redo && existing.status === 'review-required');
      if (!redoable) {
        throw new Error('La toma ya tiene una operación (' + existing.status + '). Recupera la misma tarea; nunca se reenvía.');
      }
      if (redo && await fileExists(path.join(shotDir(filmId, shotId), 'artistic-approval.json'))) {
        throw new Error('La toma ya está aprobada artísticamente. No se rehace una toma aprobada.');
      }
      // Tras un rechazo por cuota se puede repetir el mismo texto: nunca se generó nada.
      if (existing.status !== 'quota-rejected' && existing.revisionId === revision.revisionId) {
        throw new Error('Esta versión ya se usó. Guarda una versión corregida antes de otro intento.');
      }
    }
    const exposure = await sceneExposureUsd(filmId, plan.sceneLabel);
    if (exposure + estimatedUsd > cap + 0.000001) {
      throw new Error('Tope de la escena alcanzado: US$' + exposure.toFixed(2) + ' de US$' + cap.toFixed(2) + '. Súbelo solo si lo decides tú (V7_SCENE_MAX_USD).');
    }
    if (existing) {
      await mkdir(attemptsDir(filmId, shotId), { recursive: true });
      const archivedName = existing.status === 'quota-rejected' ? existing.revisionId + '-cuota-' + Date.now() : existing.revisionId;
      if (existing.status === 'quota-rejected') {
        // Se archiva con costo 0: Google no creó ningún trabajo.
        await writeFile(path.join(attemptsDir(filmId, shotId), archivedName + '.json'),
          JSON.stringify({ ...existing, estimatedUsd: 0 }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        await unlink(recordPath(filmId, shotId));
      } else {
        await rename(recordPath(filmId, shotId), path.join(attemptsDir(filmId, shotId), archivedName + '.json'));
      }
      // El video anterior se archiva junto a su registro: nunca se borra.
      if (await fileExists(candidatePath(filmId, shotId))) {
        await rename(candidatePath(filmId, shotId), path.join(attemptsDir(filmId, shotId), existing.revisionId + '.mp4'));
      }
    }
    const reference = await optionalReference(filmId, shotId);
    const now = new Date().toISOString();
    const record: SceneVeoRecord = {
      schemaVersion: 1, provider: 'veo', filmId, shotId, sceneLabel: plan.sceneLabel,
      model: veoSceneModel(), platform: videoPlatform(), mode: reference ? 'image-to-video' : 'text-to-video',
      durationSeconds: shot.providerSeconds, estimatedUsd,
      revisionId: revision.revisionId, promptHash: revision.promptHash,
      referenceSha256: reference?.sha256 ?? null, status: 'reserved', createdAt: now, updatedAt: now
    };
    await mkdir(shotDir(filmId, shotId), { recursive: true });
    // Reserva atómica ANTES de llamar al proveedor; nunca se borra tras un error.
    await writeFile(recordPath(filmId, shotId), JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    try {
      if (isOmniModel(record.model)) {
        const interaction = await googleClient().interactions.create({
          model: record.model,
          input: [
            ...(reference ? [{ type: 'image' as const, data: reference.bytes.toString('base64'), mime_type: 'image/jpeg' as const }] : []),
            { type: 'text' as const, text: revision.promptText + (reference ? ' Use the supplied image as the opening frame.' : '') }
          ],
          response_format: { type: 'video', aspect_ratio: '16:9', delivery: 'uri', duration: shot.providerSeconds + 's' },
          background: true,
          store: true
        } as Parameters<ReturnType<typeof googleClient>['interactions']['create']>[0]) as { id?: string };
        if (!interaction.id) throw new Error('Google no devolvió el ID de la interacción; resultado incierto.');
        record.operationName = INTERACTION_PREFIX + interaction.id;
        record.status = 'submitted';
        await writeRecord(filmId, record);
        return { shotId, status: record.status, estimatedUsd, noAutomaticRetries: true };
      }
      // Lecciones aprendidas: se añaden al enviar (el texto guardado no cambia) y quedan anotadas.
      // Diálogo preparado para Veo (pausas «…» → coma, pronunciación de nombres) + lecciones aprendidas.
      const lessons = applyLessons(speakableDialogue(revision.promptText), activeLessons(await readCounts()));
      record.lessons = lessons.applied;
      await writeRecord(filmId, record);
      await markSubmit();
      const operation = await googleClient(record.platform).models.generateVideos({
        model: record.model,
        source: {
          prompt: lessons.text,
          ...(reference ? { image: { imageBytes: reference.bytes.toString('base64'), mimeType: 'image/jpeg' } } : {})
        },
        config: {
          aspectRatio: '16:9', numberOfVideos: 1, durationSeconds: shot.providerSeconds, resolution: '720p',
          personGeneration: reference || record.platform === 'vertex' ? 'allow_adult' : 'allow_all',
          // Veo tiende a incrustar subtítulos cuando hay diálogo: se prohíben de forma explícita.
          negativePrompt: [VEO_NEGATIVE_PROMPT, ...lessons.negative].join(', '),
          // Vertex: audio nativo (ambiente y diálogos en cámara con labios sincronizados).
          // AI Studio no acepta este parámetro (genera audio por defecto en Veo 3.x).
          ...(record.platform === 'vertex' ? { generateAudio: true } : {})
        }
      });
      if (!operation.name) throw new Error('Google no devolvió el ID de la operación; resultado incierto.');
      record.operationName = operation.name;
      record.status = 'submitted';
      await writeRecord(filmId, record);
      return { shotId, status: record.status, estimatedUsd, noAutomaticRetries: true };
    } catch (error) {
      // 429: rechazo por cuota, sin trabajo creado ni costo; se reintenta solo más tarde.
      // Otro 4xx: no creó trabajo; se permite otro intento con una versión corregida.
      record.status = quotaRejected(error) ? 'quota-rejected' : rejectedBeforeCreation(error) ? 'failed-no-video' : 'failed-unknown';
      if (record.status === 'quota-rejected') record.estimatedUsd = 0;
      record.error = safeError(error);
      await writeRecord(filmId, record);
      if (record.status === 'quota-rejected') throw new Error('Límite de Google por minuto (sin costo). Se reintentará solo: ' + record.error);
      throw new Error((record.status === 'failed-no-video' ? 'Google rechazó la solicitud (no se creó video): ' : 'Google no confirmó la solicitud. No se reenviará: ') + record.error);
    }
  }
}

// ---------- recuperar (gratis: solo consulta la misma operación) ----------

/**
 * Recupera la tarea de Google (gratis). Con redownload, vuelve a bajar el video de una toma ya terminada
 * cuyo archivo local se dañó (disco lleno, descarga cortada): el dañado se archiva, no se borra.
 */
export async function resumeSceneShot(filmId: string, shotId: string, opts: { redownload?: boolean } = {}) {
  const { plan } = await planShot(filmId, shotId);
  return withSceneLock(filmId, plan.sceneLabel, async () => {
    const record = await readShotRecord(filmId, shotId);
    if (!record || record.provider !== 'veo') throw new Error('No hay una operación de Veo que recuperar en ' + shotId + '.');
    if (record.status === 'review-required' && !opts.redownload) return { shotId, status: record.status, videoReady: true };
    if (!record.operationName) throw new Error('Solicitud sin ID de Google: resultado incierto. No reenviar; reconciliar.');
    if (record.operationName.startsWith(INTERACTION_PREFIX)) return resumeInteraction(googleClient('gemini'), filmId, record);
    const ai = googleClient(record.platform ?? 'gemini');
    // El SDK necesita una instancia real de operación (usa _fromAPIResponse); un objeto con solo
    // el nombre hace fallar la consulta y la toma se quedaría en «submitted» para siempre.
    const saved = new GenerateVideosOperation();
    saved.name = record.operationName;
    const operation = await ai.operations.getVideosOperation({ operation: saved });
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
      if (filtered) record.estimatedUsd = 0; // Google no cobra los videos bloqueados por su filtro.
      await writeRecord(filmId, record);
      return { shotId, status: record.status, videoReady: false, error: record.error };
    }
    const target = candidatePath(filmId, shotId);
    const temp = path.join(shotDir(filmId, shotId), '.veo-' + randomUUID() + '.mp4');
    try {
      if (video.videoBytes) {
        // Vertex AI sin bucket devuelve el video dentro de la respuesta.
        await writeFile(temp, Buffer.from(video.videoBytes, 'base64'), { flag: 'wx', mode: 0o600 });
      } else if (video.uri?.startsWith('gs://')) {
        throw new Error('El video quedó en Cloud Storage (' + video.uri.split('/')[2] + '); este estudio no usa buckets. Revisa la configuración de Vertex.');
      } else {
        await ai.files.download({ file: video, downloadPath: temp });
      }
      const { stdout } = await command('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', temp], { timeout: 30000 });
      const info = JSON.parse(stdout) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string }> };
      const seconds = Number(info.format?.duration ?? 0);
      if (seconds < 2 || !info.streams?.some((s) => s.codec_type === 'video')) {
        throw new Error('El video de Veo no supera la verificación técnica.');
      }
      if (opts.redownload && existsSync(target)) {
        await mkdir(attemptsDir(filmId, shotId), { recursive: true });
        await rename(target, path.join(attemptsDir(filmId, shotId), record.revisionId + '-danado-' + Date.now() + '.mp4'));
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

async function verifyAndPublish(filmId: string, record: SceneVeoRecord, temp: string) {
  const target = candidatePath(filmId, record.shotId);
  try {
    const { stdout } = await command('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', temp], { timeout: 30000 });
    const info = JSON.parse(stdout) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string }> };
    if (Number(info.format?.duration ?? 0) < 2 || !info.streams?.some((s) => s.codec_type === 'video')) {
      throw new Error('El video recibido no supera la verificación técnica.');
    }
    await rename(temp, target);
  } finally {
    await unlink(temp).catch(() => undefined);
  }
  record.status = 'review-required';
  record.candidateName = path.basename(target);
  delete record.error;
  await writeRecord(filmId, record);
  return { shotId: record.shotId, status: record.status, videoReady: true };
}

/** Consulta (gratis) una interacción de Gemini Omni ya creada; nunca crea otra. */
async function resumeInteraction(ai: ReturnType<typeof googleClient>, filmId: string, record: SceneVeoRecord) {
  const id = record.operationName!.slice(INTERACTION_PREFIX.length);
  const interaction = await ai.interactions.get(id) as {
    status?: string; output_video?: { data?: string; uri?: string; mime_type?: string };
    error?: unknown;
  };
  const status = String(interaction.status || '');
  if (['failed', 'cancelled', 'incomplete', 'budget_exceeded'].includes(status)) {
    record.status = 'failed-no-video';
    record.error = safeError('Gemini Omni terminó con estado ' + status + (interaction.error ? ': ' + JSON.stringify(interaction.error) : ''));
    await writeRecord(filmId, record);
    return { shotId: record.shotId, status: record.status, videoReady: false, error: record.error };
  }
  if (status !== 'completed') {
    record.status = 'processing';
    await writeRecord(filmId, record);
    return { shotId: record.shotId, status: record.status, videoReady: false };
  }
  const video = interaction.output_video;
  if (!video || (!video.data && !video.uri)) {
    record.status = 'failed-unknown';
    record.error = 'La interacción terminó sin video. Reconciliar antes de otro intento.';
    await writeRecord(filmId, record);
    return { shotId: record.shotId, status: record.status, videoReady: false, error: record.error };
  }
  const temp = path.join(shotDir(filmId, record.shotId), '.omni-' + randomUUID() + '.mp4');
  if (video.data) {
    await writeFile(temp, Buffer.from(video.data, 'base64'), { flag: 'wx', mode: 0o600 });
    return verifyAndPublish(filmId, record, temp);
  }
  const fileId = video.uri!.match(/files\/([a-z0-9-]+)/i)?.[1];
  if (!fileId) throw new Error('Gemini Omni devolvió una URI de video inválida.');
  const file = await ai.files.get({ name: 'files/' + fileId });
  const state = String(file.state || '').toUpperCase();
  if (state === 'FAILED') {
    record.status = 'failed-unknown';
    record.error = safeError('El archivo de video falló en Google: ' + (file.error?.message || 'FAILED'));
    await writeRecord(filmId, record);
    return { shotId: record.shotId, status: record.status, videoReady: false, error: record.error };
  }
  if (state !== 'ACTIVE') {
    record.status = 'processing';
    await writeRecord(filmId, record);
    return { shotId: record.shotId, status: record.status, videoReady: false };
  }
  await ai.files.download({ file: video as Parameters<typeof ai.files.download>[0]['file'], downloadPath: temp });
  return verifyAndPublish(filmId, record, temp);
}

async function fileExists(file: string) {
  try { return (await stat(file)).isFile(); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e; }
}
