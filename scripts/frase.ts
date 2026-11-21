/**
 * QUITAR LO QUE NO SE ENTIENDE de una toma, conservando la voz ORIGINAL del personaje, y FIJARLA.
 *
 *   npm run frase -- episodio1 --quitar E01-P10                       lista los trozos de voz (con lo que dice cada uno) y una vista previa
 *   npm run frase -- episodio1 --quitar E01-P10 --segmento 2          vista previa quitando el trozo 2
 *   npm run frase -- episodio1 --quitar E01-P10 --segmento 2 --aplicar   lo aplica
 *   npm run frase -- episodio1 --quitar E01-P10 --tramo 1.1-2.5 [--aplicar]   tramo exacto en segundos
 *
 * Se recorta ese trozo del VIDEO y del AUDIO a la vez: la voz es la original y los labios siguen
 * sincronizados. No se añade ninguna voz. El original nunca se borra. La toma queda fijada.
 *
 *   npm run frase -- episodio1 --fijar E01-P01,E01-P02     solo fijar tomas
 *   npm run frase -- episodio1 --soltar E01-P10            quitar la fijación
 *   npm run frase -- episodio1 --quitar-toma E09-P05       sacar la toma entera del montaje (--devolver-toma la vuelve a poner)
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import nextEnv from '@next/env';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { readV7FilmBundle, v7FilmRoot } from '../lib/v7/storage/film-store';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';
import { googleClient, videoPlatform } from '../lib/v7/production/scene-veo-engine';
import { currentShotVideo, fileSha256, originalShotVideo, trimmedRecordPath, trimmedVideoPath } from '../lib/v7/production/shot-current-video';
import { speakerKey, voiceSettings } from '../lib/v7/production/film-voice-mix';
import { lockShot, removeShot, restoreShot, unlockShot } from '../lib/v7/production/shot-lock';
import { QA_MODELS } from '../lib/v7/qa/shot-vision-runner';
import { extraneousSpan, wordMatch } from '../lib/v7/qa/listen-check';

const run = promisify(execFile);
nextEnv.loadEnvConfig(process.cwd());
const args = process.argv.slice(2);
const key = args.find((a) => FILM_KEYS[a]) ?? '';
const filmId = FILM_KEYS[key];
const option = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
if (!filmId) { console.log('Uso: npm run frase -- episodio1 --toma E01-P10 --conservar "Si Dios existe" --resto "voy a pedirle que te deje conmigo"'); process.exit(1); }
const root = v7FilmRoot(filmId);
const list = (f: string) => (option(f) ?? '').toUpperCase().split(',').map((x) => x.trim()).filter(Boolean);

async function silences(file: string) {
  const { stderr } = await run('ffmpeg', ['-nostdin', '-i', file, '-af', 'silencedetect=noise=-32dB:d=0.18', '-f', 'null', '-'], { maxBuffer: 1 << 24 }).catch((e) => e as { stderr: string });
  return [...String(stderr).matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
}

/** Segundo en que termina la parte que se conserva (estimación de Gemini ajustada a la pausa real). */
async function keepEnd(audio: string, keep: string) {
  const platform = videoPlatform();
  const ai = googleClient(platform, platform === 'vertex' ? (process.env.V7_QA_LOCATION?.trim() || 'global') : undefined);
  const data = (await readFile(audio)).toString('base64');
  const prompt = `En este audio en español, ¿en qué segundo exacto TERMINA de decirse «${keep}»? ` +
    'Responde solo con JSON: {"fin": segundos con decimales}.';
  let estimate: number | null = null;
  for (const model of QA_MODELS) {
    try {
      const res = await ai.models.generateContent({ model, contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/mp3', data } }, { text: prompt }] }],
        config: { temperature: 0, responseMimeType: 'application/json' } });
      const n = Number(JSON.parse(res.text ?? '{}').fin);
      if (Number.isFinite(n) && n > 0) { estimate = n; break; }
    } catch (e) { if (!/404|NOT_FOUND|not found|is not supported/i.test(String((e as Error)?.message))) throw e; }
  }
  const pauses = (await silences(audio)).filter((t) => t > 0.4);
  if (estimate == null && !pauses.length) throw new Error('No pude localizar el final de «' + keep + '». Indícalo con --corte 1.8');
  if (estimate == null) return pauses[0];
  // La pausa real más cercana a la estimación (la frase acaba justo antes de un silencio).
  const near = pauses.filter((t) => Math.abs(t - estimate!) <= 0.8).sort((a, b) => Math.abs(a - estimate!) - Math.abs(b - estimate!))[0];
  return near ?? estimate;
}

