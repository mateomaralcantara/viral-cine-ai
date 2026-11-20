/**
 * Crea una película preparada (guion como datos) en la carpeta de datos local.
 * Solo escribe el guion (bundle): no llama a proveedores ni gasta nada.
 * Nunca sobrescribe una película existente.
 *
 *   npm run crear:pelicula -- primera|convidados
 *   npm run crear:pelicula -- convidados --actualizar-textos
 *   npm run crear:pelicula -- episodio1 --toma E01-P01   (cambio puntual de una toma, aunque tenga video)
 *
 * --actualizar-textos: copia los textos nuevos del guion SOLO a las tomas que aún
 * no tienen video, intento ni versión guardada. Las tomas ya producidas no se tocan.
 */
import { access } from 'node:fs/promises';
import path from 'node:path';
import nextEnv from '@next/env';
import { createPrimeraPaginaBundle, getPrimeraPaginaStats, PRIMERA_PAGINA_ID } from '../lib/v7/presets/la-primera-pagina';
import { createConvidadosBundle, getConvidadosStats, CONVIDADOS_ID } from '../lib/v7/presets/los-convidados-al-agape';
import { createEpisodio1Bundle, getEpisodio1Stats, EPISODIO_1_ID } from '../lib/v7/presets/convidados-episodio-1';
import { readV7FilmBundle, saveV7FilmBundle, v7FilmBundleExists, v7FilmBundlePath, v7FilmRoot } from '../lib/v7/storage/film-store';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';

type FilmEntry = {
  id: string; title: string;
  create: typeof createPrimeraPaginaBundle;
  stats: () => { scenes: number; shots: number; totalSeconds: number };
};
const FILMS: Record<string, FilmEntry> = {
  primera: { id: PRIMERA_PAGINA_ID, title: 'LA PRIMERA PÁGINA', create: createPrimeraPaginaBundle, stats: getPrimeraPaginaStats },
  convidados: { id: CONVIDADOS_ID, title: 'LOS CONVIDADOS AL ÁGAPE', create: createConvidadosBundle, stats: getConvidadosStats },
  episodio1: { id: EPISODIO_1_ID, title: 'LOS CONVIDADOS AL ÁGAPE · EPISODIO 1', create: createEpisodio1Bundle, stats: getEpisodio1Stats }
};

nextEnv.loadEnvConfig(process.cwd());
const exists = async (file: string) => access(file).then(() => true, () => false);
const key = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '';
const film = FILMS[key];
if (!film) {
  console.log('Indica la película: ' + Object.keys(FILMS).join(' | '));
  process.exit(1);
}
const stats = film.stats();

if (!(await v7FilmBundleExists(film.id))) {
  await saveV7FilmBundle(film.create());
  console.log('Creada: ' + v7FilmBundlePath(film.id));
} else if (process.argv.includes('--toma')) {
  // Cambio puntual: solo las tomas indicadas reciben el texto nuevo del guion (aunque ya tengan video).
  const wanted = (process.argv[process.argv.indexOf('--toma') + 1] ?? '').toUpperCase().split(',').map((x) => x.trim()).filter(Boolean);
  const stored = await readV7FilmBundle(film.id);
  const fresh = film.create().film;
  const freshShots = new Map(fresh.acts.flatMap((a) => a.sequences.flatMap((q) => q.scenes.flatMap((s) => s.shots))).map((s) => [s.id, s]));
  const changed: string[] = [];
  for (const scene of indexedScenes(stored.film)) for (const { shot, label } of scene.shots) {
    if (!wanted.includes(label)) continue;
    if (await exists(path.join(v7FilmRoot(film.id), label.toLowerCase(), 'fijada.json'))) { console.log(label + ': fijada por el autor, no se cambia'); continue; }
    const next = freshShots.get(shot.id);
    if (!next) continue;
    shot.title = next.title; shot.camera = next.camera; shot.visualPrompt = next.visualPrompt;
    shot.spokenText = next.spokenText; shot.durationSeconds = next.durationSeconds; shot.speakerId = next.speakerId;
    shot.metadata = { ...shot.metadata, ...next.metadata };
    changed.push(label);
  }
  if (changed.length) await saveV7FilmBundle({ ...stored, savedAt: undefined });
  console.log('Texto nuevo aplicado a: ' + (changed.join(', ') || 'ninguna (revisa la etiqueta)'));
} else if (process.argv.includes('--actualizar-textos')) {
  const stored = await readV7FilmBundle(film.id);
  const fresh = film.create().film;
  const freshShots = new Map(fresh.acts.flatMap((a) => a.sequences.flatMap((q) => q.scenes.flatMap((s) => s.shots))).map((s) => [s.id, s]));
  const changed: string[] = [];
  const kept: string[] = [];
  for (const scene of indexedScenes(stored.film)) {
    for (const { shot, label } of scene.shots) {
      const next = freshShots.get(shot.id);
      if (!next || (next.visualPrompt === shot.visualPrompt && next.spokenText === shot.spokenText)) continue;
      const dir = path.join(v7FilmRoot(film.id), label.toLowerCase());
      if (await exists(path.join(dir, 'provider-operation.json')) || await exists(path.join(dir, 'veo-prompts'))) {
        kept.push(label);
        continue;
      }
      shot.visualPrompt = next.visualPrompt;
      shot.spokenText = next.spokenText;
      changed.push(label);
    }
  }
  if (changed.length) await saveV7FilmBundle({ ...stored, savedAt: undefined });
  console.log('Textos actualizados: ' + (changed.join(', ') || 'ninguno'));
  if (kept.length) console.log('No tocadas (ya tienen video o versión guardada): ' + kept.join(', '));
} else {
  console.log('Ya existe. No se modifica: ' + v7FilmBundlePath(film.id));
  console.log('Para pasar textos nuevos a las tomas sin video: npm run crear:pelicula -- ' + key + ' --actualizar-textos');
}
console.log(`${film.title}: ${stats.scenes} escenas, ${stats.shots} tomas, ${stats.totalSeconds} s. Sin costo.`);
console.log('Ábrela en: http://127.0.0.1:3010/v7/films/' + film.id + '?tab=studio');
