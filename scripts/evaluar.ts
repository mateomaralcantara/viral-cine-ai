/**
 * EVALUACIÓN COMPLETA DE UNA PELÍCULA (gratis, no cambia nada salvo con --recuperar).
 *
 *   npm run evaluar -- <película>                 informe
 *   npm run evaluar -- <película> --recuperar     además vuelve a poner en el guion las tomas perdidas
 *
 * Revisa: disco libre; cuántas tomas tiene cada escena en el guion; TOMAS PERDIDAS (su carpeta sigue en el
 * disco pero el guion ya no las tiene); que cada toma lea SU carpeta (el texto coincide); y el estado del
 * video de cada toma (sano, dañado, sin video, tu material, fijada, quitada).
 * Recuperar: las tomas perdidas se vuelven a añadir a su escena con su texto, su frase y su duración,
 * tomados de su propia carpeta. No se borra nada.
 */
import { execFile } from 'node:child_process';
import { access, readdir, readFile, statfs } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import nextEnv from '@next/env';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { readV7FilmBundle, saveV7FilmBundle, v7FilmRoot } from '../lib/v7/storage/film-store';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';
import { originalShotVideo } from '../lib/v7/production/shot-current-video';
import { touchSceneChange } from '../lib/v7/production/scene-changes';

const run = promisify(execFile);
nextEnv.loadEnvConfig(process.cwd());
const args = process.argv.slice(2);
const key = args.find((a) => FILM_KEYS[a]) ?? '';
const filmId = FILM_KEYS[key];
if (!filmId) { console.log('Uso: npm run evaluar -- <película> [--recuperar]'); process.exit(1); }
const exists = (f: string) => access(f).then(() => true, () => false);
const readJson = async <T>(f: string): Promise<T | null> => { try { return JSON.parse(await readFile(f, 'utf8')) as T; } catch { return null; } };

async function videoOk(file: string) {
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    if (!(Number(stdout.trim()) > 0)) return false;
    const { stderr } = await run('ffmpeg', ['-nostdin', '-v', 'error', '-i', file, '-f', 'null', '-'], { maxBuffer: 1 << 24 });
    return stderr.trim().split(/\r?\n/).filter(Boolean).length <= 3;
  } catch { return false; }
}

/** Lo que la carpeta de una toma sabe de sí misma: su último texto, su frase y su duración. */
async function folderInfo(dir: string, label: string, root: string) {
  const pointer = await readJson<{ revisionId: string }>(path.join(dir, 'veo-prompts', 'latest.json'));
  const revision = pointer ? await readJson<{ promptText: string }>(path.join(dir, 'veo-prompts', pointer.revisionId + '.json')) : null;
  const record = await readJson<{ durationSeconds?: number; status?: string }>(path.join(dir, 'provider-operation.json'));
  const voice = await readJson<{ text?: string }>(path.join(root, 'voces', label + '.json'));
  const prompt = revision?.promptText ?? '';
  const quoted = /«([^»]{2,400})»/.exec(prompt)?.[1] ?? '';
  return { prompt, line: voice?.text ?? quoted, onCamera: !voice?.text && !!quoted, seconds: record?.durationSeconds ?? 6, status: record?.status ?? null };
}