async function tts(text: string, voiceId: string, speaker: string, out: string) {
  const k = process.env.ELEVENLABS_API_KEY?.trim();
  if (!k) throw new Error('Falta la clave del Agente de Voz (ELEVENLABS_API_KEY).');
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': k, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2', voice_settings: voiceSettings(speaker) })
  });
  if (!res.ok) throw new Error('El Agente de Voz rechazó la frase (' + res.status + '): ' + (await res.text()).slice(0, 200));
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
}

type Word = { palabra: string; inicio: number; fin: number; inteligible: boolean };
/** Palabras con tiempos; marca las que no son español real o no se entienden. */
async function wordsOf(audio: string): Promise<Word[]> {
  const platform = videoPlatform();
  const ai = googleClient(platform, platform === 'vertex' ? (process.env.V7_QA_LOCATION?.trim() || 'global') : undefined);
  const data = (await readFile(audio)).toString('base64');
  const prompt = 'Escucha este audio en español. Lista TODAS las palabras habladas en orden con su inicio y fin en segundos. ' +
    'Marca inteligible=false las que no son palabras reales del español o no se entienden. ' +
    'Responde solo JSON: [{"palabra":"…","inicio":0.0,"fin":0.0,"inteligible":true}]';
  for (const model of QA_MODELS) {
    try {
      const res = await ai.models.generateContent({ model, contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/mp3', data } }, { text: prompt }] }],
        config: { temperature: 0, responseMimeType: 'application/json' } });
      const list = JSON.parse(res.text ?? '[]') as Word[];
      if (Array.isArray(list)) return list.filter((w) => Number.isFinite(w.inicio) && Number.isFinite(w.fin));
    } catch (e) { if (!/404|NOT_FOUND|not found|is not supported/i.test(String((e as Error)?.message))) throw e; }
  }
  throw new Error('No pude escuchar la toma.');
}

type Segment = { n: number; start: number; end: number; text: string; inGuion: number };

/** Trozos de voz separados por pausas reales del audio. */
async function speechSegments(file: string, duration: number) {
  const { stderr } = await run('ffmpeg', ['-nostdin', '-i', file, '-af', 'silencedetect=noise=-34dB:d=0.12', '-f', 'null', '-'], { maxBuffer: 1 << 24 }).catch((e) => e as { stderr: string });
  const starts = [...String(stderr).matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...String(stderr).matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const silences = starts.map((st, i) => [st, ends[i] ?? duration] as [number, number]);
  const out: Array<[number, number]> = [];
  let cursor = 0;
  for (const [st, en] of silences) { if (st - cursor > 0.15) out.push([cursor, st]); cursor = en; }
  if (duration - cursor > 0.15) out.push([cursor, duration]);
  return out;
}

async function transcribe(file: string) {
  const platform = videoPlatform();
  const ai = googleClient(platform, platform === 'vertex' ? (process.env.V7_QA_LOCATION?.trim() || 'global') : undefined);
  const data = (await readFile(file)).toString('base64');
  for (const model of QA_MODELS) {
    try {
      const res = await ai.models.generateContent({ model, contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/mp3', data } },
        { text: 'Transcribe literalmente en español lo que se dice. Si no se entiende, escribe cómo suena entre corchetes. Solo la transcripción.' }] }], config: { temperature: 0 } });
      return (res.text ?? '').trim();
    } catch (e) { if (!/404|NOT_FOUND|not found|is not supported/i.test(String((e as Error)?.message))) throw e; }
  }
  return '';
}

const norm = (w: string) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-zñ0-9 ]/g, ' ').split(/\s+/).filter(Boolean);

