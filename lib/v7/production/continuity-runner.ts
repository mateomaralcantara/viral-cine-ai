/**
 * Ejecuta el Harness de Continuidad sobre una película (lo usan el script y el estudio).
 */
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readV7FilmBundle, v7FilmRoot } from '@/lib/v7/storage/film-store';
import { indexedScenes } from './scene-approval-board';
import { latestPromptRevision, savePromptRevision, shotReferencePath } from './scene-veo-engine';
import { currentShotVideo } from './shot-current-video';
import { isLocked } from './shot-lock';
import { masterPath, serieOf, type CharacterSheet } from './character-identity';
import { anchorCandidates, approvedSheets, castInShot, continuityKeyframePrompt, extractAnchorFrame } from './continuity-chain';
import { GeminiImageMaker, IMAGE_USD, imageRef } from './gemini-image';
import { activeLessons, applyLessons, readCounts } from '@/lib/v7/qa/lessons';
import { approvedSet } from './set-master';

const exists = (f: string) => access(f).then(() => true, () => false);

export type ContinuityJob = { label: string; prompt: string; cast: CharacterSheet[]; anchor: string | null; costume: string;
  set: { nombre: string; descripcion: string; file: string } | null };

const plain = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Qué tomas necesitan foto de continuidad y con qué ancla. No gasta nada. */
export async function planContinuity(filmId: string, opts: { scene?: string; shots?: string[]; repeat?: boolean } = {}) {
  const { film } = await readV7FilmBundle(filmId);
  const serie = serieOf(film);
  const approved = await approvedSheets(serie);
  // Plano maestro del decorado: se usa en toda toma cuyo texto nombra ese lugar (p. ej. «salón del Ágape»).
  const set = await approvedSet(film, serie);
  const root = v7FilmRoot(filmId);
  const scenes = indexedScenes(film);
  const prompts = new Map<string, string>();
  for (const sc of scenes) for (const s of sc.shots) prompts.set(s.label, (await latestPromptRevision(filmId, s.label).catch(() => null))?.promptText ?? s.shot.visualPrompt ?? '');
  const jobs: ContinuityJob[] = [];
  const skipped: string[] = [];
  for (const sc of scenes) {
    if (opts.scene && sc.label !== opts.scene) continue;
    const costume = typeof sc.scene.metadata?.costume === 'string' ? sc.scene.metadata.costume : '';
    for (const s of sc.shots) {
      if (opts.shots?.length && !opts.shots.includes(s.label)) continue;
      const dir = path.join(root, s.label.toLowerCase());
      if (await isLocked(dir)) continue;
      // La foto que sube el autor manda: nunca se sustituye por una de continuidad.
      if (await exists(path.join(dir, 'foto-del-autor.json'))) { skipped.push(s.label); continue; }
      const prompt = prompts.get(s.label) ?? '';
      const cast = castInShot(s.shot, prompt, approved).slice(0, 3);
      // El texto nombra el lugar si contiene sus palabras clave («salón … del Ágape»).
      const inSet = set && plain(set.nombre).split(/[^a-z0-9]+/).filter((w) => w.length > 3).every((w) => plain(prompt).includes(w)) ? set : null;
      if (!cast.length && !inSet) continue;
      if (!opts.repeat && !opts.shots?.length && await exists(shotReferencePath(filmId, s.label))) { skipped.push(s.label); continue; }
      let anchor: string | null = null;
      if (cast.length) for (const c of anchorCandidates(scenes, s.label, cast.map((x) => x.key), (x) => prompts.get(x.label) ?? '', approved)) {
        const cdir = path.join(root, c.toLowerCase());
        if (await isLocked(cdir) && await currentShotVideo(cdir, c)) { anchor = c; break; }
      }
      jobs.push({ label: s.label, prompt, cast, anchor, costume: cast.length ? costume : '', set: inSet ? { nombre: inSet.nombre, descripcion: inSet.descripcion, file: inSet.file } : null });
    }
  }
  return { serie, approved, set, jobs, skipped, costUsd: Math.round(jobs.length * IMAGE_USD * 100) / 100 };
}

/** Crea las fotos de continuidad (~US$0.04 cada una) y guarda una versión nueva del texto. */
export async function makeContinuity(filmId: string, serie: string, jobs: ContinuityJob[], log: (s: string) => void = console.log) {
  const root = v7FilmRoot(filmId);
  const maker = new GeminiImageMaker();
  const lessons = activeLessons(await readCounts());
  const done: string[] = [];
  const failed: Array<{ label: string; error: string }> = [];
  for (const j of jobs) {
    try {
      const refs = await Promise.all(j.cast.map((c) => imageRef(masterPath(serie, c.key))));
      if (j.set) refs.push(await imageRef(j.set.file));
      if (j.anchor) {
        const adir = path.join(root, j.anchor.toLowerCase());
        const video = (await currentShotVideo(adir, j.anchor))!.file;
        const frame = path.join(root, j.label.toLowerCase(), 'continuidad', `${j.label}-ancla-${j.anchor}.jpg`);
        await mkdir(path.dirname(frame), { recursive: true });
        refs.push(await imageRef(await extractAnchorFrame(video, frame)));
      }
      const text = applyLessons(j.prompt, lessons).text;
      await maker.make(refs, continuityKeyframePrompt(j.cast.map((c) => ({ nombre: c.nombre, descripcion: c.descripcion })), text, { anchorLabel: j.anchor ?? undefined, costume: j.costume, set: j.set ?? undefined }), shotReferencePath(filmId, j.label));
      await savePromptRevision(filmId, j.label, j.prompt);
      await writeFile(path.join(root, j.label.toLowerCase(), 'continuidad.json'), JSON.stringify({ label: j.label, personajes: j.cast.map((c) => c.key), decorado: j.set?.nombre ?? null, ancla: j.anchor, fecha: new Date().toISOString() }, null, 2) + '\n');
      done.push(j.label);
      log(`  ${j.label}: foto de continuidad lista (${[j.cast.map((c) => c.nombre).join(' + '), j.set ? 'decorado ' + j.set.nombre : ''].filter(Boolean).join(' · ')}${j.anchor ? `, continúa de ${j.anchor}` : ''})`);
      await new Promise((r) => setTimeout(r, 4000));
    } catch (e) {
      failed.push({ label: j.label, error: (e as Error).message });
      log(`  ${j.label}: ERROR ${(e as Error).message}`);
    }
  }
  return { done, failed };
}