async function main() {
  const stored = await readV7FilmBundle(filmId);
  const film = stored.film;
  const root = v7FilmRoot(filmId);
  console.log(`EVALUACIÓN · ${film.title} (${filmId})`);
  try {
    const f = await statfs(root);
    const free = (f.bavail * f.bsize) / 1e9;
    console.log(`Disco: ${free.toFixed(1)} GB libres${free < 2 ? '  <-- MUY POCO: puede dañar videos y guardar a medias' : ''}`);
  } catch { /* sin medida */ }

  const scenes = indexedScenes(film);
  const known = new Set(scenes.flatMap((s) => s.shots.map((x) => x.label)));
  const folders = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory() && /^e\d{2}-p\d{2}$/.test(d.name)).map((d) => d.name.toUpperCase());
  const lost = folders.filter((l) => !known.has(l)).sort();

  console.log('\n1) TOMAS POR ESCENA (guion actual · carpetas en el disco)');
  for (const sc of scenes) {
    const onDisk = folders.filter((l) => l.startsWith(sc.label + '-')).length;
    console.log(`   ${sc.label} «${sc.scene.title}»: ${sc.shots.length} en el guion · ${onDisk} carpetas${onDisk > sc.shots.length ? '  <-- FALTAN EN EL GUION: ' + folders.filter((l) => l.startsWith(sc.label + '-') && !known.has(l)).join(', ') : ''}`);
  }

  console.log('\n2) ESTADO DE CADA TOMA');
  const mismatched: string[] = [];
  for (const sc of scenes) for (const { shot, label } of sc.shots) {
    const dir = path.join(root, label.toLowerCase());
    const info = await folderInfo(dir, label, root);
    // ¿Lee esta toma SU carpeta? Si el guion perdió una toma intermedia, las siguientes leerían carpetas ajenas.
    const own = !info.prompt || info.prompt.slice(0, 40) === shot.visualPrompt.slice(0, 40) || shot.visualPrompt.includes(info.prompt.slice(0, 60)) || info.prompt.includes(shot.visualPrompt.slice(0, 60));
    if (!own) mismatched.push(label);
    const video = await originalShotVideo(dir, label);
    const flags = [
      video ? (await videoOk(video) ? (video.endsWith('-plano-fijo.mp4') ? 'tu material' : 'video sano') : 'VIDEO DAÑADO') : 'sin video',
      await exists(path.join(dir, 'fijada.json')) ? 'fijada' : '',
      await exists(path.join(dir, 'quitada.json')) ? 'QUITADA DEL MONTAJE' : '',
      own ? '' : 'EL TEXTO NO COINCIDE CON SU CARPETA'
    ].filter(Boolean).join(' · ');
    console.log(`   ${label} «${shot.title}»: ${flags}`);
  }

  if (lost.length) {
    console.log('\n3) TOMAS PERDIDAS (su carpeta existe, el guion ya no las tiene)');
    for (const l of lost) {
      const info = await folderInfo(path.join(root, l.toLowerCase()), l, root);
      const video = await originalShotVideo(path.join(root, l.toLowerCase()), l);
      console.log(`   ${l}: ${video ? 'tiene video' : 'sin video'} · ${info.seconds} s${info.line ? ` · frase «${info.line.slice(0, 70)}»` : ''} · texto: ${info.prompt ? info.prompt.slice(0, 80) + '…' : '(sin texto guardado)'}`);
    }
  }
  if (mismatched.length) console.log(`\nAVISO: ${mismatched.join(', ')} no leen su propia carpeta (el guion perdió una toma intermedia). No las generes ni las apruebes hasta recuperar.`);

  if (!lost.length) { console.log('\nRESUMEN: no hay tomas perdidas.'); return; }
  if (!args.includes('--recuperar')) { console.log(`\nRESUMEN: ${lost.length} tomas perdidas (${lost.join(', ')}). Para devolverlas al guion: npm run evaluar -- ${key} --recuperar`); return; }

  // RECUPERAR: cada toma perdida vuelve a su escena, en su posición (por número), con los datos de su carpeta.
  const narrator = film.characters.find((c) => c.id.endsWith('-character-narrador')) ?? film.characters[0];
  const recovered: string[] = [];
  for (const l of lost) {
    const sc = indexedScenes(film).find((s) => s.label === l.slice(0, 3));
    if (!sc) { console.log(`   ${l}: su escena ${l.slice(0, 3)} no existe en el guion; no se recupera.`); continue; }
    const n = Number(l.slice(5));
    const info = await folderInfo(path.join(root, l.toLowerCase()), l, root);
    if (!info.prompt) { console.log(`   ${l}: sin texto guardado en su carpeta; añádela con «+ Añadir toma».`); continue; }
    const speaker = film.characters.find((c) => info.line && info.prompt.includes(c.name + ' dice')) ?? narrator;
    const shot = {
      id: sc.scene.id + '-shot-' + String(n).padStart(2, '0') + '-recuperada', sceneId: sc.scene.id, order: n - 0.5,
      title: 'Recuperada ' + l, intention: sc.scene.summary, durationSeconds: [4, 6, 8].includes(info.seconds) ? info.seconds : 6,
      visualPrompt: info.prompt, camera: info.prompt.split('.')[0].slice(0, 60) || 'Plano medio', spokenText: info.line,
      speakerId: speaker.id, characterIds: sc.scene.characterIds, strategy: 'cinematic-video-candidate',
      metadata: { curatedPrompt: true, voiceOver: !info.onCamera && !!info.line, onCameraDialogue: info.onCamera, providerCalls: 0, lipsyncStatus: info.onCamera ? 'native-veo' : 'not-needed', recoveredFromFolder: true },
      takes: []
    };
    (sc.scene.shots as unknown as typeof shot[]).push(shot);
    // Orden por número de toma: la recuperada vuelve a su sitio (E01-P05 entre P04 y P06).
    sc.scene.shots.sort((a, b) => a.order - b.order).forEach((s, i) => { s.order = i + 1; });
    sc.scene.durationSeconds += shot.durationSeconds;
    recovered.push(l);
  }
  await saveV7FilmBundle({ ...stored, savedAt: undefined });
  for (const l of recovered) await touchSceneChange(filmId, l, 'toma recuperada');
  const after = indexedScenes((await readV7FilmBundle(filmId)).film);
  const wrong = recovered.filter((l) => !after.some((s) => s.shots.some((x) => x.label === l && x.shot.metadata?.recoveredFromFolder)));
  console.log(`\nRECUPERADAS ${recovered.length}: ${recovered.join(', ')}${wrong.length ? ` · AVISO: no quedaron en su número: ${wrong.join(', ')}` : ' · cada una en su número.'}`);
  console.log('Siguiente: en el estudio, «Montar la escena desde cero» en cada escena recuperada.');
}

try { await main(); } catch (e) { console.error('\nERROR: ' + (e instanceof Error ? e.message : String(e))); process.exit(1); }
