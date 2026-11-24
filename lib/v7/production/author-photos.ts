/**
 * FOTOS DEL AUTOR: el autor sube su propia foto para una toma (o varias para una escena) y Veo parte de ella
 * (imagen a video). Una foto del autor manda: el Harness de Continuidad nunca la sustituye.
 */
import { execFile } from 'node:child_process';
import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readV7FilmBundle, v7FilmRoot } from '@/lib/v7/storage/film-store';
import { indexedScenes } from './scene-approval-board';
import { shotReferencePath } from './scene-veo-engine';
import { isLocked, isRemoved } from './shot-lock';
import { archiveFile } from './gemini-image';

const run = promisify(execFile);
const exists = (f: string) => access(f).then(() => true, () => false);
export const authorPhotoMarker = (dir: string) => path.join(dir, 'foto-del-autor.json');
export const hasAuthorPhoto = (dir: string) => exists(authorPhotoMarker(dir));

/** A qué toma va cada foto: «…P03…» en el nombre la manda a esa toma; las demás, en orden, a las tomas libres. */
export function assignPhotos(names: string[], sceneLabel: string, freeShots: string[], allShots: string[]) {
  const out: Array<{ name: string; shotId: string | null }> = [];
  const used = new Set<string>();
  for (const name of names) {
    const m = /(?:^|[^a-z0-9])p[-_ ]?(\d{1,2})(?![0-9])/i.exec(name);
    const id = m ? `${sceneLabel}-P${m[1].padStart(2, '0')}` : null;
    if (id && allShots.includes(id)) { out.push({ name, shotId: id }); used.add(id); } else out.push({ name, shotId: null });
  }
  const queue = freeShots.filter((s) => !used.has(s));
  for (const o of out) if (!o.shotId) o.shotId = queue.shift() ?? null;
  return out;
}

/** Convierte la foto a 1280×720 (lo que Veo espera) y la deja como foto de partida de la toma. */
export async function saveAuthorPhoto(filmId: string, shotId: string, data: Buffer, originalName: string) {
  const dir = path.join(v7FilmRoot(filmId), shotId.toLowerCase());
  if (await isLocked(dir)) throw new Error(`${shotId} está FIJADA: no se cambia su foto.`);
  await mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `subida-${randomUUID()}${path.extname(originalName).toLowerCase() || '.jpg'}`);
  await writeFile(tmp, data);
  const out = shotReferencePath(filmId, shotId);
  const next = out + '.nueva.jpg';
  try {
    await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', tmp, '-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720', '-frames:v', '1', '-q:v', '2', next]);
  } catch { await rm(next, { force: true }); throw new Error(`«${originalName}» no es una imagen válida (usa JPG, PNG o WEBP).`); }
  finally { await rm(tmp, { force: true }); }
  await archiveFile(out);
  await rename(next, out);
  await writeFile(authorPhotoMarker(dir), JSON.stringify({ shotId, original: originalName, fecha: new Date().toISOString() }, null, 2) + '\n');
  return { shotId, file: out };
}

/** Sube varias fotos a una escena y las reparte entre sus tomas. */
export async function uploadScenePhotos(filmId: string, sceneLabel: string, files: Array<{ name: string; data: Buffer }>, onlyShot?: string) {
  const { film } = await readV7FilmBundle(filmId);
  const sc = indexedScenes(film).find((s) => s.label === sceneLabel);
  if (!sc) throw new Error('No existe la escena ' + sceneLabel);
  const all = sc.shots.map((s) => s.label);
  const free: string[] = [];
  for (const id of all) {
    const dir = path.join(v7FilmRoot(filmId), id.toLowerCase());
    if (!(await isLocked(dir)) && !(await isRemoved(dir)) && !(await hasAuthorPhoto(dir))) free.push(id);
  }
  const plan = onlyShot ? files.map((f) => ({ name: f.name, shotId: all.includes(onlyShot) ? onlyShot : null })) : assignPhotos(files.map((f) => f.name), sceneLabel, free, all);
  const results: Array<{ name: string; shotId: string | null; ok: boolean; error?: string }> = [];
  for (const [i, p] of plan.entries()) {
    if (!p.shotId) { results.push({ name: p.name, shotId: null, ok: false, error: 'no quedan tomas libres en la escena' }); continue; }
    try { await saveAuthorPhoto(filmId, p.shotId, files[i].data, p.name); results.push({ name: p.name, shotId: p.shotId, ok: true }); }
    catch (e) { results.push({ name: p.name, shotId: p.shotId, ok: false, error: (e as Error).message }); }
  }
  return { results };
}
