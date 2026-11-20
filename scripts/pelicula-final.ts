/**
 * Voces y película final.
 *
 *   npm run voces -- convidados             casting + cuenta de caracteres (gratis, no genera)
 *   npm run voces -- convidados --generar   genera con ElevenLabs solo las voces que faltan
 *   npm run montar -- convidados            película final: video + voces + (música) + cierre. Gratis, local.
 *       --musica "C:\ruta\cancion.mp3"     música de fondo (o deja musica.mp3 en la carpeta de la película)
 *       --voz-oficial-camara [--toma E01-P04]   (prueba) diálogos en cámara con la voz oficial del personaje
 *       --escena E03                       avance de UNA escena (sin apertura ni créditos)
 *       --sin-portada                      sin la portada del libro al final
 *       --sin-apertura / --sin-creditos      sin la apertura (reparto y agentes) o sin los créditos finales
 *       --sin-ambiente                     quita el sonido original de Veo
 *       --ingles                           añade subtítulos en inglés (traducción con Gemini, céntimos)
 *       --subtitulos-fijos                 versión extra con los subtítulos grabados (español; con --fijos-en-ingles, inglés)
 *
 * Archivos: <película>\voces\casting.json (editable), <película>\voces\E0X-P0Y.mp3,
 * <película>\final\<título>-<fecha>.mp4. Nunca borra videos ni voces: lo reemplazado va a voces\archivo.
 */
import { execFile } from 'node:child_process';
import { access, copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import nextEnv from '@next/env';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { CONVIDADOS_ID } from '../lib/v7/presets/los-convidados-al-agape';
import { PRIMERA_PAGINA_ID } from '../lib/v7/presets/la-primera-pagina';
import { readV7FilmBundle, v7DataRoot as v7DataRootDir, v7FilmRoot } from '../lib/v7/storage/film-store';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';
import { currentShotVideo, fileSha256 } from '../lib/v7/production/shot-current-video';
import { listPhotos, listSheets, masterPath, serieOf } from '../lib/v7/production/character-identity';
import { agentCredits, chunk, endCredits, type ProductionFacts } from '../lib/v7/production/film-credits';
import { SERIES_CREDITS } from '../lib/v7/presets/series-credits';
import { speakerKey } from '../lib/v7/production/film-voice-mix';
import { translateToEnglish } from '../lib/v7/production/subtitle-translate';
import { convertSpeech, STS_CREDITS_PER_SECOND } from '../lib/v7/production/voice-conversion';
import {
  buildSrt, cuesForLine, isOnCamera, onCameraPlan, pickCasting, speechSeconds, type SubtitleCue, planCharacters, shotTiming, voicePlan, voiceSettings, voiceTreatment, VOICE_ALIASES, VOICE_START_SECONDS,
  type AvailableVoice, type Casting, type VoiceLine
} from '../lib/v7/production/film-voice-mix';

const run = promisify(execFile);
nextEnv.loadEnvConfig(process.cwd());

const FILMS: Record<string, string> = FILM_KEYS;
const args = process.argv.slice(2);
const mode = args[0];
const key = args[1] ?? '';
const filmId = FILMS[key];
const flag = (f: string) => args.includes(f);
const option = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
if (!['voces', 'montar'].includes(mode) || !filmId) {
  console.log('Uso: npm run voces -- ' + Object.keys(FILMS).join('|') + ' [--generar]');
  console.log('     npm run montar -- ' + Object.keys(FILMS).join('|') + ' [--musica archivo.mp3] [--sin-ambiente]');
  process.exit(1);
}

const exists = (f: string) => access(f).then(() => true, () => false);
const root = v7FilmRoot(filmId);
const voiceDir = path.join(root, 'voces');
const castingFile = path.join(voiceDir, 'casting.json');
const MODEL = process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2';
const apiKey = () => {
  const k = process.env.ELEVENLABS_API_KEY?.trim();
  if (!k) throw new Error('Falta ELEVENLABS_API_KEY en .env.local');
  return k;
};

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(file, 'utf8')) as T; } catch { return fallback; }
}
async function probe(file: string) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return Number(stdout.trim());
}
async function hasAudio(file: string) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file]);
  return stdout.trim().length > 0;
}
async function ffmpeg(list: string[], cwd?: string) {
  await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...list], { cwd, maxBuffer: 1 << 24 });
}

// ---------------------------------------------------------------- VOCES
async function listVoices(): Promise<AvailableVoice[]> {
  const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': apiKey() } });
  if (!res.ok) throw new Error('ElevenLabs rechazó el listado de voces (' + res.status + '): ' + (await res.text()).slice(0, 300));
  const body = await res.json() as { voices?: Array<{ voice_id: string; name: string; category?: string; labels?: Record<string, string> }> };
  return (body.voices ?? []).map((v) => ({ voiceId: v.voice_id, name: v.name, category: v.category, gender: v.labels?.gender }));
}
async function remainingCharacters(): Promise<number | null> {
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': apiKey() } });
    if (!res.ok) return null;
    const s = await res.json() as { character_count: number; character_limit: number; tier?: string };
    console.log(`ElevenLabs: plan ${s.tier ?? '?'}, usados ${s.character_count} de ${s.character_limit}.`);
    return s.character_limit - s.character_count;
  } catch { return null; }
}
type VoiceRecord = { text: string; voiceId: string; model: string; characters: number; createdAt: string };
const voiceFile = (label: string) => path.join(voiceDir, label + '.mp3');
const recordFile = (label: string) => path.join(voiceDir, label + '.json');

async function pending(lines: VoiceLine[], casting: Casting) {
  const out: VoiceLine[] = [];
  for (const l of lines) {
    const rec = await readJson<VoiceRecord | null>(recordFile(l.label), null);
    if (await exists(voiceFile(l.label)) && rec && rec.text === l.text && rec.voiceId === casting[l.speaker]?.voiceId) continue;
    out.push(l);
  }
  return out;
}

