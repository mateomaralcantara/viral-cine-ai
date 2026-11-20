/**
 * ARREGLAR UNA FRASE (solo audio, sin regenerar video) y FIJAR la toma.
 *
 *   npm run frase -- episodio1 --toma E01-P10 --conservar "Si Dios existe" --resto "voy a pedirle que te deje conmigo"
 *
 * 1. Escucha la toma y encuentra dónde termina lo que se conserva (transcripción con tiempos + pausa real).
 * 2. Borra lo que viene después (lo que no se entiende).
 * 3. Continúa con el resto de la frase en la voz oficial del personaje.
 * 4. Fija la toma: ningún agente la vuelve a tocar.
 * El video no cambia. El original nunca se borra.
 *
 *   npm run frase -- episodio1 --fijar E01-P01,E01-P02     solo fijar tomas
 *   npm run frase -- episodio1 --soltar E01-P10            quitar la fijación
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import nextEnv from '@next/env';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { readV7FilmBundle, v7FilmRoot } from '../lib/v7/storage/film-store';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';
import { googleClient, videoPlatform } from '../lib/v7/production/scene-veo-engine';
import { currentShotVideo, fileSha256 } from '../lib/v7/production/shot-current-video';
import { speakerKey, voiceSettings } from '../lib/v7/production/film-voice-mix';
import { lockShot, unlockShot } from '../lib/v7/production/shot-lock';
import { QA_MODELS } from '../lib/v7/qa/shot-vision-runner';

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

async function main() {
  for (const label of list('--soltar')) { await unlockShot(path.join(root, label.toLowerCase())); console.log(`${label}: ya no está fijada.`); }
  for (const label of list('--fijar')) { await lockShot(path.join(root, label.toLowerCase()), 'aprobada por el autor'); console.log(`${label}: FIJADA (ningún agente la tocará).`); }
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
