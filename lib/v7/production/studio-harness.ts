/**
 * Los harness en el estudio: análisis inicial (gratis), fotos de continuidad y autocorrección en vivo.
 * Los trabajos largos corren en segundo plano (un proceso de los scripts) con su registro en disco.
 */
import { spawn } from 'node:child_process';
import { access, mkdir, open, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { filmKeyFor } from '@/lib/v7/presets/film-registry';
import { CONVIDADOS_DECORADOS } from '@/lib/v7/presets/convidados-reparto';
import { readV7FilmBundle, v7FilmRoot } from '@/lib/v7/storage/film-store';
import { indexedScenes } from './scene-approval-board';
import { latestPromptRevision, readShotRecord, savePromptRevision, shotReferencePath } from './scene-veo-engine';
import { isLocked, isRemoved, lockPath, lockShot, removeShot, restoreShot, unlockShot } from './shot-lock';
import { originalShotVideo } from './shot-current-video';
import { approvedSet, readSetSheet, setMasterPath } from './set-master';
import { characterKeyFromId, listSheets, serieOf } from './character-identity';
import { approvedSheets, continuityRequired } from './continuity-chain';
import { shotShows } from './character-reference';
import { preflightScene } from '@/lib/v7/qa/scene-preflight';

const exists = (f: string) => access(f).then(() => true, () => false);

/** ANÁLISIS INICIAL de una escena (gratis, sin llamar a ningún proveedor). */
export async function scenePreflight(filmId: string, sceneLabel: string) {
  const { film } = await readV7FilmBundle(filmId);
  const sc = indexedScenes(film).find((s) => s.label === sceneLabel);
  if (!sc) throw new Error('No existe la escena ' + sceneLabel);
  const serie = serieOf(film);
  const sheets = await listSheets(serie);
  const approved = new Set((await approvedSheets(serie)).map((s) => s.key));
  const costume = typeof sc.scene.metadata?.costume === 'string' ? sc.scene.metadata.costume : '';
  const required = continuityRequired(film);
  const inputs = [];
  const locked: string[] = [];
  for (const { shot, label } of sc.shots) {
    if (await isLocked(path.join(v7FilmRoot(filmId), label.toLowerCase()))) { locked.push(label); continue; }
    const prompt = (await latestPromptRevision(filmId, label).catch(() => null))?.promptText ?? shot.visualPrompt ?? '';
    // Solo personajes con imagen (ficha de la serie). Las voces sin imagen (Narrador, Voz desconocida…) no cuentan:
    // si no, «con voz masculina» haría creer que aparece la «Voz desconocida».
    const cast = shot.characterIds.map((id) => {
      const key = characterKeyFromId(id);
      const sheet = sheets.find((s) => s.key === key);
      return sheet ? { key, nombre: sheet.nombre, aprobado: approved.has(key) } : null;
    }).filter((c): c is { key: string; nombre: string; aprobado: boolean } => !!c && shotShows(c.nombre.replace(/^(el|la)\s+/i, '').split(/\s+/)[0], prompt));
    // El vestuario de la escena es el del protagonista: solo se exige en las tomas donde aparece.
    const protagonist = film.characters[0] ? characterKeyFromId(film.characters[0].id) : '';
    const showsProtagonist = cast.some((c) => c.key === protagonist);
    inputs.push({
      label, prompt, seconds: shot.durationSeconds, onCamera: shot.metadata?.onCameraDialogue === true, spokenText: shot.spokenText ?? '',
      costume: showsProtagonist ? costume : '', cast: cast.map(({ nombre, aprobado }) => ({ nombre, aprobado })), hasReference: await exists(shotReferencePath(filmId, label)), continuityRequired: required
    });
  }
  return { sceneLabel, ...preflightScene(inputs), fijadas: locked };
}

/** Guarda el texto sugerido por el análisis en las tomas que aún no tienen video (gratis). */
export async function applyPreflight(filmId: string, sceneLabel: string) {
  const report = await scenePreflight(filmId, sceneLabel);
  const applied: string[] = [];
  for (const t of report.tomas) {
    if (!t.promptSugerido) continue;
    const rec = await readShotRecord(filmId, t.label).catch(() => null);
    if (rec && rec.status === 'review-required') continue; // ya tiene video: se corrige con la autocorrección
    await savePromptRevision(filmId, t.label, t.promptSugerido);
    applied.push(t.label);
  }
  return { applied };
}

// ---------- trabajos en segundo plano ----------

export const HARNESS_JOBS = ['continuidad', 'autocorreccion', 'musica', 'montar', 'voces', 'rehacer', 'decorado', 'decorado-aprobar', 'montar-episodio'] as const;
export type HarnessJobKind = typeof HARNESS_JOBS[number];
export const HARNESS_JOB_NAMES: Record<HarnessJobKind, string> = {
  continuidad: 'Fotos de continuidad', autocorreccion: 'Autocorrección en vivo', musica: 'Música de la escena',
  montar: 'Montar el avance', voces: 'Voces en off', rehacer: 'Rehacer tomas', decorado: 'Plano maestro del salón', 'decorado-aprobar': 'Aprobar el salón', 'montar-episodio': 'Montar el episodio completo'
};
const jobFile = (filmId: string, scene: string) => path.join(v7FilmRoot(filmId), 'harness', `${scene.toLowerCase()}-trabajo.json`);
const logFile = (filmId: string, scene: string, kind: HarnessJobKind) => path.join(v7FilmRoot(filmId), 'harness', `${scene.toLowerCase()}-${kind}.log`);

function alive(pid: number) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export async function harnessJob(filmId: string, scene: string) {
  try {
    const job = JSON.parse(await readFile(jobFile(filmId, scene), 'utf8')) as { kind: HarnessJobKind; pid: number; startedAt: string };
    const log = await readFile(logFile(filmId, scene, job.kind), 'utf8').catch(() => '');
    return { ...job, running: alive(job.pid), log: log.split(/\r?\n/).slice(-60).join('\n') };
  } catch { return null; }
}

/** Lanza un harness para la escena. Nunca dos a la vez en la misma escena. */
export async function startHarnessJob(filmId: string, scene: string, kind: HarnessJobKind, opts: { budgetUsd?: number; shots?: string[] } = {}) {
  if (!/^E\d{2}$/.test(scene) && !(scene === 'EPISODIO' && kind === 'montar-episodio')) throw new Error('Escena inválida.');
  const key = filmKeyFor(filmId);
  if (!key) throw new Error('Esta película no está registrada para los agentes (lib/v7/presets/film-registry.ts).');
  const current = await harnessJob(filmId, scene);
  if (current?.running) throw new Error(`Ya hay un trabajo de «${current.kind}» en marcha en ${scene}.`);
  const budget = Math.max(0, Math.min(50, Number(opts.budgetUsd ?? 5) || 0));
  const shots = (opts.shots ?? []).filter((x) => /^E\d{2}-P\d{2}$/.test(x) && x.startsWith(scene + '-'));
  if (kind === 'rehacer' && !shots.length) throw new Error('Indica qué tomas rehacer.');
  const args: Record<HarnessJobKind, string[]> = {
    continuidad: ['scripts/continuidad.ts', key, '--escena', scene, '--generar'],
    autocorreccion: ['scripts/vigilar.ts', key, '--escena', scene, '--hasta', budget.toFixed(2)],
    musica: ['scripts/musica.ts', key, '--escena', scene, '--generar'],
    montar: ['scripts/pelicula-final.ts', 'montar', key, '--escena', scene],
    voces: ['scripts/pelicula-final.ts', 'voces', key, '--generar'],
    rehacer: ['scripts/rehacer.ts', key, '--tomas', shots.join(','), '--hasta', budget.toFixed(2)],
    decorado: ['scripts/decorado.ts', key, '--generar'],
    'decorado-aprobar': ['scripts/decorado.ts', key, '--aprobar'],
    'montar-episodio': ['scripts/pelicula-final.ts', 'montar', key, '--ingles']
  };
  await mkdir(path.dirname(jobFile(filmId, scene)), { recursive: true });
  const out = await open(logFile(filmId, scene, kind), 'w');
  const child = spawn(process.execPath, ['--import', 'tsx', ...args[kind]], {
    cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'development' }, detached: true, stdio: ['ignore', out.fd, out.fd], windowsHide: true
  });
  child.unref();
  await out.close();
  const job = { kind, pid: child.pid ?? 0, startedAt: new Date().toISOString(), budgetUsd: kind === 'autocorreccion' || kind === 'rehacer' ? budget : 0 };
  await writeFile(jobFile(filmId, scene), JSON.stringify(job, null, 2) + '\n');
  return job;
}