async function speak(line: VoiceLine, casting: Casting) {
  const voiceId = casting[line.speaker].voiceId;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey(), 'content-type': 'application/json' },
    body: JSON.stringify({ text: line.text, model_id: MODEL, voice_settings: voiceSettings(line.speaker) })
  });
  if (!res.ok) throw new Error(line.label + ': ElevenLabs rechazó la voz (' + res.status + '): ' + (await res.text()).slice(0, 300));
  const audio = Buffer.from(await res.arrayBuffer());
  if (audio.length < 2000) throw new Error(line.label + ': ElevenLabs devolvió un audio vacío.');
  if (await exists(voiceFile(line.label))) {
    const archive = path.join(voiceDir, 'archivo');
    await mkdir(archive, { recursive: true });
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    await rename(voiceFile(line.label), path.join(archive, line.label + '-' + stamp + '.mp3'));
  }
  await writeFile(voiceFile(line.label), audio);
  const rec: VoiceRecord = { text: line.text, voiceId, model: MODEL, characters: line.text.length, createdAt: new Date().toISOString() };
  await writeFile(recordFile(line.label), JSON.stringify(rec, null, 2) + '\n');
}

// Voz oficial en los diálogos en cámara: <toma>.camara.mp3, ligado al video exacto que usa la película.
type CameraLine = { label: string; text: string; speaker: string; video: string; sha: string; seconds: number };
const cameraFile = (label: string) => path.join(voiceDir, label + '.camara.mp3');
const cameraRecord = (label: string) => path.join(voiceDir, label + '.camara.json');

async function pendingCamera(camera: Array<{ label: string; text: string; speaker: string }>, casting: Casting) {
  const out: CameraLine[] = [];
  for (const c of camera) {
    const current = await currentShotVideo(path.join(root, c.label.toLowerCase()), c.label);
    if (!current || !(await hasAudio(current.file))) continue;
    const sha = (await fileSha256(current.file)).slice(0, 16);
    const rec = await readJson<{ sha?: string; voiceId?: string } | null>(cameraRecord(c.label), null);
    if (rec?.sha === sha && rec.voiceId === casting[c.speaker]?.voiceId && await exists(cameraFile(c.label))) continue;
    out.push({ ...c, video: current.file, sha, seconds: await probe(current.file) });
  }
  return out;
}

async function convertCamera(c: CameraLine, casting: Casting) {
  const voiceId = casting[c.speaker]?.voiceId;
  if (!voiceId) throw new Error('El personaje ' + c.speaker + ' no tiene voz oficial (elígela en PERSONAJES).');
  const tmp = path.join(voiceDir, `.${c.label}-original.mp3`);
  await ffmpeg(['-i', c.video, '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', '2', tmp]);
  try {
    const audio = await convertSpeech(apiKey(), voiceId, tmp, voiceSettings(c.speaker));
    if (await exists(cameraFile(c.label))) {
      await mkdir(path.join(voiceDir, 'archivo'), { recursive: true });
      await rename(cameraFile(c.label), path.join(voiceDir, 'archivo', `${c.label}.camara-${Date.now()}.mp3`));
    }
    await writeFile(cameraFile(c.label), audio);
    await writeFile(cameraRecord(c.label), JSON.stringify({ label: c.label, sha: c.sha, voiceId, text: c.text, createdAt: new Date().toISOString() }, null, 2) + '\n');
  } finally { await rm(tmp, { force: true }); }
}

/** ¿El video de esta toma se generó con un diálogo (frase entre «»)? Entonces su audio tiene voces. */
async function videoHasSpeech(label: string) {
  const dir = path.join(root, label.toLowerCase());
  const rec = await readJson<{ revisionId?: string } | null>(path.join(dir, 'provider-operation.json'), null);
  if (!rec?.revisionId) return false;
  const rev = await readJson<{ promptText?: string } | null>(path.join(dir, 'veo-prompts', rec.revisionId + '.json'), null);
  return (rev?.promptText ?? '').includes('«');
}

/** La voz oficial convertida de esta toma, si corresponde al video que usa la película. */
async function cameraVoiceFor(label: string, videoFile: string) {
  const rec = await readJson<{ sha?: string } | null>(cameraRecord(label), null);
  if (!rec?.sha || !(await exists(cameraFile(label)))) return null;
  return rec.sha === (await fileSha256(videoFile)).slice(0, 16) ? cameraFile(label) : null;
}

