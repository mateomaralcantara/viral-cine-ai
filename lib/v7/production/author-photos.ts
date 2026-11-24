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

/**
 * PLANO FIJO CON LA FOTO DEL AUTOR (gratis, sin Veo): la foto con un acercamiento lento de cine,
 * de la duración de la toma. Para imágenes que Veo no acepta (p. ej. una escena del crimen) o cuando
 * la foto ya es exactamente el plano que el autor quiere. La toma queda FIJADA (aprobada por el autor).
 */
export async function makeStillShot(filmId: string, shotId: string) {
  const { film } = await readV7FilmBundle(filmId);
  const entry = indexedScenes(film).flatMap((x) => x.shots).find((x) => x.label === shotId);
  if (!entry) throw new Error('No existe la toma ' + shotId);
  const dir = path.join(v7FilmRoot(filmId), shotId.toLowerCase());
  const ref = shotReferencePath(filmId, shotId);
  if (!(await exists(ref))) throw new Error(shotId + ' no tiene foto: súbela primero con «Subir mi foto».');
  const seconds = Math.max(2, entry.shot.durationSeconds);
  const frames = Math.round(seconds * 24);
  const out = path.join(dir, shotId + '-plano-fijo.mp4');
  const tmp = out + '.tmp.mp4';
  // Acercamiento lento y centrado (Ken Burns) en alta resolución para que no tiemble.
  const zoom = `scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,zoompan=z='min(1+0.10*on/${frames},1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=24,format=yuv420p`;
  await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-loop', '1', '-i', ref, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
    '-filter_complex', `[0:v]${zoom}[v]`, '-map', '[v]', '-map', '1:a', '-t', String(seconds), '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-c:a', 'aac', '-shortest', tmp]);
  await rename(tmp, out);
  await writeFile(path.join(dir, 'fijada.json'), JSON.stringify({ fijada: true, motivo: 'plano fijo con la foto del autor (sin Veo)', fecha: new Date().toISOString() }, null, 2) + '\n');
  return { shotId, seconds, file: out };
}

/** Quitar el plano fijo: la toma vuelve a usar su video de Veo (si lo tiene) y queda libre para cambios. */
export async function removeStillShot(filmId: string, shotId: string) {
  const dir = path.join(v7FilmRoot(filmId), shotId.toLowerCase());
  await archiveFile(path.join(dir, shotId + '-plano-fijo.mp4'));
  await rm(path.join(dir, 'fijada.json'), { force: true });
  return { shotId };
}
