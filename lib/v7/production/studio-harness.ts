/**
 * Los harness en el estudio: análisis inicial (gratis), fotos de continuidad y autocorrección en vivo.
 * Los trabajos largos corren en segundo plano (un proceso de los scripts) con su registro en disco.
 */
import { spawn } from 'node:child_process';
import { access, mkdir, open, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { filmKeyFor } from '@/lib/v7/presets/film-registry';
import { readV7FilmBundle, v7FilmRoot } from '@/lib/v7/storage/film-store';
import { indexedScenes } from './scene-approval-board';
import { latestPromptRevision, readShotRecord, savePromptRevision, shotReferencePath } from './scene-veo-engine';
import { isLocked } from './shot-lock';
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
    const cast = shot.characterIds.map((id) => {
      const key = characterKeyFromId(id);
      const sheet = sheets.find((s) => s.key === key);
      const name = sheet?.nombre ?? film.characters.find((c) => c.id === id)?.name ?? key;
      return { key, nombre: name, aprobado: approved.has(key) };
    }).filter((c) => shotShows(c.nombre.replace(/^(el|la)\s+/i, '').split(/\s+/)[0], prompt));
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

export type HarnessJobKind = 'continuidad' | 'autocorreccion';
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
export async function startHarnessJob(filmId: string, scene: string, kind: HarnessJobKind, opts: { budgetUsd?: number } = {}) {
  if (!/^E\d{2}$/.test(scene)) throw new Error('Escena inválida.');
  const key = filmKeyFor(filmId);
  if (!key) throw new Error('Esta película no está registrada para los agentes (lib/v7/presets/film-registry.ts).');
  const current = await harnessJob(filmId, scene);
  if (current?.running) throw new Error(`Ya hay un trabajo de «${current.kind}» en marcha en ${scene}.`);
  const budget = Math.max(0, Math.min(50, Number(opts.budgetUsd ?? 5) || 0));
  const args = kind === 'continuidad'
    ? ['scripts/continuidad.ts', key, '--escena', scene, '--generar']
    : ['scripts/vigilar.ts', key, '--escena', scene, '--hasta', budget.toFixed(2)];
  await mkdir(path.dirname(jobFile(filmId, scene)), { recursive: true });
  const out = await open(logFile(filmId, scene, kind), 'w');
  const child = spawn(process.execPath, ['--import', 'tsx', ...args], {
    cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'development' }, detached: true, stdio: ['ignore', out.fd, out.fd], windowsHide: true
  });
  child.unref();
  await out.close();
  const job = { kind, pid: child.pid ?? 0, startedAt: new Date().toISOString(), budgetUsd: kind === 'autocorreccion' ? budget : 0 };
  await writeFile(jobFile(filmId, scene), JSON.stringify(job, null, 2) + '\n');
  return job;
}
