/**
 * IMPORTAR TOMAS DE OTRA VERSIÓN DE LA PELÍCULA (gratis): las tomas ya generadas y pagadas de la versión
 * anterior pasan a la versión nueva, para no volver a pagarlas. Se emparejan por su diálogo y lo que se ve.
 * La toma importada queda como «tu elección» (fijada): ningún agente la vuelve a generar.
 */
import { copyFile, mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { readV7FilmBundle, v7FilmRoot } from '@/lib/v7/storage/film-store';
import { indexedScenes } from './scene-approval-board';
import { currentShotVideo } from './shot-current-video';
import { isLocked, lockShot } from './shot-lock';
import { archiveFile } from './gemini-image';
import { touchSceneChange } from './scene-changes';

const exists = (f: string) => access(f).then(() => true, () => false);
const STOP = new Set('el la los las un una unos unas de del al y o en con por para su sus que se lo le es a sin muy mas más como plano medio primer general detalle cine fotorrealista formato subtitulos subtítulos texto pantalla bocas cerradas neo noir iluminacion iluminación volumetrica volumétrica sombras profundas paleta colores azul petroleo petróleo gris acero ambar ámbar dice español voz'.split(' '));
const words = (t: string) => new Set(t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));
function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Parecido entre dos tomas (0 a 1): el diálogo pesa más que la descripción. */
export function shotSimilarity(a: { line: string; prompt: string; title: string }, b: { line: string; prompt: string; title: string }) {
  const visual = jaccard(words(a.prompt + ' ' + a.title), words(b.prompt + ' ' + b.title));
  if (a.line && b.line) return 0.7 * jaccard(words(a.line), words(b.line)) + 0.3 * visual;
  if (a.line || b.line) return 0.6 * visual; // una habla y la otra no: rara vez son la misma toma
  return visual;
}

export type ImportPair = { target: string; targetTitle: string; source: string; sourceTitle: string; score: number; line: string };

/** Propuesta: cada toma nueva sin video recibe la toma vieja con video más parecida (una a una). */
export async function planImport(targetFilmId: string, sourceFilmId: string, minScore = 0.35): Promise<ImportPair[]> {
  if (targetFilmId === sourceFilmId) throw new Error('Elige otra versión de la película.');
  const target = (await readV7FilmBundle(targetFilmId)).film;
  const source = (await readV7FilmBundle(sourceFilmId)).film;
  const sRoot = v7FilmRoot(sourceFilmId); const tRoot = v7FilmRoot(targetFilmId);
  const sources: Array<{ label: string; title: string; line: string; prompt: string }> = [];
  for (const sc of indexedScenes(source)) for (const { shot, label } of sc.shots) {
    if (await currentShotVideo(path.join(sRoot, label.toLowerCase()), label, { dialogue: shot.metadata?.onCameraDialogue === true })) {
      sources.push({ label, title: shot.title, line: shot.spokenText ?? '', prompt: shot.visualPrompt });
    }
  }
  const targets: Array<{ label: string; title: string; line: string; prompt: string }> = [];
  for (const sc of indexedScenes(target)) for (const { shot, label } of sc.shots) {
    const dir = path.join(tRoot, label.toLowerCase());
    if (await isLocked(dir) || await currentShotVideo(dir, label)) continue;
    targets.push({ label, title: shot.title, line: shot.spokenText ?? '', prompt: shot.visualPrompt });
  }
  const candidates: ImportPair[] = [];
  for (const t of targets) for (const s of sources) {
    const score = shotSimilarity(t, s);
    if (score >= minScore) candidates.push({ target: t.label, targetTitle: t.title, source: s.label, sourceTitle: s.title, score: Math.round(score * 100) / 100, line: t.line });
  }
  candidates.sort((a, b) => b.score - a.score);
  const usedT = new Set<string>(); const usedS = new Set<string>(); const out: ImportPair[] = [];
  for (const c of candidates) { if (usedT.has(c.target) || usedS.has(c.source)) continue; usedT.add(c.target); usedS.add(c.source); out.push(c); }
  return out.sort((a, b) => a.target.localeCompare(b.target));
}

/** Copia el video (y la foto de partida) de cada toma vieja a su pareja nueva y la deja fijada. */
export async function applyImport(targetFilmId: string, sourceFilmId: string, pairs: Array<{ target: string; source: string }>) {
  const source = (await readV7FilmBundle(sourceFilmId)).film;
  const sRoot = v7FilmRoot(sourceFilmId); const tRoot = v7FilmRoot(targetFilmId);
  const done: string[] = []; const skipped: string[] = [];
  for (const p of pairs) {
    if (!/^E\d{2}-P\d{2}$/.test(p.target) || !/^E\d{2}-P\d{2}$/.test(p.source)) { skipped.push(p.target); continue; }
    const sDir = path.join(sRoot, p.source.toLowerCase()); const tDir = path.join(tRoot, p.target.toLowerCase());
    const sShot = indexedScenes(source).flatMap((x) => x.shots).find((x) => x.label === p.source)?.shot;
    const video = await currentShotVideo(sDir, p.source, { dialogue: sShot?.metadata?.onCameraDialogue === true });
    if (!video || await isLocked(tDir)) { skipped.push(p.target); continue; }
    await mkdir(tDir, { recursive: true });
    const dest = path.join(tDir, p.target + '-plano-fijo.mp4');
    await archiveFile(dest);
    await copyFile(video.file, dest);
    const ref = path.join(sDir, p.source + '-referencia.jpg');
    if (await exists(ref)) { await archiveFile(path.join(tDir, p.target + '-referencia.jpg')); await copyFile(ref, path.join(tDir, p.target + '-referencia.jpg')); }
    await writeFile(path.join(tDir, 'importada.json'), JSON.stringify({ desde: sourceFilmId, toma: p.source, fecha: new Date().toISOString() }, null, 2) + '\n');
    await lockShot(tDir, `importada de ${sourceFilmId} ${p.source}`);
    await touchSceneChange(targetFilmId, p.target, 'toma importada');
    done.push(`${p.target} ← ${p.source}`);
  }
  return { done, skipped };
}