// ---------- aprobar, quitar y ver ----------

/** El autor aprueba la escena: fija todas sus tomas con video (las quitadas siguen fuera). */
export async function approveScene(filmId: string, sceneLabel: string) {
  const { film } = await readV7FilmBundle(filmId);
  const sc = indexedScenes(film).find((s) => s.label === sceneLabel);
  if (!sc) throw new Error('No existe la escena ' + sceneLabel);
  const done: string[] = [];
  for (const { label } of sc.shots) {
    const dir = path.join(v7FilmRoot(filmId), label.toLowerCase());
    if (await originalShotVideo(dir, label)) { await lockShot(dir, 'escena aprobada por el autor en el estudio'); done.push(label); }
  }
  return { fijadas: done };
}

/** Acciones del autor sobre una toma: aprobar (fijar), soltar, quitar del montaje o devolverla. */
export async function shotAuthorAction(filmId: string, shotId: string, action: 'fijar' | 'soltar' | 'quitar' | 'devolver') {
  if (!/^E\d{2}-P\d{2}$/.test(shotId)) throw new Error('Toma inválida.');
  const dir = path.join(v7FilmRoot(filmId), shotId.toLowerCase());
  if (action === 'fijar') await lockShot(dir, 'aprobada por el autor en el estudio');
  if (action === 'soltar') await unlockShot(dir);
  if (action === 'quitar') await removeShot(dir, 'el autor la quitó en el estudio');
  if (action === 'devolver') await restoreShot(dir);
  return { shotId, action };
}

