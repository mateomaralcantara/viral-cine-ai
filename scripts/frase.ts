/**
 * QUITAR LO QUE NO SE ENTIENDE de una toma, conservando la voz ORIGINAL del personaje, y FIJARLA.
 *
 *   npm run frase -- episodio1 --quitar E01-P10                 plan: qué trozo se quitaría (céntimos, no cambia nada)
 *   npm run frase -- episodio1 --quitar E01-P10 --aplicar       lo quita
 *   npm run frase -- episodio1 --quitar E01-P10 --tramo 1.8-3.4 --aplicar   quitar un tramo exacto (segundos)
 *
 * Se recorta ese trozo del VIDEO y del AUDIO a la vez: la voz es la original y los labios siguen
 * sincronizados. No se añade ninguna voz. El original nunca se borra. La toma queda fijada.
 *
 *   npm run frase -- episodio1 --fijar E01-P01,E01-P02     solo fijar tomas
 *   npm run frase -- episodio1 --soltar E01-P10            quitar la fijación
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
import { lockShot, unlockShot } from '../lib/v7/production/shot-lock';
import { QA_MODELS } from '../lib/v7/qa/shot-vision-runner';
import { extraneousSpan } from '../lib/v7/qa/listen-check';

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

async function quitar(label: string) {
  const dir = path.join(root, label.toLowerCase());
  const original = await originalShotVideo(dir, label);
  if (!original) throw new Error('La toma ' + label + ' no tiene video.');
  const duration = Number((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', original])).stdout.trim());
  let from: number, to: number;
  const manual = option('--tramo');
  const planFile = path.join(root, 'voces', 'frases', `${label}-plan.json`);
  const sha = await fileSha256(original);
  const saved = JSON.parse(await readFile(planFile, 'utf8').catch(() => 'null')) as { sha?: string; from?: number; to?: number } | null;
  if (!manual && args.includes('--aplicar') && saved?.sha === sha && saved.from != null && saved.to != null) {
    // Se aplica EXACTAMENTE el tramo que se mostró en el plan (no se vuelve a escuchar).
    from = saved.from; to = saved.to;
  } else if (manual) {
    [from, to] = manual.split('-').map(Number);
    if (!(from >= 0 && to > from && to <= duration + 0.01)) throw new Error('Tramo inválido. Ejemplo: --tramo 1.8-3.4');
  } else {
    const work = path.join(root, 'voces', 'frases');
    await mkdir(work, { recursive: true });
    const audio = path.join(work, `${label}-escucha.mp3`);
    await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', original, '-vn', '-ac', '1', '-ar', '22050', audio]);
    const words = await wordsOf(audio);
    console.log('Se oye: ' + words.map((w) => (w.inteligible ? w.palabra : `[${w.palabra}]`) + `(${w.inicio.toFixed(1)})`).join(' '));
    // Se compara con el GUION: lo que se oye entre palabras del guion y no está en él, se quita.
    const { film } = await readV7FilmBundle(filmId);
    const line = indexedScenes(film).flatMap((x) => x.shots).find((x) => x.label === label)?.shot.spokenText ?? '';
    const span = extraneousSpan(line, words);
    if (!span) { console.log(`${label}: lo que se oye coincide con el guion «${line}»; no hay nada que quitar.`); return; }
    [from, to] = span;
    to = Math.min(duration, to);
  }
  console.log(`${label}: se quitaría del segundo ${from.toFixed(2)} al ${to.toFixed(2)} (${(to - from).toFixed(2)} s), en video y audio.`);
  if (!args.includes('--aplicar')) {
    await mkdir(path.dirname(planFile), { recursive: true });
    await writeFile(planFile, JSON.stringify({ sha, from, to }, null, 2) + '\n');
    const preview = path.join(root, 'voces', 'frases', `${label}-vista-previa.mp4`);
    const keepPrev = `not(between(t,${from.toFixed(3)},${to.toFixed(3)}))`;
    await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', original, '-filter_complex',
      `[0:v]select='${keepPrev}',setpts=N/FRAME_RATE/TB[v];[0:a]aselect='${keepPrev}',asetpts=N/SR/TB[a]`, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '20', '-c:a', 'aac', preview]);
    console.log('Vista previa (escúchala antes de aplicar): ' + preview);
    console.log('No se cambió nada. Si suena bien, repite con --aplicar (usará exactamente este tramo).');
    return;
  }
  const out = trimmedVideoPath(dir, label);
  const keep = `not(between(t,${from.toFixed(3)},${to.toFixed(3)}))`;
  await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', original, '-filter_complex',
    `[0:v]select='${keep}',setpts=N/FRAME_RATE/TB[v];[0:a]aselect='${keep}',asetpts=N/SR/TB,afade=t=in:st=${from.toFixed(3)}:d=0.04[a]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-c:a', 'aac', '-ar', '48000', out]);
  await writeFile(trimmedRecordPath(dir, label), JSON.stringify({ label, originalSha256: await fileSha256(original), from, to, createdAt: new Date().toISOString() }, null, 2) + '\n');
  // Cualquier frase añadida antes con otra voz queda desactivada.
  for (const f of [`${label}.editada.mp3`, `${label}.editada.json`]) await rm(path.join(root, 'voces', f), { force: true });
  await lockShot(dir, `se quitó lo que no se entendía (${from.toFixed(2)}–${to.toFixed(2)} s)`);
  console.log(`${label}: listo. Voz original de Martin, sin el trozo ininteligible. FIJADA. Siguiente: npm run montar -- ${key}`);
}

async function main() {
  for (const label of list('--soltar')) { await unlockShot(path.join(root, label.toLowerCase())); console.log(`${label}: ya no está fijada.`); }
  for (const label of list('--fijar')) { await lockShot(path.join(root, label.toLowerCase()), 'aprobada por el autor'); console.log(`${label}: FIJADA (ningún agente la tocará).`); }
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