async function quitar(label: string) {
  const dir = path.join(root, label.toLowerCase());
  const original = await originalShotVideo(dir, label);
  if (!original) throw new Error('La toma ' + label + ' no tiene video.');
  const duration = Number((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', original])).stdout.trim());
  const work = path.join(root, 'voces', 'frases');
  await mkdir(work, { recursive: true });
  const planFile = path.join(work, `${label}-plan.json`);
  const sha = await fileSha256(original);
  const { film } = await readV7FilmBundle(filmId);
  const line = indexedScenes(film).flatMap((x) => x.shots).find((x) => x.label === label)?.shot.spokenText ?? '';
  const guion = new Set(norm(line));

  let ranges: Array<[number, number]>;
  const manual = option('--tramo');
  const pick = (option('--segmento') ?? '').split(',').map(Number).filter((n) => n > 0);
  const saved = JSON.parse(await readFile(planFile, 'utf8').catch(() => 'null')) as { sha?: string; segments?: Segment[]; ranges?: Array<[number, number]> } | null;

  if (manual) {
    const [f, t] = manual.split('-').map(Number);
    if (!(f >= 0 && t > f && t <= duration + 0.01)) throw new Error('Tramo inválido. Ejemplo: --tramo 1.1-2.5');
    ranges = [[f, t]];
  } else {
    let segments = saved?.sha === sha ? saved.segments ?? [] : [];
    if (!segments.length) {
      // Escucha: cada trozo de voz se transcribe por separado (más fiable que los tiempos por palabra).
      const audio = path.join(work, `${label}-escucha.mp3`);
      await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', original, '-vn', '-ac', '1', '-ar', '22050', audio]);
      const spans = await speechSegments(audio, duration);
      for (const [i, [st, en]] of spans.entries()) {
        const piece = path.join(work, `${label}-trozo-${i + 1}.mp3`);
        await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', st.toFixed(3), '-to', en.toFixed(3), '-i', audio, piece]);
        const text = await transcribe(piece);
        const words = norm(text.replace(/\[[^\]]*\]/g, ' x '));
        const inGuion = words.length ? words.filter((w) => guion.has(w)).length / words.length : 0;
        segments.push({ n: i + 1, start: st, end: en, text, inGuion });
      }
    }
    console.log(`${label} · guion: «${line}»`);
    for (const g of segments) console.log(`  trozo ${g.n}: ${g.start.toFixed(2)}–${g.end.toFixed(2)} s  «${g.text}»  ${g.inGuion >= 0.6 ? '(del guion)' : '<- NO está en el guion'}`);
    // Trozos ajenos al guion (nunca el primero: la frase empieza ahí; el último sí, si sobra al final).
    const chosen = pick.length ? segments.filter((g) => pick.includes(g.n))
      : segments.filter((g, i) => g.inGuion < 0.6 && i > 0);
    // SALVAGUARDA: lo que queda debe contener la frase completa del guion; si no, cortar no sirve.
    const keptText = segments.filter((g) => !chosen.includes(g)).map((g) => g.text).join(' ');
    const coverage = wordMatch(line, keptText.replace(/\[[^\]]*\]/g, ' '));
    if (!pick.length && coverage < 0.85) {
      await writeFile(planFile, JSON.stringify({ sha, segments }, null, 2) + '\n');
      console.log(`${label}: FALTA PARTE DE LA FRASE (se oye el ${Math.round(coverage * 100)} % del guion). Cortar no basta: hay que REGENERAR esta toma.`);
      process.exitCode = 3;
      return;
    }
    if (!chosen.length) {
      await writeFile(planFile, JSON.stringify({ sha, segments }, null, 2) + '\n');
      console.log(`${label}: se entiende la frase completa; no hay nada que quitar.`);
      return;
    }
    ranges = chosen.map((g) => [Math.max(0, g.start - 0.04), Math.min(duration, g.end + 0.04)] as [number, number]);
    await writeFile(planFile, JSON.stringify({ sha, segments, ranges }, null, 2) + '\n');
  }

  const keep = ranges.map(([f, t]) => `not(between(t,${f.toFixed(3)},${t.toFixed(3)}))`).join('*');
  console.log(`${label}: se quitaría ${ranges.map(([f, t]) => `${f.toFixed(2)}–${t.toFixed(2)} s`).join(' y ')} (video y audio a la vez).`);
  const target = args.includes('--aplicar') ? trimmedVideoPath(dir, label) : path.join(work, `${label}-vista-previa.mp4`);
  await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', original, '-filter_complex',
    `[0:v]select='${keep}',setpts=N/FRAME_RATE/TB[v];[0:a]aselect='${keep}',asetpts=N/SR/TB[a]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-c:a', 'aac', '-ar', '48000', target]);
  if (!args.includes('--aplicar')) {
    console.log('Vista previa (escúchala): ' + target);
    console.log('No se cambió nada. Si suena bien, repite el MISMO comando añadiendo --aplicar.');
    return;
  }
  await writeFile(trimmedRecordPath(dir, label), JSON.stringify({ label, originalSha256: sha, ranges, createdAt: new Date().toISOString() }, null, 2) + '\n');
  for (const f of [`${label}.editada.mp3`, `${label}.editada.json`]) await rm(path.join(root, 'voces', f), { force: true });
  await lockShot(dir, 'se quitó lo que no se entendía: ' + ranges.map(([f, t]) => `${f.toFixed(2)}–${t.toFixed(2)} s`).join(', '));
  console.log(`${label}: listo. Voz original, sin lo que no se entendía. FIJADA. Siguiente: npm run montar -- ${key}`);
}

async function main() {
  for (const label of list('--soltar')) { await unlockShot(path.join(root, label.toLowerCase())); console.log(`${label}: ya no está fijada.`); }
  for (const label of list('--quitar-toma')) { await removeShot(path.join(root, label.toLowerCase()), 'el autor la quitó'); console.log(`${label}: QUITADA del montaje (el video se conserva; para devolverla: --devolver-toma ${label}).`); }
  for (const label of list('--devolver-toma')) { await restoreShot(path.join(root, label.toLowerCase())); console.log(`${label}: vuelve al montaje.`); }
  for (const label of list('--fijar')) { await lockShot(path.join(root, label.toLowerCase()), 'aprobada por el autor'); console.log(`${label}: FIJADA (ningún agente la tocará).`); }
  // --fijar-escena E02: fija todas las tomas de la escena que ya tienen video.
  for (const sceneLabel of list('--fijar-escena')) {
    const { film } = await readV7FilmBundle(filmId);
    const sc = indexedScenes(film).find((x) => x.label === sceneLabel);
    if (!sc) { console.log('No existe la escena ' + sceneLabel); continue; }
    const done: string[] = [];
    for (const { label } of sc.shots) {
      const dir = path.join(root, label.toLowerCase());
      if (await originalShotVideo(dir, label)) { await lockShot(dir, 'escena aprobada por el autor'); done.push(label); }
    }
    console.log(`${sceneLabel}: FIJADAS ${done.length} tomas (${done.join(', ')}). Ningún agente ni el estudio las vuelve a tocar.`);
  }
  for (const l of list('--quitar')) await quitar(l);
  const label = list('--toma')[0];
  const keep = option('--conservar');
  const rest = option('--resto');
  if (!label) return;
  if (!keep || !rest) throw new Error('Indica --conservar "lo que se oye bien" y --resto "lo que debe seguir".');
  const { film } = await readV7FilmBundle(filmId);
  const entry = indexedScenes(film).flatMap((s) => s.shots).find((x) => x.label === label);
  if (!entry) throw new Error('No encuentro la toma ' + label);
  const dir = path.join(root, label.toLowerCase());
  const current = await currentShotVideo(dir, label, { dialogue: true });
  if (!current) throw new Error('La toma ' + label + ' no tiene video.');
  const speaker = speakerKey(film.id, entry.shot.speakerId);
  const casting = JSON.parse(await readFile(path.join(root, 'voces', 'casting.json'), 'utf8').catch(() => '{}')) as Record<string, { voiceId: string; name: string }>;
  const voiceId = casting[speaker]?.voiceId;
  if (!voiceId) throw new Error('El personaje ' + speaker + ' no tiene voz oficial. Ejecuta antes: npm run voces -- ' + key);

  const work = path.join(root, 'voces', 'frases');
  await mkdir(work, { recursive: true });
  const original = path.join(work, `${label}-original.mp3`);
  await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', current.file, '-vn', '-ac', '2', '-ar', '44100', original]);
  const cut = option('--corte') ? Number(option('--corte')) : await keepEnd(original, keep);
  const restFile = path.join(work, `${label}-resto.mp3`);
  await tts(rest, voiceId, speaker, restFile);
  const out = path.join(root, 'voces', `${label}.editada.mp3`);
  // Se conserva lo bueno hasta el corte (con un fundido corto), una pausa natural y el resto de la frase.
  await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', original, '-i', restFile, '-filter_complex',
    `[0:a]atrim=0:${cut.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=out:st=${Math.max(0, cut - 0.08).toFixed(3)}:d=0.08,aresample=44100,aformat=channel_layouts=stereo[a];` +
    `[1:a]aresample=44100,aformat=channel_layouts=stereo,adelay=220|220[b];[a][b]concat=n=2:v=0:a=1[o]`, '-map', '[o]', out]);
  const sha = (await fileSha256(current.file)).slice(0, 16);
  await writeFile(path.join(root, 'voces', `${label}.editada.json`), JSON.stringify({ label, sha, cut, keep, rest, voiceId, createdAt: new Date().toISOString() }, null, 2) + '\n');
  await lockShot(dir, `frase arreglada: «${keep}… ${rest}»`);
  console.log(`${label}: se conserva «${keep}» hasta el segundo ${cut.toFixed(2)}, se borra lo que no se entiende y sigue «${rest}».`);
  console.log(`${label}: FIJADA (ningún agente la tocará). Siguiente: npm run montar -- ${key}`);
}

try { await main(); } catch (e) { console.error('\nERROR: ' + (e instanceof Error ? e.message : String(e))); process.exit(1); }
