/**
 * AGENTE DE ESCUCHA: ¿se entiende lo que dicen? Transcribe el audio real de cada toma y lo
 * compara con el guion (céntimos). No cambia nada.
 *
 *   npm run escuchar -- episodio1 --toma E01-P10
 *   npm run escuchar -- episodio1 --escena E01
 *
 * Para cada toma con frase escucha:
 *   - el audio del VIDEO (lo que dice Veo en cámara, o lo que suena de fondo),
 *   - la VOZ EN OFF (si la toma la usa).
 * y avisa si el audio del video tiene voces que tapan la voz en off.
 */
import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import nextEnv from '@next/env';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { readV7FilmBundle, v7FilmRoot } from '../lib/v7/storage/film-store';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';
import { googleClient, videoPlatform } from '../lib/v7/production/scene-veo-engine';
import { currentShotVideo } from '../lib/v7/production/shot-current-video';
import { QA_MODELS } from '../lib/v7/qa/shot-vision-runner';
import { listenVerdict, TRANSCRIBE_PROMPT, wordMatch } from '../lib/v7/qa/listen-check';

const run = promisify(execFile);
nextEnv.loadEnvConfig(process.cwd());
const args = process.argv.slice(2);
const key = args.find((a) => FILM_KEYS[a]) ?? '';
const filmId = FILM_KEYS[key];
const option = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
if (!filmId) { console.log('Uso: npm run escuchar -- ' + Object.keys(FILM_KEYS).join('|') + ' [--toma E01-P10] [--escena E01]'); process.exit(1); }
const onlyShots = (option('--toma') ?? '').toUpperCase().split(',').map((x) => x.trim()).filter(Boolean);
const onlyScene = option('--escena')?.toUpperCase();
const root = v7FilmRoot(filmId);
const exists = (f: string) => access(f).then(() => true, () => false);

const platform = videoPlatform();
const ai = googleClient(platform, platform === 'vertex' ? (process.env.V7_QA_LOCATION?.trim() || 'global') : undefined);

async function transcribe(audioFile: string) {
  const data = (await readFile(audioFile)).toString('base64');
  let last = '';
  for (const model of QA_MODELS) {
    try {
      const res = await ai.models.generateContent({ model, contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/mp3', data } }, { text: TRANSCRIBE_PROMPT }] }], config: { temperature: 0 } });
      return (res.text ?? '').trim();
    } catch (e) {
      last = String((e as Error)?.message ?? e);
      if (!/404|NOT_FOUND|not found|is not supported/i.test(last)) throw e;
    }
  }
  throw new Error(last);
}

async function main() {
  const { film } = await readV7FilmBundle(filmId);
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'escuchar-'));
  try {
    for (const scene of indexedScenes(film)) {
      if (onlyScene && scene.label !== onlyScene) continue;
      for (const { shot, label } of scene.shots) {
        if (onlyShots.length && !onlyShots.includes(label)) continue;
        const line = (shot.spokenText ?? '').trim();
        if (!line) continue;
        const onCamera = shot.metadata?.onCameraDialogue === true;
        const current = await currentShotVideo(path.join(root, label.toLowerCase()), label, { dialogue: onCamera });
        console.log(`\n${label} · ${onCamera ? 'diálogo en cámara' : 'voz en off'} · guion: «${line}»`);
        if (current) {
          const a = path.join(tmp, label + '-video.mp3');
          try {
            await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', current.file, '-vn', '-ac', '1', '-ar', '22050', a]);
            const heard = await transcribe(a);
            const score = wordMatch(line, heard);
            console.log(`  VIDEO${current.repaired ? ' (reparada)' : ''}: «${heard || '(silencio)'}»`);
            if (onCamera) console.log(`    -> ${listenVerdict(score)} (${Math.round(score * 100)} % de las palabras del guion)`);
            else if (plain(heard)) console.log('    -> AVISO: el video tiene voces propias que suenan por debajo de la voz en off');
          } catch (e) { console.log('  VIDEO: sin audio o error: ' + (e as Error).message.slice(0, 120)); }
        }
        const vo = path.join(root, 'voces', label + '.mp3');
        if (!onCamera && await exists(vo)) {
          const heard = await transcribe(vo);
          const score = wordMatch(line, heard);
          console.log(`  VOZ EN OFF: «${heard}»  ->  ${listenVerdict(score)} (${Math.round(score * 100)} %)`);
        }
      }
    }
  } finally { await rm(tmp, { recursive: true, force: true }); }
}
const plain = (s: string) => s.replace(/\[[^\]]*\]/g, '').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '').length > 0;

try { await main(); } catch (e) { console.error('\nERROR: ' + (e instanceof Error ? e.message : String(e))); process.exit(1); }