async function voces() {
  const { film } = await readV7FilmBundle(filmId);
  const lines = voicePlan(film);
  const closing = typeof film.metadata?.closingCard === 'string' ? film.metadata.closingCard as string : '';
  if (closing) lines.push({ label: 'CIERRE', title: 'Pregunta final', text: closing, speaker: 'narrador' });
  // Conversión de voz en cámara: desactivada por defecto (solo con --voz-oficial-camara).
  // Prueba controlada: --toma E01-P04 convierte solo esa toma (para escucharla antes de aplicarlo a todo).
  const onlyShots = (option('--toma') ?? '').toUpperCase().split(',').map((x) => x.trim()).filter(Boolean);
  const camera = flag('--voz-oficial-camara') ? onCameraPlan(film).filter((c) => !onlyShots.length || onlyShots.includes(c.label)) : [];
  const allSpeakers = [...new Set([...lines.map((l) => l.speaker), ...camera.map((c) => c.speaker)])];
  // Los alias (voz interior = la voz de Martin) no ocupan una voz propia.
  const speakers = [...new Set(allSpeakers.map((s) => VOICE_ALIASES[s] ?? s))];
  await mkdir(voiceDir, { recursive: true });
  const previous = await readJson<Casting>(castingFile, {});
  // La voz de la ficha del personaje (serie) manda: misma voz en todos los capítulos.
  const serie = serieOf(film);
  for (const sheet of await listSheets(serie)) if (sheet.voz && speakers.includes(sheet.key)) previous[sheet.key] = { voiceId: sheet.voz.voiceId, name: sheet.voz.nombre };
  const picked = pickCasting(speakers, await listVoices(), previous);
  if (JSON.stringify(picked) !== JSON.stringify(previous)) await writeFile(castingFile, JSON.stringify(picked, null, 2) + '\n');
  const casting: Casting = { ...picked };
  for (const s of allSpeakers) if (VOICE_ALIASES[s]) casting[s] = picked[VOICE_ALIASES[s]];

  console.log('\nCASTING (puedes cambiarlo en ' + castingFile + '):');
  for (const s of allSpeakers) console.log(`  ${s.padEnd(15)} -> ${casting[s].name}${VOICE_ALIASES[s] ? ' (con tratamiento sonoro)' : ''}  (${lines.filter((l) => l.speaker === s).length} frases)`);
  const todo = await pending(lines, casting);
  const camTodo = await pendingCamera(camera, casting);
  const camSeconds = camTodo.reduce((n, c) => n + c.seconds, 0);
  if (camera.length) console.log(`  Diálogos en cámara: ${camera.length - camTodo.length} con la voz oficial, ${camTodo.length} por convertir (~${Math.round(camSeconds)} s de audio).`);
  const chars = planCharacters(todo);
  console.log(`\nVoces: ${lines.length - todo.length} listas, ${todo.length} por generar (${chars} caracteres; total guion ${planCharacters(lines)}).`);
  const left = await remainingCharacters();
  if (!todo.length && !camTodo.length) { console.log('Todas las voces están listas. Siguiente: npm run montar -- ' + key); return; }
  const need = chars + Math.ceil(camSeconds * STS_CREDITS_PER_SECOND);
  if (left != null && need > left) throw new Error(`No alcanza: necesitas ~${need} créditos de voz y quedan ${left}.`);
  if (!flag('--generar')) {
    console.log('\nNo se generó nada. Para generarlas: npm run voces -- ' + key + ' --generar');
    return;
  }
  for (const l of todo) {
    process.stdout.write(`  ${l.label} (${l.speaker})... `);
    await speak(l, casting);
    console.log('OK ' + (await probe(voiceFile(l.label))).toFixed(1) + ' s');
  }
  for (const c of camTodo) {
    process.stdout.write(`  ${c.label} en cámara (${c.speaker})... `);
    try { await convertCamera(c, casting); console.log('OK voz oficial'); }
    catch (e) { console.log('ERROR: ' + (e as Error).message.slice(0, 200)); }
  }
  console.log('\nVoces listas. Escúchalas en ' + voiceDir + '\nSiguiente: npm run montar -- ' + key);
}

// ---------------------------------------------------------------- MONTAJE
const VF = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p';
const ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '192k'];
const fmt = (n: number) => n.toFixed(3);

async function findFont(work: string) {
  const candidates = ['C:/Windows/Fonts/georgia.ttf', 'C:/Windows/Fonts/times.ttf', 'C:/Windows/Fonts/arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/System/Library/Fonts/Supplemental/Georgia.ttf'];
  for (const c of candidates) if (await exists(c)) { await copyFile(c, path.join(work, 'fuente.ttf')); return true; }
  return false;
}

async function shotPart(work: string, index: number, label: string, video: string, voice: string | null, ambient: boolean, opts: { onCamera?: boolean; treatment?: string | null; cameraVoice?: boolean; muteVideo?: boolean } = {}) {
  const videoSeconds = await probe(video);
  const voiceSeconds = voice ? await probe(voice) : null;
  // La voz oficial en cámara dura lo mismo que el video (mismo ritmo): sin margen ni congelado.
  const t = opts.cameraVoice
    ? { total: videoSeconds, freeze: Math.max(0, Math.round(((voiceSeconds ?? 0) - videoSeconds - 0.3) * 1000) / 1000) }
    : shotTiming(videoSeconds, voiceSeconds);
  if (opts.cameraVoice && t.freeze > 0) t.total = videoSeconds + t.freeze;
  const out = path.join(work, String(index).padStart(3, '0') + '-' + label + '.mp4');
  const input = ['-i', video];
  // Voz en off más larga que el video: en vez de congelar la imagen, cámara lenta suave (hasta 70 %);
  // solo si no alcanza se congela el último instante. Los diálogos en cámara nunca se ralentizan.
  const slow = t.freeze > 0 && !opts.onCamera && !opts.cameraVoice ? Math.max(0.7, videoSeconds / t.total) : 1;
  const stillFreeze = Math.max(0, Math.round((t.total - videoSeconds / slow) * 1000) / 1000);
  const vf = (slow < 1 ? `setpts=PTS/${slow.toFixed(4)},` : '') + VF +
    (slow < 1 ? (stillFreeze > 0.05 ? `,tpad=stop_mode=clone:stop_duration=${fmt(stillFreeze)}` : '') : (t.freeze > 0 ? `,tpad=stop_mode=clone:stop_duration=${fmt(t.freeze)}` : ''));
  // Con la voz oficial convertida, el audio original de Veo (con la voz inventada) no se usa.
  const amb = !opts.cameraVoice && !opts.muteVideo && (ambient || opts.onCamera) && await hasAudio(video)
    ? `[0:a]${slow < 1 ? `atempo=${Math.max(0.5, slow).toFixed(4)},` : ''}aresample=48000,volume=${opts.onCamera ? 1.0 : voice ? 0.3 : 0.8},apad[amb]`
    : `anullsrc=r=48000:cl=stereo[amb]`;
  let filter = `[0:v]${vf}[v];${amb}`;
  if (voice) {
    input.push('-i', voice);
    const ms = opts.cameraVoice ? 0 : Math.round(VOICE_START_SECONDS * 1000);
    const fx = opts.treatment ? opts.treatment + ',' : '';
    filter += `;[1:a]${fx}aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms},volume=${opts.cameraVoice ? 1.3 : 1.6},apad[vo];[amb][vo]amix=inputs=2:duration=longest:normalize=0[a]`;
  } else filter += ';[amb]anull[a]';
  await ffmpeg([...input, '-filter_complex', filter, '-map', '[v]', '-map', '[a]', '-t', fmt(t.total), ...ENC, out]);
  return { out, seconds: t.total, freeze: slow < 1 ? stillFreeze : t.freeze, slow, voiceSeconds };
}

