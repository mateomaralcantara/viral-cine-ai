/**
 * Identidad de personajes de una serie (misma cara y misma voz en todos los capítulos).
 *
 *   npm run personaje -- importar convidados            crea las fichas desde el guion (gratis)
 *   npm run personaje -- lista convidados               estado de cada personaje (gratis)
 *   npm run personaje -- nuevo convidados heraldo --nombre "El Heraldo" --descripcion "…"
 *   npm run personaje -- carpeta convidados martin      abre la carpeta donde subir sus fotos
 *   npm run personaje -- maestro convidados martin              ver plan (gratis)
 *   npm run personaje -- maestro convidados martin --generar    crear el retrato oficial (~US$0.04)
 *   npm run personaje -- aprobar convidados martin      fija el retrato como oficial
 *
 * «convidados» puede ser el nombre corto de una película o directamente el de la serie.
 * Las fotos se suben copiándolas a <personaje>\fotos (jpg, png o webp; 1 a 3 fotos).
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import nextEnv from '@next/env';
import { CONVIDADOS_ID } from '../lib/v7/presets/los-convidados-al-agape';
import { PRIMERA_PAGINA_ID } from '../lib/v7/presets/la-primera-pagina';
import { readV7FilmBundle, v7FilmRoot } from '../lib/v7/storage/film-store';
import {
  assertKey, characterDir, characterKeyFromId, hasMaster, listPhotos, listSheets, masterFromPhotosPrompt, masterPath,
  newSheet, photosDir, readSheet, serieOf, writeSheet, type CharacterSheet
} from '../lib/v7/production/character-identity';
import { GeminiImageMaker, IMAGE_USD, imageRef } from '../lib/v7/production/gemini-image';

nextEnv.loadEnvConfig(process.cwd());
const FILMS: Record<string, string> = { convidados: CONVIDADOS_ID, primera: PRIMERA_PAGINA_ID };
const [cmd, target, who] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));
const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const option = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const USAGE = 'Uso: npm run personaje -- importar|lista|nuevo|carpeta|maestro|aprobar <película o serie> [personaje]';

async function resolveSerie(name: string | undefined) {
  if (!name) throw new Error(USAGE);
  if (FILMS[name]) return { serie: serieOf((await readV7FilmBundle(FILMS[name])).film), filmId: FILMS[name] };
  return { serie: assertKey(name, 'serie'), filmId: null as string | null };
}
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
async function mustSheet(serie: string, key: string | undefined) {
  if (!key) throw new Error('Indica el personaje. ' + USAGE);
  const s = await readSheet(serie, assertKey(key, 'personaje'));
  if (!s) throw new Error(`No existe la ficha «${key}» en la serie «${serie}». Usa: importar o nuevo.`);
  return s;
}

async function main() {
  const { serie, filmId } = await resolveSerie(target);
  switch (cmd) {
    case 'importar': {
      if (!filmId) throw new Error('importar necesita el nombre de una película: ' + Object.keys(FILMS).join(', '));
      const { film } = await readV7FilmBundle(filmId);
      let casting: Record<string, { voiceId: string; name: string }> = {};
      try { casting = JSON.parse(await readFile(path.join(v7FilmRoot(filmId), 'voces', 'casting.json'), 'utf8')); } catch { /* sin voces aún */ }
      for (const c of film.characters) {
        const key = characterKeyFromId(c.id);
        const old = await readSheet(serie, key);
        const voice = casting[key] ? { voiceId: casting[key].voiceId, nombre: casting[key].name } : null;
        if (old) {
          if (!old.voz && voice) { await writeSheet(serie, { ...old, voz: voice }); console.log(`  ${key}: ya existía, añadida su voz`); }
          else console.log(`  ${key}: ya existía, no se toca`);
          continue;
        }
        const desc = /sin imagen/i.test(c.appearance) ? '' : c.appearance;
        await writeSheet(serie, newSheet(key, c.name, desc, voice));
        console.log(`  ${key}: ficha creada${voice ? ' (con voz ' + voice.nombre + ')' : ''}`);
      }
      console.log(`\nSerie «${serie}». Sube 1–3 fotos de cada personaje en su carpeta «fotos»:`);
      console.log('  npm run personaje -- carpeta ' + target + ' <personaje>');
      return;
    }
    case 'lista': {
      const sheets = await listSheets(serie);
      if (!sheets.length) { console.log(`La serie «${serie}» no tiene personajes. Usa: npm run personaje -- importar ${target}`); return; }
      console.log(`Serie «${serie}»\n`);
      for (const s of sheets) {
        const photos = (await listPhotos(serie, s.key)).length;
        const master = await hasMaster(serie, s.key);
        let state = 'falta retrato';
        if (master) {
          const current = sha(await readFile(masterPath(serie, s.key)));
          state = s.aprobado?.maestroSha256 === current ? 'APROBADO' : 'retrato por aprobar';
        }
        console.log(`  ${s.key.padEnd(10)} ${s.nombre.padEnd(22)} fotos: ${photos}  ${state.padEnd(20)} voz: ${s.voz?.nombre ?? '-'}`);
      }
      console.log('\nCarpeta: ' + path.dirname(characterDir(serie, sheets[0].key)));
      return;
    }
    case 'nuevo': {
      const key = assertKey(who ?? '', 'personaje');
      if (await readSheet(serie, key)) throw new Error('Ya existe. Edita su ficha.json o usa otro nombre.');
      await writeSheet(serie, newSheet(key, option('--nombre') ?? key, option('--descripcion') ?? ''));
      console.log('Ficha creada. Sube sus fotos en: ' + photosDir(serie, key));
      return;
    }
    case 'carpeta': {
      const s = await mustSheet(serie, who);
      const dir = photosDir(serie, s.key);
      console.log(dir);
      if (process.platform === 'win32') spawn('explorer', [dir], { detached: true, stdio: 'ignore' }).unref();
      return;
    }
    case 'maestro': {
      const s = await mustSheet(serie, who);
      const photos = (await listPhotos(serie, s.key)).slice(0, 3);
      if (!photos.length && !s.descripcion) throw new Error('Sube al menos una foto en ' + photosDir(serie, s.key) + ' o escribe una descripción en ficha.json.');
      console.log(`Retrato oficial de ${s.nombre}: ${photos.length ? photos.length + ' foto(s) de referencia' : 'solo descripción (sin fotos)'} · costo ~US$${IMAGE_USD.toFixed(2)}`);
      if (!flag('--generar')) { console.log(`No se generó nada. Para crearlo: npm run personaje -- maestro ${target} ${s.key} --generar`); return; }
      const maker = new GeminiImageMaker();
      const model = await maker.make(await Promise.all(photos.map(imageRef)), masterFromPhotosPrompt(s, photos.length), masterPath(serie, s.key));
      console.log(`LISTO (${model}): ${masterPath(serie, s.key)}`);
      console.log(`Míralo. Si te gusta: npm run personaje -- aprobar ${target} ${s.key}`);
      console.log('Si no, cambia fotos o descripción y repite (el anterior queda en «archivo»).');
      return;
    }
    case 'aprobar': {
      const s = await mustSheet(serie, who);
      if (!(await hasMaster(serie, s.key))) throw new Error('Aún no hay retrato. Primero: maestro … --generar');
      const next: CharacterSheet = { ...s, aprobado: { maestroSha256: sha(await readFile(masterPath(serie, s.key))), fecha: new Date().toISOString() } };
      await writeSheet(serie, next);
      console.log(`${s.nombre}: retrato APROBADO. Todas las tomas de la serie lo usarán.`);
      return;
    }
    default: console.log(USAGE);
  }
}

try { await main(); } catch (e) { console.error('\nERROR: ' + (e instanceof Error ? e.message : String(e))); process.exit(1); }
