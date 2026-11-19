/**
 * Voces y película final.
 *
 *   npm run voces -- convidados             casting + cuenta de caracteres (gratis, no genera)
 *   npm run voces -- convidados --generar   genera con ElevenLabs solo las voces que faltan
 *   npm run montar -- convidados            película final: video + voces + (música) + cierre. Gratis, local.
 *       --musica "C:\ruta\cancion.mp3"     música de fondo (o deja musica.mp3 en la carpeta de la película)
 *       --sin-ambiente                     quita el sonido original de Veo
 *
 * Archivos: <película>\voces\casting.json (editable), <película>\voces\E0X-P0Y.mp3,
 * <película>\final\<título>-<fecha>.mp4. Nunca borra videos ni voces: lo reemplazado va a voces\archivo.
 */
import { execFile } from 'node:child_process';
import { access, copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import nextEnv from '@next/env';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { CONVIDADOS_ID } from '../lib/v7/presets/los-convidados-al-agape';
import { PRIMERA_PAGINA_ID } from '../lib/v7/presets/la-primera-pagina';
import { readV7FilmBundle, v7FilmRoot } from '../lib/v7/storage/film-store';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';
import { currentShotVideo } from '../lib/v7/production/shot-current-video';
import { listSheets, serieOf } from '../lib/v7/production/character-identity';
import { speakerKey } from '../lib/v7/production/film-voice-mix';
import {
  buildSrt, cuesForLine, isOnCamera, pickCasting, speechSeconds, type SubtitleCue, planCharacters, shotTiming, voicePlan, voiceSettings, voiceTreatment, VOICE_ALIASES, VOICE_START_SECONDS,
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

async function voces() {
  const { film } = await readV7FilmBundle(filmId);
  const lines = voicePlan(film);
  const closing = typeof film.metadata?.closingCard === 'string' ? film.metadata.closingCard as string : '';
  if (closing) lines.push({ label: 'CIERRE', title: 'Pregunta final', text: closing, speaker: 'narrador' });
  const allSpeakers = [...new Set(lines.map((l) => l.speaker))];
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
  const onCam = film.acts.flatMap((a) => a.sequences.flatMap((q) => q.scenes.flatMap((sc) => sc.shots))).filter(isOnCamera).length;
  if (onCam) console.log(`  (${onCam} diálogos en cámara: la voz la pone Veo con los labios sincronizados)`);
  const todo = await pending(lines, casting);
  const chars = planCharacters(todo);
  console.log(`\nVoces: ${lines.length - todo.length} listas, ${todo.length} por generar (${chars} caracteres; total guion ${planCharacters(lines)}).`);
  const left = await remainingCharacters();
  if (!todo.length) { console.log('Todas las voces están listas. Siguiente: npm run montar -- ' + key); return; }
  if (left != null && chars > left) throw new Error(`No alcanza: necesitas ${chars} caracteres y quedan ${left}.`);
  if (!flag('--generar')) {
    console.log('\nNo se generó nada. Para generarlas: npm run voces -- ' + key + ' --generar');
    return;
  }
  for (const l of todo) {
    process.stdout.write(`  ${l.label} (${l.speaker})... `);
    await speak(l, casting);
    console.log('OK ' + (await probe(voiceFile(l.label))).toFixed(1) + ' s');
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

async function shotPart(work: string, index: number, label: string, video: string, voice: string | null, ambient: boolean, opts: { onCamera?: boolean; treatment?: string | null } = {}) {
  const videoSeconds = await probe(video);
  const voiceSeconds = voice ? await probe(voice) : null;
  const t = shotTiming(videoSeconds, voiceSeconds);
  const out = path.join(work, String(index).padStart(3, '0') + '-' + label + '.mp4');
  const input = ['-i', video];
  const vf = VF + (t.freeze > 0 ? `,tpad=stop_mode=clone:stop_duration=${fmt(t.freeze)}` : '');
  const amb = (ambient || opts.onCamera) && await hasAudio(video)
    ? `[0:a]aresample=48000,volume=${opts.onCamera ? 1.0 : voice ? 0.3 : 0.8},apad[amb]`
    : `anullsrc=r=48000:cl=stereo[amb]`;
  let filter = `[0:v]${vf}[v];${amb}`;
  if (voice) {
    input.push('-i', voice);
    const ms = Math.round(VOICE_START_SECONDS * 1000);
    const fx = opts.treatment ? opts.treatment + ',' : '';
    filter += `;[1:a]${fx}aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms},volume=1.6,apad[vo];[amb][vo]amix=inputs=2:duration=longest:normalize=0[a]`;
  } else filter += ';[amb]anull[a]';
  await ffmpeg([...input, '-filter_complex', filter, '-map', '[v]', '-map', '[a]', '-t', fmt(t.total), ...ENC, out]);
  return { out, seconds: t.total, freeze: t.freeze, voiceSeconds };
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
  let i = 0;
  let cursor = 0;
  const spans: Array<{ label: string; start: number; seconds: number }> = [];
  const cues: SubtitleCue[] = [];
  for (const scene of indexedScenes(film)) {
    const sceneStart = cursor;
    for (const { shot, label } of scene.shots) {
      const dir = path.join(root, label.toLowerCase());
      const current = await currentShotVideo(dir, label);
      const src = current?.file;
      if (!src) { missingVideo.push(label); continue; }
      const onCamera = isOnCamera(shot);
      const speaker = speakerKey(film.id, shot.speakerId);
      const hasLine = !onCamera && (shot.spokenText ?? '').trim().length > 0;
      const voice = hasLine && await exists(voiceFile(label)) ? voiceFile(label) : null;
      if (hasLine && !voice) missingVoice.push(label);
      const p = await shotPart(work, ++i, label, src, voice, ambient, { onCamera, treatment: voiceTreatment(speaker) });
      parts.push(p.out);
      const line = (shot.spokenText ?? '').trim();
      if (line && voice && p.voiceSeconds) cues.push(...cuesForLine(line, cursor + VOICE_START_SECONDS, cursor + VOICE_START_SECONDS + p.voiceSeconds));
      else if (line && onCamera) cues.push(...cuesForLine(line, cursor + 0.3, Math.min(cursor + p.seconds - 0.15, cursor + 0.3 + speechSeconds(line) + 0.6)));
      cursor += p.seconds;
      console.log(`  OK ${label}${current?.repaired ? ' (reparada)' : ''}  ${p.seconds.toFixed(1)} s${onCamera ? '  diálogo en cámara' : ''}${p.freeze ? ` (alargada ${p.freeze.toFixed(1)} s para la voz)` : ''}${voice ? '' : hasLine ? '  SIN VOZ' : ''}`);
    }
    if (cursor > sceneStart) spans.push({ label: scene.label, start: sceneStart, seconds: cursor - sceneStart });
  }
  if (!parts.length) throw new Error('No hay videos generados todavía.');

  const closing = typeof film.metadata?.closingCard === 'string' ? film.metadata.closingCard as string : '';
  if (closing) {
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
  parts.push(await cardPart(work, 'cierre-titulo', endLines ?? [book[0].trim().toUpperCase(), ...(book[1] ? [book[1].trim()] : []), ...(author ? [author] : [])], 6, null, endLines ? null : cover, font));
  console.log('  OK cierre: ' + (cover ? 'portada del libro' : 'título del libro'));

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
    if (file) tracks.push({ file, start: span.start, seconds: span.seconds });
  }
  if (!tracks.length && globalMusic) tracks.push({ file: globalMusic, start: 0, seconds: total });
  const safeTitle = film.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 80);
  const final = path.join(finalDir, `${safeTitle}-${stamp}.mp4`);
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
  // Subtítulos en español: archivo .srt + pista seleccionable dentro del MP4.
  let burned = '';
  if (cues.length) {
    const srt = final.replace(/\.mp4$/, '.srt');
    await writeFile(srt, buildSrt(cues), 'utf8');
    const withSubs = path.join(work, 'con-subtitulos.mp4');
    await ffmpeg(['-i', final, '-i', srt, '-map', '0:v', '-map', '0:a', '-map', '1:0', '-c', 'copy', '-c:s', 'mov_text',
      '-metadata:s:s:0', 'language=spa', '-metadata:s:s:0', 'title=Español', '-disposition:s:0', 'default', '-movflags', '+faststart', withSubs]);
    await rm(final, { force: true });
    await rename(withSubs, final).catch(async () => { await copyFile(withSubs, final); });
    if (flag('--subtitulos-fijos')) {
      // Grabados en la imagen (para redes sociales): se ven en cualquier reproductor.
      await copyFile(srt, path.join(work, 'subs.srt'));
      burned = final.replace(/\.mp4$/, '-subtitulada.mp4');
      const style = "FontName=Arial,FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=34";
      await ffmpeg(['-i', final, '-vf', `subtitles=subs.srt:force_style='${style}'`, '-map', '0:v', '-map', '0:a',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-c:a', 'copy', '-movflags', '+faststart', burned], work);
    }
  }
  await rm(work, { recursive: true, force: true });
  console.log(`\nPELÍCULA LISTA: ${parts.length} partes, ${Math.round(total)} s (${(total / 60).toFixed(1)} min)${music ? `, con música (${tracks.length} pista${tracks.length > 1 ? 's' : ''})` : ', sin música'}.`);
  console.log('Archivo: ' + final);
  if (cues.length) console.log(`Subtítulos en español: ${cues.length} (pista seleccionable en el MP4 y archivo .srt)` + (burned ? `\nVersión con subtítulos grabados: ${burned}` : '  ·  para grabarlos en la imagen: --subtitulos-fijos'));
  if (missingVideo.length) console.log('Sin video todavía: ' + missingVideo.join(', '));
  if (missingVoice.length) console.log('Sin voz todavía: ' + missingVoice.join(', ') + '  ->  npm run voces -- ' + key + ' --generar');
}

try {
  if (mode === 'voces') await voces(); else await montar();
} catch (error) {
  console.error('\nERROR: ' + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
}