async function cardPart(work: string, name: string, lines: string[], seconds: number, voice: string | null, cover: string | null, font: boolean) {
  const out = path.join(work, name + '.mp4');
  const inputs: string[] = [];
  let filter: string;
  const fade = `fade=t=in:st=0:d=0.8,fade=t=out:st=${fmt(seconds - 0.8)}:d=0.8`;
  if (cover) {
    inputs.push('-loop', '1', '-t', fmt(seconds), '-i', cover);
    filter = `[0:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=24,format=yuv420p,${fade}[v]`;
  } else {
    inputs.push('-f', 'lavfi', '-t', fmt(seconds), '-i', 'color=c=black:s=1280x720:r=24');
    const draw = lines.map((line, i) => {
      const file = `${name}-${i}.txt`;
      return { file, line, y: `(h/2)+${Math.round((i - (lines.length - 1) / 2) * 70)}-th/2` };
    });
    for (const d of draw) await writeFile(path.join(work, d.file), d.line, 'utf8');
    const fontPart = font ? 'fontfile=fuente.ttf:' : '';
    const texts = draw.map((d, i) => `drawtext=${fontPart}textfile=${d.file}:fontcolor=white:fontsize=${i === 0 && name === 'cierre-titulo' ? 54 : 42}:x=(w-tw)/2:y=${d.y}`).join(',');
    filter = `[0:v]${texts},format=yuv420p,${fade}[v]`;
  }
  if (voice) {
    inputs.push('-i', voice);
    filter += `;[1:a]aresample=48000,aformat=channel_layouts=stereo,adelay=500|500,volume=1.6,apad[a]`;
  } else {
    inputs.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
    filter += ';[1:a]anull[a]';
  }
  await ffmpeg([...inputs, '-filter_complex', filter, '-map', '[v]', '-map', '[a]', '-t', fmt(seconds), ...ENC, out], work);
  return out;
}

type CardText = { text: string; size: number; color?: string; gap?: number };
let cardCount = 0;
/** Tarjeta de créditos: textos centrados, o retrato a la izquierda y textos a la derecha. */
async function creditCard(work: string, items: CardText[], seconds: number, font: boolean, portrait: string | null = null) {
  const name = 'credito-' + String(++cardCount).padStart(3, '0');
  const out = path.join(work, name + '.mp4');
  const inputs = ['-f', 'lavfi', '-t', fmt(seconds), '-i', 'color=c=0x07070b:s=1280x720:r=24'];
  if (portrait) inputs.push('-loop', '1', '-t', fmt(seconds), '-i', portrait);
  inputs.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
  const heights = items.map((t) => t.size * 1.35 + (t.gap ?? 0));
  let y = Math.round((720 - heights.reduce((a, b) => a + b, 0)) / 2);
  const fontPart = font ? 'fontfile=fuente.ttf:' : '';
  const draws: string[] = [];
  for (const [k, t] of items.entries()) {
    const file = `${name}-${k}.txt`;
    await writeFile(path.join(work, file), t.text, 'utf8');
    const x = portrait ? '660' : '(w-tw)/2';
    draws.push(`drawtext=${fontPart}textfile=${file}:fontcolor=${t.color ?? 'white'}:fontsize=${t.size}:x=${x}:y=${y + (t.gap ?? 0)}`);
    y += heights[k];
  }
  const fade = `fade=t=in:st=0:d=0.6,fade=t=out:st=${fmt(seconds - 0.6)}:d=0.6`;
  let filter: string;
  if (portrait) {
    // Retrato con un leve acercamiento (efecto Ken Burns) y marco dorado fino.
    filter = `[1:v]crop='min(iw,trunc(ih*0.8/2)*2)':ih,scale=-2:520,setsar=1,pad=iw+6:ih+6:3:3:color=0xb8963e,` +
      `zoompan=z='min(zoom+0.0006,1.06)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=wxh:fps=24[pt];` +
      `[0:v][pt]overlay=x=110:y=(H-h)/2:shortest=1,${draws.join(',')},format=yuv420p,${fade}[v]`;
    // zoompan necesita conocer el tamaño de salida: se calcula del retrato escalado.
    const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', portrait]);
    const [w, h] = stdout.trim().split(',').map(Number);
    const sw = Math.round((Math.min(w, Math.floor(h * 0.8 / 2) * 2) / h) * 520 / 2) * 2 + 6;
    filter = filter.replace('s=wxh', `s=${sw}x526`);
  } else {
    filter = `[0:v]${draws.join(',')},format=yuv420p,${fade}[v]`;
  }
  const audioIndex = portrait ? 2 : 1;
  await ffmpeg([...inputs, '-filter_complex', filter + `;[${audioIndex}:a]anull[a]`, '-map', '[v]', '-map', '[a]', '-t', fmt(seconds), ...ENC, out], work);
  return { out, seconds };
}

/** Tarjeta con dos fotos lado a lado (autor y personaje) y textos debajo. */
async function dualPhotoCard(work: string, left: string, right: string, items: CardText[], seconds: number, font: boolean) {
  const name = 'credito-' + String(++cardCount).padStart(3, '0');
  const out = path.join(work, name + '.mp4');
  // Llenan el marco (recorte centrado arriba). La foto del autor (k=1) se acerca a cabeza y torso.
  const box = (k: number) => `[${k}:v]${k === 1 ? 'crop=iw:ih*0.75:0:0,' : ''}scale=340:430:force_original_aspect_ratio=increase,crop=340:430:(iw-ow)/2:0,setsar=1,` +
    `pad=346:436:3:3:color=0xb8963e[p${k}]`;
  const fontPart = font ? 'fontfile=fuente.ttf:' : '';
  let y = 545;
  const draws: string[] = [];
  for (const [k, t] of items.entries()) {
    const file = `${name}-${k}.txt`;
    await writeFile(path.join(work, file), t.text, 'utf8');
    draws.push(`drawtext=${fontPart}textfile=${file}:fontcolor=${t.color ?? 'white'}:fontsize=${t.size}:x=(w-tw)/2:y=${y + (t.gap ?? 0)}`);
    y += t.size * 1.35 + (t.gap ?? 0);
  }
  const fade = `fade=t=in:st=0:d=0.6,fade=t=out:st=${fmt(seconds - 0.6)}:d=0.6`;
  const filter = `${box(1)};${box(2)};[0:v][p1]overlay=x=270:y=70[a];[a][p2]overlay=x=664:y=70,${draws.join(',')},format=yuv420p,${fade}[v];[3:a]anull[a2]`;
  await ffmpeg(['-f', 'lavfi', '-t', fmt(seconds), '-i', 'color=c=0x07070b:s=1280x720:r=24',
    '-loop', '1', '-t', fmt(seconds), '-i', left, '-loop', '1', '-t', fmt(seconds), '-i', right,
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
    '-filter_complex', filter, '-map', '[v]', '-map', '[a2]', '-t', fmt(seconds), ...ENC, out], work);
  return { out, seconds };
}

