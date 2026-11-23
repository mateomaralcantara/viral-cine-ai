/**
 * PLANO MAESTRO DEL DECORADO (como el retrato oficial de un personaje, pero del lugar).
 *
 *   npm run decorado -- episodio2                 qué decorado usa la película y su estado (gratis)
 *   npm run decorado -- episodio2 --generar       crear el plano maestro (~US$0.04; el anterior va a «archivo»)
 *   npm run decorado -- episodio2 --aprobar       fijarlo como oficial: todas las fotos de continuidad lo usarán
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import nextEnv from '@next/env';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { CONVIDADOS_DECORADOS } from '../lib/v7/presets/convidados-reparto';
import { readV7FilmBundle } from '../lib/v7/storage/film-store';
import { serieOf } from '../lib/v7/production/character-identity';
import { GeminiImageMaker } from '../lib/v7/production/gemini-image';
import { readSetSheet, setMasterPath, setMasterPrompt, writeSetSheet } from '../lib/v7/production/set-master';

nextEnv.loadEnvConfig(process.cwd());
const args = process.argv.slice(2);
const key = args.find((a) => FILM_KEYS[a]) ?? '';
const filmId = FILM_KEYS[key];
if (!filmId) { console.log('Uso: npm run decorado -- ' + Object.keys(FILM_KEYS).join('|') + ' [--generar | --aprobar]'); process.exit(1); }

async function main() {
  const { film } = await readV7FilmBundle(filmId);
  const serie = serieOf(film);
  const setKey = typeof film.metadata?.decorado === 'string' ? film.metadata.decorado : '';
  if (!setKey) { console.log('Esta película no tiene decorado fijo. Actualízala: npm run crear:pelicula -- ' + key + ' --actualizar-textos'); return; }
  const def = CONVIDADOS_DECORADOS.find((d) => d.key === setKey);
  const sheet = (await readSetSheet(serie, setKey)) ?? (def ? { key: def.key, nombre: def.nombre, descripcion: def.descripcion, aprobado: null } : null);
  if (!sheet) throw new Error('No encuentro la descripción del decorado ' + setKey);
  const file = setMasterPath(serie, setKey);
  console.log(`DECORADO «${sheet.nombre}» · ${sheet.aprobado ? 'APROBADO' : 'sin aprobar'}\n${sheet.descripcion}\nArchivo: ${file}`);
  if (args.includes('--generar')) {
    await new GeminiImageMaker().make([], setMasterPrompt(sheet.nombre, sheet.descripcion), file);
    await writeSetSheet(serie, { ...sheet, aprobado: null });
    console.log('\nLISTO. Míralo (abre el archivo de arriba). Si te gusta: npm run decorado -- ' + key + ' --aprobar');
    console.log('Si no, repite --generar (el anterior queda en «archivo»).');
    return;
  }
  if (args.includes('--aprobar')) {
    const sha = createHash('sha256').update(await readFile(file)).digest('hex');
    await writeSetSheet(serie, { ...sheet, aprobado: { maestroSha256: sha, fecha: new Date().toISOString() } });
    console.log('\nPlano maestro APROBADO. Todas las fotos de continuidad de este lugar lo usarán.');
    return;
  }
  if (!sheet.aprobado) console.log('\nPara crearlo: npm run decorado -- ' + key + ' --generar');
}

try { await main(); } catch (e) { console.error('\nERROR: ' + (e instanceof Error ? e.message : String(e))); process.exit(1); }
