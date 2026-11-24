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
import { touchSceneChange } from './scene-changes';

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
  await touchSceneChange(filmId, shotId, 'plano fijo ' + shotId);
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
  await touchSceneChange(filmId, shotId, 'quitar material ' + shotId);
  const dir = path.join(v7FilmRoot(filmId), shotId.toLowerCase());
  await archiveFile(path.join(dir, shotId + '-plano-fijo.mp4'));
  await rm(path.join(dir, 'fijada.json'), { force: true });
  return { shotId };
}

/**
 * USAR EL VIDEO DE VEO: quita el material del autor de la toma (queda archivado) y deja FIJADA la toma
 * con su video de Veo (el de «Ver video de Veo»). Así entra en la película el video generado.
 */
export async function useVeoVideo(filmId: string, shotId: string) {
  const dir = path.join(v7FilmRoot(filmId), shotId.toLowerCase());
  const veo = [shotId + '-veo-candidato.mp4', shotId + '-runway-gen4-turbo.mp4'].map((f) => path.join(dir, f));
  if (!(await Promise.all(veo.map(exists))).some(Boolean)) throw new Error(shotId + ' no tiene video de Veo.');
  await removeStillShot(filmId, shotId);
  await writeFile(path.join(dir, 'fijada.json'), JSON.stringify({ fijada: true, motivo: 'el autor eligió el video de Veo', fecha: new Date().toISOString() }, null, 2) + '\n');
  await touchSceneChange(filmId, shotId, 'usar video de Veo ' + shotId);
  return { shotId };
}

// ---------- MATERIAL DEL AUTOR: varias fotos y/o videos cortos para una toma (sin Veo) ----------

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;
export const isVideoName = (name: string, type = '') => /^video\//.test(type) || VIDEO_EXT.test(name);
const MAX_CLIP_SECONDS = 20;

async function probeSeconds(file: string) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(stdout.trim()) || 0;
}
async function hasAudioStream(file: string) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file]).catch(() => ({ stdout: '' }));
  return stdout.trim().length > 0;
}

/** Cuánto dura cada foto: el tiempo de la toma que no ocupan los videos, repartido (mínimo 2 s por foto). */
export function photoSeconds(shotSeconds: number, photos: number, videoSeconds: number) {
  if (!photos) return 0;
  return Math.max(2, Math.round(((Math.max(shotSeconds - videoSeconds, 0)) / photos) * 100) / 100);
}

/**
 * Une las fotos y videos del autor (en el orden en que se subieron) en un solo plano de la toma:
 * fotos con acercamiento lento, videos a 1280×720 y 24 fps (máx. 20 s cada uno, con su sonido), cortes suaves.
 * No pasa por Veo, es gratis y la toma queda FIJADA. Lo anterior se archiva, no se borra.
 */