/** Portada del libro: la de la película o, si no tiene, la de la serie. */
async function bookCover(serie: string) {
  for (const dir of [root, path.join(v7DataRootDir(), 'personajes', serie)]) {
    for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
      const f = path.join(dir, 'portada.' + ext);
      if (await exists(f)) return f;
    }
  }
  return null;
}

/** Portada a pantalla completa: la portada nítida al centro sobre ella misma desenfocada, con un leve acercamiento. */
async function coverCard(work: string, cover: string, seconds: number) {
  const name = 'credito-' + String(++cardCount).padStart(3, '0');
  const out = path.join(work, name + '.mp4');
  const fade = `fade=t=in:st=0:d=1,fade=t=out:st=${fmt(seconds - 1.2)}:d=1.2`;
  const filter = `[0:v]split=2[a][b];` +
    `[a]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,boxblur=24:2,eq=brightness=-0.18[bg];` +
    `[b]scale=-2:690,setsar=1[fg];[bg][fg]overlay=x=(W-w)/2:y=15,` +
    `zoompan=z='min(zoom+0.0005,1.05)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=24,format=yuv420p,${fade}[v];[1:a]anull[a]`;
  await ffmpeg(['-loop', '1', '-t', fmt(seconds), '-i', cover, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
    '-filter_complex', filter, '-map', '[v]', '-map', '[a]', '-t', fmt(seconds), ...ENC, out], work);
  return { out, seconds };
}

/** Foto del autor de la serie: autor.jpg/png/webp en la carpeta de personajes de la serie. */
async function authorPhoto(serie: string) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const f = path.join(v7DataRootDir(), 'personajes', serie, 'autor.' + ext);
    if (await exists(f)) return f;
  }
  return null;
}

/** Lo que de verdad se usó en la película, leído de los registros de producción. */
async function productionFacts(film: Awaited<ReturnType<typeof readV7FilmBundle>>['film'], shotVideos: Map<string, { file: string; repaired: boolean } | null>) {
  const models = new Set<string>();
  let platform: 'vertex' | 'gemini' | undefined;
  let reviewed = false;
  let onCamera = false;
  for (const scene of indexedScenes(film)) for (const { shot, label } of scene.shots) {
    const dir = path.join(root, label.toLowerCase());
    const rec = await readJson<{ model?: string; platform?: 'vertex' | 'gemini' } | null>(path.join(dir, 'provider-operation.json'), null);
    if (rec?.model && shotVideos.get(label)) { models.add(rec.model); platform ??= rec.platform; }
    if (await exists(path.join(dir, 'runway-gen4-turbo-operation.json')) && shotVideos.get(label)) models.add('runway-gen4-turbo');
    if (!reviewed) { try { reviewed = (await readdir(path.join(dir, 'calidad'))).some((f) => f.endsWith('.json')); } catch { /* sin revisión */ } }
    if (isOnCamera(shot) && shotVideos.get(label)) onCamera = true;
  }
  const casting = await readJson<Casting>(castingFile, {});
  const voiceCast: Array<{ character: string; voice: string }> = [];
  const keys = new Set(voicePlan(film).map((l) => l.speaker));
  for (const c of film.characters) {
    const k = speakerKey(film.id, c.id);
    const v = casting[VOICE_ALIASES[k] ?? k];
    if (keys.has(k) && v && await exists(voiceDir)) voiceCast.push({ character: c.name, voice: 'Agente de Voz · ViralCine' });
  }
  let music = false;
  try { music = (await readdir(path.join(root, 'musica'))).some((f) => /\.(wav|mp3|m4a)$/i.test(f)); } catch { /* sin música */ }
  const serie = serieOf(film);
  let identities = 0;
  for (const sheet of await listSheets(serie)) {
    if (sheet.aprobado && film.characters.some((c) => speakerKey(film.id, c.id) === sheet.key)) identities++;
  }
  const [title, subtitle] = film.title.split('·').map((t) => t.trim());
  const facts: ProductionFacts = {
    title, subtitle, author: typeof film.metadata?.author === 'string' ? film.metadata.author : undefined,
    videoModels: [...models], videoPlatform: platform, voiceCast, dialogueOnCamera: onCamera, originalMusic: music,
    qualityReviewed: reviewed, repairedShots: [...shotVideos.values()].filter((v) => v?.repaired).length,
    characterIdentities: identities, englishSubtitles: flag('--ingles'), spanishSubtitles: true
  };
  return facts;
}

/** Retrato del personaje: el oficial aprobado o, si no hay, su primera foto. */
async function portraitOf(serie: string, key: string) {
  if (await exists(masterPath(serie, key))) return masterPath(serie, key);
  const photos = await listPhotos(serie, key);
  return photos[0] ?? null;
}