/** Último avance montado de la escena (MP4), si existe. */
export async function latestAvance(filmId: string, sceneLabel: string) {
  const dir = path.join(v7FilmRoot(filmId), 'final');
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.startsWith(`avance-${sceneLabel}-`) && f.endsWith('.mp4')).sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

/** Plano maestro del decorado de la película (aprobado o no), para verlo en el estudio. */
export async function setMasterInfo(filmId: string) {
  const { film } = await readV7FilmBundle(filmId);
  const key = typeof film.metadata?.decorado === 'string' ? film.metadata.decorado : '';
  if (!key) return null;
  const serie = serieOf(film);
  const sheet = await readSetSheet(serie, key);
  const file = setMasterPath(serie, key);
  return { key, nombre: sheet?.nombre ?? CONVIDADOS_DECORADOS.find((d) => d.key === key)?.nombre ?? key, aprobado: Boolean(sheet?.aprobado && (await approvedSet(film, serie))), existe: await exists(file), file };
}

// ---------- escenas en verde: montaje automático (gratis) ----------

/** Último episodio completo montado (sin la versión con subtítulos grabados). */
export async function latestEpisode(filmId: string) {
  const dir = path.join(v7FilmRoot(filmId), 'final');
  const files = (await readdir(dir).catch(() => [] as string[]))
    .filter((f) => f.endsWith('.mp4') && !f.startsWith('avance-') && !f.includes('-subtitulada')).sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}
const mtime = (f: string) => stat(f).then((x) => x.mtimeMs, () => 0);

/**
 * Estado de cada escena: VERDE cuando todas sus tomas están fijadas (o quitadas por el autor).
 * Una escena verde se monta sola (gratis) si su avance falta o es anterior a la última fijación;
 * con todas las escenas verdes, se monta solo el episodio completo.
 */
export async function greenStatus(filmId: string, opts: { autoMount?: boolean } = {}) {
  const { film } = await readV7FilmBundle(filmId);
  const root = v7FilmRoot(filmId);
  const scenes = [];
  let newestLock = 0;
  for (const sc of indexedScenes(film)) {
    let fijadas = 0; let quitadas = 0; let sceneLock = 0;
    for (const { label } of sc.shots) {
      const dir = path.join(root, label.toLowerCase());
      if (await isRemoved(dir)) { quitadas++; continue; }
      if (await isLocked(dir)) { fijadas++; sceneLock = Math.max(sceneLock, await mtime(lockPath(dir))); }
    }
    const total = sc.shots.length;
    const verde = fijadas > 0 && fijadas + quitadas === total;
    const avance = await latestAvance(filmId, sc.label);
    const avanceAlDia = !!avance && (await mtime(avance)) >= sceneLock;
    newestLock = Math.max(newestLock, sceneLock);
    let montando = false;
    if (opts.autoMount && verde && !avanceAlDia) {
      const job = await harnessJob(filmId, sc.label);
      if (!job?.running) { await startHarnessJob(filmId, sc.label, 'montar').catch(() => undefined); }
      montando = true;
    }
    scenes.push({ label: sc.label, titulo: sc.scene.title, total, fijadas, quitadas, verde, avance: avance ? path.basename(avance) : null, avanceAlDia, montando });
  }
  const episodioVerde = scenes.length > 0 && scenes.every((x) => x.verde);
  const ep = await latestEpisode(filmId);
  const episodioAlDia = !!ep && (await mtime(ep)) >= newestLock;
  let episodioMontando = false;
  if (opts.autoMount && episodioVerde && !episodioAlDia) {
    const job = await harnessJob(filmId, 'EPISODIO');
    if (!job?.running) await startHarnessJob(filmId, 'EPISODIO', 'montar-episodio').catch(() => undefined);
    episodioMontando = true;
  }
  if (episodioVerde && !episodioMontando) episodioMontando = (await harnessJob(filmId, 'EPISODIO'))?.running === true;
  return { scenes, episodio: { verde: episodioVerde, archivo: ep ? path.basename(ep) : null, alDia: episodioAlDia, montando: episodioMontando } };
}
