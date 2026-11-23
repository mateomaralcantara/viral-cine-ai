/**
 * Música original por secuencia con Lyria (Google, Vertex AI). Instrumental, sin voces.
 *
 *   npm run musica -- episodio1                 plan: qué secuencias y cuánto cuesta (gratis)
 *   npm run musica -- episodio1 --generar       genera la música que falta (~US$0.06 por cada 30 s)
 *       --escena E03     solo esa secuencia
 *       --repetir        vuelve a generar aunque ya exista (la anterior va a musica\archivo)
 *
 * Deja <película>\musica\E0X.wav. «npm run montar» la pone bajo cada secuencia y la baja
 * sola cuando alguien habla. También puedes poner tu propia música con ese mismo nombre.
 */
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { GoogleAuth } from 'google-auth-library';
import nextEnv from '@next/env';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { readV7FilmBundle, v7FilmRoot } from '../lib/v7/storage/film-store';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';

nextEnv.loadEnvConfig(process.cwd());
const run = promisify(execFile);
const args = process.argv.slice(2);
const key = args.find((a) => FILM_KEYS[a]) ?? '';
const filmId = FILM_KEYS[key];
const flag = (f: string) => args.includes(f);
const option = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1]?.toUpperCase() : undefined; };
if (!filmId) { console.log('Uso: npm run musica -- ' + Object.keys(FILM_KEYS).join('|') + ' [--generar] [--escena E03] [--repetir]'); process.exit(1); }

const CLIP_SECONDS = 30;
const CLIP_USD = 0.06;
const MODEL = process.env.V7_MUSIC_MODEL?.trim() || 'lyria-002';
const exists = (f: string) => access(f).then(() => true, () => false);
const musicDir = path.join(v7FilmRoot(filmId), 'musica');

async function lyria(prompt: string, seed: number): Promise<Buffer> {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  const keyFile = (process.env.V7_VERTEX_KEY_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  const location = process.env.V7_MUSIC_LOCATION?.trim() || 'us-central1';
  if (!project || !keyFile) throw new Error('La música usa Vertex AI: faltan GOOGLE_CLOUD_PROJECT o V7_VERTEX_KEY_FILE en .env.local.');
  const auth = new GoogleAuth({ keyFilename: keyFile, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const token = await auth.getAccessToken();
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${MODEL}:predict`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'x-goog-user-project': project },
    body: JSON.stringify({ instances: [{ prompt, negative_prompt: 'vocals, singing, lyrics, speech, low quality', seed }], parameters: {} }),
    signal: AbortSignal.timeout(180000)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Lyria rechazó la música (${res.status}): ${text.slice(0, 300).replace(/\s+/g, ' ')}`);
  const body = JSON.parse(text) as { predictions?: Array<{ bytesBase64Encoded?: string; audioContent?: string }> };
  const b64 = body.predictions?.[0]?.bytesBase64Encoded ?? body.predictions?.[0]?.audioContent;
  if (!b64) throw new Error('Lyria no devolvió audio (posible filtro de contenido; no se cobra).');
  return Buffer.from(b64, 'base64');
}

async function main() {
  const { film } = await readV7FilmBundle(filmId);
  const only = option('--escena');
  type Job = { label: string; title: string; prompt: string; seconds: number; clips: number };
  const jobs: Job[] = [];
  for (const scene of indexedScenes(film)) {
    if (only && scene.label !== only) continue;
    const prompt = typeof scene.scene.metadata?.musicPrompt === 'string' ? scene.scene.metadata.musicPrompt : '';
    if (!prompt) continue;
    const out = path.join(musicDir, scene.label + '.wav');
    if (!flag('--repetir') && await exists(out)) { console.log(`  ${scene.label}: ya tiene música`); continue; }
    const seconds = scene.scene.durationSeconds;
    jobs.push({ label: scene.label, title: scene.scene.title, prompt, seconds, clips: Math.min(6, Math.max(1, Math.ceil(seconds / (CLIP_SECONDS - 3)))) });
  }
  // Tema principal de la apertura (reparto y agentes, ~40 s).
  if (!only || only === 'APERTURA') {
    const out = path.join(musicDir, 'APERTURA.wav');
    if (!flag('--repetir') && await exists(out)) console.log('  APERTURA: ya tiene música');
    else jobs.unshift({ label: 'APERTURA', title: 'Tema principal (apertura)', seconds: 45, clips: 2,
      prompt: typeof film.metadata?.openingMusicPrompt === 'string' ? film.metadata.openingMusicPrompt
        : 'Original cinematic main title theme, solemn, mysterious and emotional: deep strings, a solo cello melody, soft wordless choir pads, slow majestic build. No vocals.' });
  }
  const clips = jobs.reduce((n, j) => n + j.clips, 0);
  console.log(`Música original (${MODEL}): ${jobs.length} secuencias, ${clips} fragmentos de 30 s · costo ~US$${(clips * CLIP_USD).toFixed(2)}`);
  for (const j of jobs) console.log(`  ${j.label}  ${j.title}  (~${j.seconds} s -> ${j.clips} fragmento${j.clips > 1 ? 's' : ''})`);
  if (!jobs.length) return;
  if (!flag('--generar')) { console.log('\nNo se generó nada. Para generarla: npm run musica -- ' + key + ' --generar'); return; }

  await mkdir(musicDir, { recursive: true });
  for (const j of jobs) {
    process.stdout.write(`  ${j.label}... `);
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'musica-'));
    try {
      const files: string[] = [];
      for (let k = 0; k < j.clips; k++) {
        const f = path.join(tmp, `${k}.wav`);
        await writeFile(f, await lyria(j.prompt, 1000 + k * 7 + j.label.charCodeAt(2)));
        files.push(f);
      }
      // Une los fragmentos con fundidos cruzados de 3 s para que no se note el corte.
      const out = path.join(tmp, 'final.wav');
      if (files.length === 1) await rename(files[0], out);
      else {
        const inputs = files.flatMap((f) => ['-i', f]);
        let chain = '';
        let last = '[0:a]';
        for (let k = 1; k < files.length; k++) {
          const label = k === files.length - 1 ? '[out]' : `[x${k}]`;
          chain += `${last}[${k}:a]acrossfade=d=3:c1=tri:c2=tri${label};`;
          last = label;
        }
        await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...inputs, '-filter_complex', chain.replace(/;$/, ''), '-map', '[out]', '-ar', '48000', out]);
      }
      const target = path.join(musicDir, j.label + '.wav');
      if (await exists(target)) {
        await mkdir(path.join(musicDir, 'archivo'), { recursive: true });
        await rename(target, path.join(musicDir, 'archivo', `${j.label}-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}.wav`));
      }
      await rename(out, target).catch(async () => { await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', out, target]); });
      console.log('OK');
    } catch (e) {
      console.log('ERROR: ' + (e as Error).message);
    } finally { await rm(tmp, { recursive: true, force: true }); }
  }
  console.log('\nMúsica en: ' + musicDir + '\nEscúchala y, si una no te gusta, repítela con --escena E0X --repetir. Siguiente: npm run montar -- ' + key);
}

try { await main(); } catch (e) { console.error('\nERROR: ' + (e instanceof Error ? e.message : String(e))); process.exit(1); }