async function openingSequence(work: string, film: Awaited<ReturnType<typeof readV7FilmBundle>>['film'], facts: ProductionFacts, font: boolean) {
  const cards: Array<{ out: string; seconds: number }> = [];
  const gold = '0xd9b45a', grey = '0xb9b9c4';
  cards.push(await creditCard(work, [{ text: 'VIRALCINE STUDIO', size: 56, color: gold }, { text: 'presenta', size: 30, color: grey, gap: 10 }], 3.5, font));
  const custom = SERIES_CREDITS[serieOf(film)];
  cards.push(await creditCard(work, [{ text: 'Una película creada por', size: 30, color: grey }, { text: custom?.createdBy ?? 'agentes de inteligencia artificial', size: custom ? 56 : 44, color: custom ? gold : 'white', gap: 8 }], 3.5, font));
  for (const group of chunk(custom?.lines ?? agentCredits(facts), 3)) {
    cards.push(await creditCard(work, group.flatMap((c, k) => [{ text: c.role.toUpperCase(), size: 22, color: grey, gap: k ? 26 : 0 }, { text: c.name, size: 38 }]), 4.5, font));
  }
  const serie = serieOf(film);
  const visual = film.characters.filter((c) => !/sin imagen/i.test(c.appearance));
  for (const c of visual) {
    const key = speakerKey(film.id, c.id);
    const portrait = await portraitOf(serie, key);
    if (!portrait) continue;
    const sheet = (await listSheets(serie)).find((x) => x.key === key);
    cards.push(await creditCard(work, [
      { text: (sheet?.nombre ?? c.name).toUpperCase(), size: 50, color: gold },
      { text: (sheet?.notas ? sheet.notas.split('.')[0] : c.role), size: 26, color: grey, gap: 14 },
      ...(sheet?.aprobado ? [{ text: 'Identidad oficial · Agente de Casting', size: 20, color: grey, gap: 30 }] : [])
    ], 3.5, font, portrait));
  }
  const voiceOnly = film.characters.filter((c) => /sin imagen/i.test(c.appearance)).map((c) => facts.voiceCast.find((v) => v.character === c.name)).filter(Boolean) as ProductionFacts['voiceCast'];
  if (voiceOnly.length) {
    cards.push(await creditCard(work, [{ text: 'VOCES', size: 24, color: grey }, ...voiceOnly.map((v, k) => ({ text: v.character, size: 32, gap: k ? 4 : 14 })), { text: 'Agente de Voz · ViralCine', size: 26, color: grey, gap: 18 }], 4.5, font));
  }
  const authorName = custom?.author ?? facts.author;
  const photo = custom ? await authorPhoto(serie) : null;
  const characterPhoto = custom?.authorCharacter ? await portraitOf(serie, custom.authorCharacter) : null;
  if (authorName && photo && characterPhoto) {
    cards.push(await dualPhotoCard(work, photo, characterPhoto, [
      { text: authorName.toUpperCase(), size: 44, color: gold },
      { text: custom?.authorCaption ?? 'Autor de la novela', size: 24, color: grey, gap: 6 }
    ], 5, font));
  } else if (authorName) {
    cards.push(await creditCard(work, [{ text: 'Basada en la novela de', size: 30, color: grey }, { text: authorName, size: 52, gap: 8 }], 3.5, font, photo));
  }
  cards.push(await creditCard(work, [{ text: facts.title, size: 62, color: gold }, ...(facts.subtitle ? [{ text: facts.subtitle, size: 30, gap: 16 }] : [])], 5, font));
  return cards;
}

async function endCreditsSequence(work: string, facts: ProductionFacts, font: boolean, serie: string) {
  const grey = '0xb9b9c4';
  const cards: Array<{ out: string; seconds: number }> = [];
  const custom = SERIES_CREDITS[serie];
  const lines = custom
    ? [{ role: 'Una película creada por', name: custom.createdBy }, { role: 'Basada en la novela de', name: custom.author },
      ...facts.voiceCast.map((v) => ({ role: 'Voz de ' + v.character, name: v.voice })), ...custom.lines]
    : endCredits(facts);
  for (const group of chunk(lines, 5)) {
    cards.push(await creditCard(work, group.flatMap((c, k) => [{ text: c.role, size: 20, color: grey, gap: k ? 20 : 0 }, { text: c.name, size: 32 }]), 5, font));
  }
  return cards;
}

/** Parte la pregunta en dos líneas por la coma más cercana al centro. */
function splitLine(text: string): string[] {
  if (text.length <= 42) return [text];
  const mid = text.length / 2;
  let best = -1;
  for (let i = 0; i < text.length; i++) if ((text[i] === ',' || text[i] === ' ') && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid) - (text[i] === ',' ? 6 : 0))) best = i;
  return [text.slice(0, best + (text[best] === ',' ? 1 : 0)).trim(), text.slice(best + 1).trim()];
}

