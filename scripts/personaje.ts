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
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import { promisify } from 'node:util';
import { CONVIDADOS_REPARTO, CONVIDADOS_SERIE } from '../lib/v7/presets/convidados-reparto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import nextEnv from '@next/env';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { CONVIDADOS_ID } from '../lib/v7/presets/los-convidados-al-agape';
import { PRIMERA_PAGINA_ID } from '../lib/v7/presets/la-primera-pagina';
import { readV7FilmBundle, v7FilmRoot } from '../lib/v7/storage/film-store';
import {
  assertKey, characterDir, characterKeyFromId, hasMaster, listPhotos, listSheets, masterFromPhotosPrompt, masterPath,
  newSheet, nextOrder, photosDir, savePhoto, readSheet, serieOf, writeSheet, type CharacterSheet
} from '../lib/v7/production/character-identity';
import { GeminiImageMaker, IMAGE_USD, imageRef } from '../lib/v7/production/gemini-image';
import { importFromScript } from '../lib/v7/production/character-studio';

nextEnv.loadEnvConfig(process.cwd());
const run = promisify(execFile);
const FILMS: Record<string, string> = FILM_KEYS;
const [cmd, target, who] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));
const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const option = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const USAGE = 'Uso: npm run personaje -- importar|reparto|lista|nuevo|carpeta|maestro|aprobar <película o serie> [personaje]';

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
      const created = await importFromScript(filmId);
      console.log(created.length ? '  Fichas creadas: ' + created.join(', ') : '  Todas las fichas ya existían (no se tocan).');
      console.log(`\nSerie «${serie}». Lo más cómodo: en el estudio, pestaña PERSONAJES · IDENTIDAD.`);
      return;
    }
    case 'reparto': {
      // npm run personaje -- reparto convidados "C:\ruta\hoja-de-personajes.png"
      const sheetImage = process.argv.slice(2).filter((a) => !a.startsWith('--'))[2];
      if (!sheetImage) throw new Error('Indica la ruta de la imagen del reparto entre comillas.');
      if (serie !== CONVIDADOS_SERIE) throw new Error('Este reparto es de la serie ' + CONVIDADOS_SERIE + '.');
      const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', sheetImage]);
      const [w, h] = stdout.trim().split(',').map(Number);
      if (!w || !h) throw new Error('No pude leer la imagen: ' + sheetImage);
      const tmp = await mkdtemp(path.join(os.tmpdir(), 'reparto-'));
      try {
        for (const [i, m] of CONVIDADOS_REPARTO.entries()) {
          const [fx, fy, fw, fh] = m.box;
          const out = path.join(tmp, m.key + '.jpg');
          await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', sheetImage, '-vf',
            `crop=${Math.round(fw * w)}:${Math.round(fh * h)}:${Math.round(fx * w)}:${Math.round(fy * h)},scale=-2:720:flags=lanczos`, '-q:v', '2', out]);
          const old = await readSheet(serie, m.key);
          const sheet: CharacterSheet = old
            ? { ...old, nombre: m.nombre, descripcion: old.descripcion || m.descripcion, notas: old.notas || m.rol, orden: i + 1 }
            : { ...newSheet(m.key, m.nombre, m.descripcion), notas: m.rol, orden: i + 1 };
          await writeSheet(serie, sheet);
          const bytes = await readFile(out);
          const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
          const already = (await listPhotos(serie, m.key)).some((f) => f.includes(hash));
          if (!already) await savePhoto(serie, m.key, bytes);
          console.log(`  ${String(i + 1).padStart(2)}. ${m.nombre.padEnd(20)} ${old ? 'ficha actualizada' : 'ficha creada'}${already ? '' : ' + foto'}`);
        }
      } finally { await rm(tmp, { recursive: true, force: true }); }
      console.log(`\n${CONVIDADOS_REPARTO.length} personajes listos. Ábrelos en el estudio, pestaña PERSONAJES · IDENTIDAD.`);
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
      await writeSheet(serie, { ...newSheet(key, option('--nombre') ?? key, option('--descripcion') ?? ''), orden: await nextOrder(serie) });
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