export async function buildAuthorMaterial(filmId: string, shotId: string, files: Array<{ name: string; data: Buffer; type?: string }>) {
  await touchSceneChange(filmId, shotId, 'material ' + shotId);
  const { film } = await readV7FilmBundle(filmId);
  const entry = indexedScenes(film).flatMap((x) => x.shots).find((x) => x.label === shotId);
  if (!entry) throw new Error('No existe la toma ' + shotId);
  if (!files.length) throw new Error('No llegó ningún archivo.');
  const dir = path.join(v7FilmRoot(filmId), shotId.toLowerCase());
  const work = path.join(dir, 'material-autor', new Date().toISOString().replace(/\D/g, '').slice(0, 14));
  await mkdir(work, { recursive: true });

  const saved: Array<{ file: string; video: boolean; seconds: number }> = [];
  for (const [i, f] of files.entries()) {
    const safe = String(i + 1).padStart(2, '0') + '-' + f.name.replace(/[^\w.-]/g, '_').slice(-60);
    const file = path.join(work, safe);
    await writeFile(file, f.data);
    const video = isVideoName(f.name, f.type);
    saved.push({ file, video, seconds: video ? Math.min(MAX_CLIP_SECONDS, await probeSeconds(file).catch(() => 0)) : 0 });
    if (video && !saved[saved.length - 1].seconds) throw new Error(`«${f.name}» no es un video válido (usa MP4, MOV o WEBM).`);
  }
  const shotSeconds = Math.max(2, entry.shot.durationSeconds);
  const per = photoSeconds(shotSeconds, saved.filter((x) => !x.video).length, saved.reduce((n, x) => n + x.seconds, 0));

  const parts: string[] = [];
  for (const [i, item] of saved.entries()) {
    const out = path.join(work, `parte-${String(i + 1).padStart(2, '0')}.mp4`);
    const secs = item.video ? item.seconds : per;
    const fade = `fade=t=in:st=0:d=0.25,fade=t=out:st=${Math.max(0, secs - 0.25).toFixed(2)}:d=0.25`;
    if (item.video) {
      const audio = await hasAudioStream(item.file);
      await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', item.file, ...(audio ? [] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']),
        '-filter_complex', `[0:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=24,format=yuv420p,${fade}[v]`,
        '-map', '[v]', '-map', audio ? '0:a:0' : '1:a', '-t', secs.toFixed(2), '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-shortest', out]);
    } else {
      const frames = Math.round(secs * 24);
      const zoom = `scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,zoompan=z='min(1+0.10*on/${frames},1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=24,format=yuv420p,${fade}`;
      await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-loop', '1', '-i', item.file, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
        '-filter_complex', `[0:v]${zoom}[v]`, '-map', '[v]', '-map', '1:a', '-t', secs.toFixed(2), '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-shortest', out])
        .catch(() => { throw new Error(`«${path.basename(item.file).slice(3)}» no es una imagen válida (usa JPG, PNG o WEBP).`); });
    }
    parts.push(out);
  }
  const list = path.join(work, 'lista.txt');
  await writeFile(list, parts.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  const final = path.join(dir, shotId + '-plano-fijo.mp4');
  const tmp = final + '.tmp.mp4';
  await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', tmp]);
  await archiveFile(final);
  await rename(tmp, final);
  for (const p of parts) await rm(p, { force: true });
  await writeFile(path.join(dir, 'fijada.json'), JSON.stringify({ fijada: true, motivo: `material del autor (${saved.length} archivo/s, sin Veo)`, fecha: new Date().toISOString() }, null, 2) + '\n');
  return { shotId, archivos: saved.length, fotos: saved.filter((x) => !x.video).length, videos: saved.filter((x) => x.video).length, seconds: Math.round(await probeSeconds(final) * 10) / 10 };
}

// ---------- VERSIONES ANTERIORES de una toma: verlas y volver a una ----------

export type ShotVersion = { id: string; tipo: 'veo' | 'material'; fecha: string; bytes: number };

/** Videos anteriores de la toma (Veo archivados al rehacer y material tuyo reemplazado), del más nuevo al más viejo. */
export async function listShotVersions(filmId: string, shotId: string): Promise<ShotVersion[]> {
  const dir = path.join(v7FilmRoot(filmId), shotId.toLowerCase());
  const out: ShotVersion[] = [];
  const { readdir, stat } = await import('node:fs/promises');
  for (const [sub, tipo] of [['veo-attempts', 'veo'], ['archivo', 'material']] as const) {
    const names = await readdir(path.join(dir, sub)).catch(() => [] as string[]);
    for (const n of names.filter((x) => x.endsWith('.mp4'))) {
      if (sub === 'archivo' && !n.includes('-plano-fijo')) continue;
      const st = await stat(path.join(dir, sub, n));
      out.push({ id: sub + '/' + n, tipo, fecha: st.mtime.toISOString(), bytes: st.size });
    }
  }
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Ruta segura de una versión (solo ids que existen en la lista). */
export async function shotVersionFile(filmId: string, shotId: string, id: string) {
  const known = await listShotVersions(filmId, shotId);
  if (!known.some((v) => v.id === id)) throw new Error('Esa versión no existe.');
  return path.join(v7FilmRoot(filmId), shotId.toLowerCase(), id);
}

/**
 * Volver a una versión anterior: pasa a ser el video de la toma (lo que entra en la película) y la toma queda FIJADA.
 * El video actual no se borra: si era material tuyo se archiva; si era de Veo, sigue en su sitio por debajo.
 */
export async function restoreShotVersion(filmId: string, shotId: string, id: string) {
  await touchSceneChange(filmId, shotId, 'version ' + shotId);
  const src = await shotVersionFile(filmId, shotId, id);
  const dir = path.join(v7FilmRoot(filmId), shotId.toLowerCase());
  const target = path.join(dir, shotId + '-plano-fijo.mp4');
  const { copyFile } = await import('node:fs/promises');
  await archiveFile(target);
  await copyFile(src, target);
  await writeFile(path.join(dir, 'fijada.json'), JSON.stringify({ fijada: true, motivo: 'el autor volvió a una versión anterior (' + id + ')', fecha: new Date().toISOString() }, null, 2) + '\n');
  return { shotId, restaurada: id };
}