async function montar() {
  for (const tool of ['ffmpeg', 'ffprobe']) {
    try { await run(tool, ['-version']); } catch { throw new Error('Falta ' + tool + ' en el PATH.'); }
  }
  const { film } = await readV7FilmBundle(filmId);
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const finalDir = path.join(root, 'final');
  const work = path.join(finalDir, 'trabajo-' + stamp);
  await mkdir(work, { recursive: true });
  const font = await findFont(work);
  const ambient = !flag('--sin-ambiente');
  const parts: string[] = [];
  const missingVideo: string[] = [];
  const missingVoice: string[] = [];
  // Videos de cada toma (una sola lectura) y datos reales de producción para los créditos.
  const shotVideos = new Map<string, { file: string; repaired: boolean } | null>();
  for (const scene of indexedScenes(film)) for (const { shot, label } of scene.shots) shotVideos.set(label, await currentShotVideo(path.join(root, label.toLowerCase()), label, { dialogue: isOnCamera(shot) }));
  const facts = await productionFacts(film, shotVideos);
  let i = 0;
  let cursor = 0;
  const spansOpening: Array<{ label: string; start: number; seconds: number }> = [];
  const onlyScene = option('--escena')?.toUpperCase();
  if (!flag('--sin-apertura') && !onlyScene) {
    const opening = await openingSequence(work, film, facts, font);
    for (const c of opening) { parts.push(c.out); cursor += c.seconds; }
    spansOpening.push({ label: 'APERTURA', start: 0, seconds: cursor });
    console.log(`  OK apertura: ${opening.length} tarjetas (${cursor.toFixed(1)} s) · reparto y agentes`);
  }
  const spans: Array<{ label: string; start: number; seconds: number }> = [];
  spans.push(...spansOpening);
  const cues: SubtitleCue[] = [];
  for (const scene of indexedScenes(film)) {
    if (onlyScene && scene.label !== onlyScene) continue;
    const sceneStart = cursor;
    for (const { shot, label } of scene.shots) {
      const dir = path.join(root, label.toLowerCase());
      const current = shotVideos.get(label) ?? null;
      const src = current?.file;
      if (!src) { missingVideo.push(label); continue; }
      const onCamera = isOnCamera(shot);
      const speaker = speakerKey(film.id, shot.speakerId);
      const hasLine = !onCamera && (shot.spokenText ?? '').trim().length > 0;
      const camVoice = onCamera && flag('--voz-oficial-camara') ? await cameraVoiceFor(label, src) : null;
      const voice = camVoice ?? (hasLine && await exists(voiceFile(label)) ? voiceFile(label) : null);
      if (hasLine && !voice) missingVoice.push(label);
      // Voz en off sobre un video que se generó hablando: se silencia el video para que no tape la voz.
      // Si la toma nació como diálogo (frase «» en el guion, plan B anterior o video generado hablando),
      // su video trae voces: con voz en off se silencia por completo.
      const bornAsDialogue = (shot.visualPrompt ?? '').includes('«') || shot.metadata?.planB != null;
      const muteVideo = !onCamera && !!voice && (bornAsDialogue || await videoHasSpeech(label));
      const p = await shotPart(work, ++i, label, src, voice, ambient, { onCamera, cameraVoice: !!camVoice, muteVideo, treatment: camVoice ? null : voiceTreatment(speaker) });
      parts.push(p.out);
      const line = (shot.spokenText ?? '').trim();
      if (line && voice && p.voiceSeconds && !camVoice) cues.push(...cuesForLine(line, cursor + VOICE_START_SECONDS, cursor + VOICE_START_SECONDS + p.voiceSeconds));
      else if (line && onCamera) cues.push(...cuesForLine(line, cursor + 0.3, Math.min(cursor + p.seconds - 0.15, cursor + 0.3 + speechSeconds(line) + 0.6)));
      cursor += p.seconds;
      console.log(`  OK ${label}${current?.repaired ? ' (reparada)' : ''}  ${p.seconds.toFixed(1)} s${onCamera ? '  diálogo en cámara' : ''}${muteVideo ? '  (voces del video silenciadas)' : ''}${p.slow < 1 ? ` (cámara lenta ${Math.round(p.slow * 100)} % para la voz)` : ''}${p.freeze ? ` (alargada ${p.freeze.toFixed(1)} s para la voz)` : ''}${voice ? '' : hasLine ? '  SIN VOZ' : ''}`);
    }
    if (cursor > sceneStart) spans.push({ label: scene.label, start: sceneStart, seconds: cursor - sceneStart });
  }
  if (!parts.length) throw new Error('No hay videos generados todavía.');

  const closing = typeof film.metadata?.closingCard === 'string' ? film.metadata.closingCard as string : '';
  if (closing && !onlyScene) {
    const voice = await exists(voiceFile('CIERRE')) ? voiceFile('CIERRE') : null;
    const secs = Math.max(6, voice ? (await probe(voice)) + 2 : 6);
    parts.push(await cardPart(work, 'cierre-pregunta', splitLine(closing), secs, voice, null, font));
    console.log('  OK cierre: pregunta final');
  }
  const coverName = ['portada.jpg', 'portada.jpeg', 'portada.png'];
  const cover = (await Promise.all(coverName.map(async (f) => (await exists(path.join(root, f))) ? path.join(root, f) : null))).find(Boolean) ?? null;
  const book = typeof film.metadata?.book === 'string' ? (film.metadata.book as string).split('—') : [film.title];
  const author = typeof film.metadata?.author === 'string' ? 'Una novela de ' + film.metadata.author : '';
  const endLines = Array.isArray(film.metadata?.endCardLines) ? (film.metadata.endCardLines as unknown[]).map(String) : null;
  if (!onlyScene) parts.push(await cardPart(work, 'cierre-titulo', endLines ?? [book[0].trim().toUpperCase(), ...(book[1] ? [book[1].trim()] : []), ...(author ? [author] : [])], 6, null, endLines ? null : cover, font));
  if (!onlyScene) console.log('  OK cierre: ' + (cover ? 'portada del libro' : 'título del libro'));
  let endSeconds = 0;
  if (!flag('--sin-creditos') && !onlyScene) {
    const credits = await endCreditsSequence(work, facts, font, serieOf(film));
    for (const c of credits) { parts.push(c.out); endSeconds += c.seconds; }
    console.log(`  OK créditos finales: ${credits.length} tarjetas`);
  }
  // La portada del libro cierra la película (después de los créditos).
  // Si la tarjeta de título ya mostró la portada, no se repite al final.
  const finalCover = onlyScene || flag('--sin-portada') || (!endLines && cover) ? null : await bookCover(serieOf(film));
  if (finalCover) {
    parts.push((await coverCard(work, finalCover, 7)).out);
    endSeconds += 7;
    console.log('  OK portada del libro al final');
  }

  const list = path.join(work, 'lista.txt');
  await writeFile(list, parts.map((p) => "file '" + p.replace(/\\/g, '/') + "'").join('\n') + '\n', 'ascii');
  const joined = path.join(work, 'unida.mp4');
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
  const total = await probe(joined);

  const globalMusic = option('--musica') ?? ((await exists(path.join(root, 'musica.mp3'))) ? path.join(root, 'musica.mp3') : undefined);
  if (globalMusic && !(await exists(globalMusic))) throw new Error('No encuentro la música: ' + globalMusic);
  // Música por secuencia: <película>\musica\E01.mp3 (o .wav/.m4a). Si falta, la global (si hay).
  const tracks: Array<{ file: string; start: number; seconds: number }> = [];
  for (const span of spans) {
    let file: string | undefined;
    for (const ext of ['mp3', 'wav', 'm4a']) { const f = path.join(root, 'musica', `${span.label}.${ext}`); if (await exists(f)) { file = f; break; } }
    if (!file && span.label === 'APERTURA') {
      // Sin tema propio: la apertura usa la música de la primera secuencia que tenga.
      for (const other of spans) for (const ext of ['mp3', 'wav', 'm4a']) {
        const f = path.join(root, 'musica', `${other.label}.${ext}`);
        if (!file && other.label !== 'APERTURA' && await exists(f)) file = f;
      }
    }
    if (file) tracks.push({ file, start: span.start, seconds: span.seconds });
  }
  if (!tracks.length && globalMusic) tracks.push({ file: globalMusic, start: 0, seconds: total });
  // Créditos finales y portada: suena el tema de la apertura (o la primera música disponible).
  if (endSeconds > 0) {
    let endFile: string | undefined;
    for (const label of ['APERTURA', ...spans.map((x) => x.label)]) for (const ext of ['mp3', 'wav', 'm4a']) {
      const f = path.join(root, 'musica', `${label}.${ext}`);
      if (!endFile && await exists(f)) endFile = f;
    }
    if (endFile) tracks.push({ file: endFile, start: Math.max(0, total - endSeconds), seconds: endSeconds });
  }
  const safeTitle = film.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 80);
  const final = path.join(finalDir, onlyScene ? `avance-${onlyScene}-${stamp}.mp4` : `${safeTitle}-${stamp}.mp4`);
  const master = 'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000';
  if (tracks.length) {
    const inputs = ['-i', joined];
    const chains: string[] = ['[0:a]asplit=2[dlg][key]'];
    tracks.forEach((c, k) => {
      inputs.push('-stream_loop', '-1', '-i', c.file);
      const ms = Math.round(c.start * 1000);
      const fadeOut = Math.max(0, c.seconds - 2.5);
      chains.push(`[${k + 1}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${fmt(c.seconds)},asetpts=PTS-STARTPTS,` +
        `afade=t=in:d=1.5,afade=t=out:st=${fmt(fadeOut)}:d=2.5,volume=0.3,adelay=${ms}|${ms}[m${k}]`);
    });
    const mix = tracks.map((_, k) => `[m${k}]`).join('');
    // La música baja sola cuando hay voz (los diálogos siempre se entienden).
    chains.push(`${mix}amix=inputs=${tracks.length}:duration=longest:normalize=0,apad,atrim=0:${fmt(total)}[mus]`);
    chains.push('[mus][key]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=450[duck]');
    chains.push(`[dlg][duck]amix=inputs=2:duration=first:normalize=0,${master}[a]`);
    await ffmpeg([...inputs, '-filter_complex', chains.join(';'), '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', final]);
  } else {
    await ffmpeg(['-i', joined, '-af', master, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', final]);
  }
  const music = tracks.length > 0;
  // Subtítulos: español siempre; inglés con --ingles. Pistas seleccionables (apagadas por defecto) + archivos .srt.
  let burned = '';
  if (cues.length) {
    const srt = final.replace(/\.mp4$/, '.srt');
    await writeFile(srt, buildSrt(cues), 'utf8');
    const tracks: Array<{ file: string; lang: string; title: string }> = [{ file: srt, lang: 'spa', title: 'Español' }];
    if (flag('--ingles')) {
      const sentences = [...new Set(cues.map((c) => c.text.replace(/\n/g, ' ')))];
      const english = await translateToEnglish(root, sentences, film.premise);
      // Se traduce cada bloque completo y se vuelve a partir en líneas de 42 caracteres.
      const enCues = cues.flatMap((c) => cuesForLine(english.get(c.text.replace(/\n/g, ' ')) ?? c.text, c.start, c.end));
      const enSrt = final.replace(/\.mp4$/, '.en.srt');
      await writeFile(enSrt, buildSrt(enCues), 'utf8');
      tracks.push({ file: enSrt, lang: 'eng', title: 'English' });
    }
    const withSubs = path.join(work, 'con-subtitulos.mp4');
    const subArgs = tracks.flatMap((t) => ['-i', t.file]);
    const maps = tracks.flatMap((_, k) => ['-map', `${k + 1}:0`]);
    const meta = tracks.flatMap((t, k) => [`-metadata:s:s:${k}`, `language=${t.lang}`, `-metadata:s:s:${k}`, `title=${t.title}`, `-disposition:s:${k}`, '0']);
    await ffmpeg(['-i', final, ...subArgs, '-map', '0:v', '-map', '0:a', ...maps, '-c', 'copy', '-c:s', 'mov_text', ...meta, '-movflags', '+faststart', withSubs]);
    await rm(final, { force: true });
    await rename(withSubs, final).catch(async () => { await copyFile(withSubs, final); });
    if (flag('--subtitulos-fijos')) {
      // Grabados en la imagen (para redes sociales): se ven en cualquier reproductor.
      await copyFile(flag('--ingles') && flag('--fijos-en-ingles') ? final.replace(/\.mp4$/, '.en.srt') : srt, path.join(work, 'subs.srt'));
      burned = final.replace(/\.mp4$/, '-subtitulada.mp4');
      const style = "FontName=Arial,FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=34";
      await ffmpeg(['-i', final, '-vf', `subtitles=subs.srt:force_style='${style}'`, '-map', '0:v', '-map', '0:a',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-c:a', 'copy', '-movflags', '+faststart', burned], work);
    }
  }
  await rm(work, { recursive: true, force: true });
  console.log(`\nPELÍCULA LISTA: ${parts.length} partes, ${Math.round(total)} s (${(total / 60).toFixed(1)} min)${music ? `, con música (${tracks.length} pista${tracks.length > 1 ? 's' : ''})` : ', sin música'}.`);
  console.log('Archivo: ' + final);
  if (cues.length) console.log(`Subtítulos en español: ${cues.length} (${flag('--ingles') ? 'español + inglés' : 'español'}: pistas seleccionables en el MP4 y archivos .srt)` + (burned ? `\nVersión con subtítulos grabados: ${burned}` : '  ·  grabados en la imagen: --subtitulos-fijos' + (flag('--ingles') ? '' : '  ·  inglés: --ingles')));
  if (missingVideo.length) console.log('Sin video todavía: ' + missingVideo.join(', '));
  if (missingVoice.length) console.log('Sin voz todavía: ' + missingVoice.join(', ') + '  ->  npm run voces -- ' + key + ' --generar');
}

try {
  if (mode === 'voces') await voces(); else await montar();
} catch (error) {
  console.error('\nERROR: ' + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
}
