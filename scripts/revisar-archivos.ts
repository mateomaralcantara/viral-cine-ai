/**
 * REVISOR DE ARCHIVOS: comprueba que el video de cada toma se pueda leer de principio a fin.
 *
 *   npm run revisar-archivos -- <película>                     todas las escenas (gratis)
 *   npm run revisar-archivos -- <película> --escena E01        solo esa escena
 *   npm run revisar-archivos -- <película> --reparar           además repara lo que se pueda
 *
 * Reparar (gratis, nada se borra: lo dañado va a «archivo»):
 *   1) copia limpia del mismo video (si el daño es parcial),
 *   2) si no, la versión anterior sana más reciente de la toma (veo-attempts),
 *   3) si no hay nada sano, te dice qué hacer (Recuperar misma tarea o regenerarla).
 */
import { execFile } from 'node:child_process';
import { readdir, rename, statfs } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import nextEnv from '@next/env';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { readV7FilmBundle, v7FilmRoot } from '../lib/v7/storage/film-store';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';
import { originalShotVideo } from '../lib/v7/production/shot-current-video';
import { archiveFile } from '../lib/v7/production/gemini-image';
import { touchSceneChange } from '../lib/v7/production/scene-changes';

const run = promisify(execFile);
nextEnv.loadEnvConfig(process.cwd());
const args = process.argv.slice(2);
const key = args.find((a) => FILM_KEYS[a]) ?? '';
const filmId = FILM_KEYS[key];
const option = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
if (!filmId) { console.log('Uso: npm run revisar-archivos -- <película> [--escena E01] [--reparar]'); process.exit(1); }

/** null = sano; si no, el motivo. Se decodifica entero (los videos de las tomas son cortos). */
async function check(file: string): Promise<string | null> {
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    if (!(Number(stdout.trim()) > 0)) return 'no tiene duración (archivo incompleto)';
  } catch { return 'no se puede abrir (archivo incompleto o dañado)'; }
  try {
    const { stderr } = await run('ffmpeg', ['-nostdin', '-v', 'error', '-i', file, '-f', 'null', '-'], { maxBuffer: 1 << 24 });
    const errors = stderr.trim().split(/\r?\n/).filter(Boolean);
    return errors.length > 3 ? 'tiene partes dañadas (' + errors[0].slice(0, 80) + ')' : null;
  } catch (e) { return 'se corta al leerlo (' + String((e as { stderr?: string }).stderr ?? '').trim().split(/\r?\n/).pop()?.slice(0, 80) + ')'; }
}

async function main() {
  const { film } = await readV7FilmBundle(filmId);
  const root = v7FilmRoot(filmId);
  const only = option('--escena')?.toUpperCase();
  const repair = args.includes('--reparar');
  try {
    const fsInfo = await statfs(root);
    const free = (fsInfo.bavail * fsInfo.bsize) / 1e9;
    console.log(`Disco: ${free.toFixed(1)} GB libres${free < 2 ? '  <-- MUY POCO: un disco lleno deja los videos a medias. Libera espacio antes de seguir.' : ''}`);
  } catch { /* sin medida */ }
  let ok = 0; const bad: string[] = []; const fixed: string[] = []; const missing: string[] = [];
  for (const sc of indexedScenes(film)) {
    if (only && sc.label !== only) continue;
    for (const { label } of sc.shots) {
      const dir = path.join(root, label.toLowerCase());
      const file = await originalShotVideo(dir, label);
      if (!file) { missing.push(label); continue; }
      const problem = await check(file);
      if (!problem) { ok++; continue; }
      console.log(`  ${label}: DAÑADO · ${path.basename(file)} ${problem}`);
      if (!repair) { bad.push(label); continue; }
      // 1) copia limpia
      const clean = file + '.limpio.mp4';
      try {
        await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-err_detect', 'ignore_err', '-i', file, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', clean]);
        if (!(await check(clean))) { await archiveFile(file); await rename(clean, file); fixed.push(label + ' (copia limpia)'); await touchSceneChange(filmId, label, 'archivo reparado'); console.log(`    reparado con una copia limpia.`); continue; }
      } catch { /* no se pudo */ }
      await archiveFile(clean).catch(() => undefined);
      // 2) versión anterior sana
      const prev = (await readdir(path.join(dir, 'veo-attempts')).catch(() => [] as string[])).filter((f) => f.endsWith('.mp4')).sort().reverse();
      let restored = false;
      for (const f of prev) {
        const candidate = path.join(dir, 'veo-attempts', f);
        if (await check(candidate)) continue;
        await archiveFile(file);
        await import('node:fs/promises').then((m) => m.copyFile(candidate, file));
        fixed.push(label + ' (versión anterior ' + f + ')'); restored = true; await touchSceneChange(filmId, label, 'versión anterior sana');
        console.log(`    sustituido por la versión anterior sana ${f}.`);
        break;
      }
      if (!restored) { bad.push(label); console.log(`    sin versión sana: en el estudio pulsa «Volver a descargar de Google · gratis» en ${label}; si Google ya no lo tiene, «Usar mis fotos y videos» o regenérala.`); }
    }
  }
  console.log(`\nRESUMEN: ${ok} sanos${fixed.length ? ` · reparados ${fixed.length}: ${fixed.join(', ')}` : ''}${bad.length ? ` · DAÑADOS ${bad.length}: ${bad.join(', ')}` : ''}${missing.length ? ` · sin video todavía: ${missing.length}` : ''}`);
  if (bad.length && !repair) console.log(`Para repararlos: npm run revisar-archivos -- ${key}${only ? ' --escena ' + only : ''} --reparar`);
  if (fixed.length) console.log('Después monta de nuevo la escena («Montar la escena desde cero»).');
}

try { await main(); } catch (e) { console.error('\nERROR: ' + (e instanceof Error ? e.message : String(e))); process.exit(1); }
