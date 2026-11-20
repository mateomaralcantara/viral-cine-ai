/**
 * Primer fotograma de cada toma con los personajes OFICIALES de la serie
 * (retratos aprobados con «npm run personaje»). Veo parte de esa imagen
 * (image-to-video), así cada personaje tiene la misma cara en todas las tomas.
 *
 *   npm run referencia -- convidados                 tomas a preparar (las que el revisor marcó por la cara)
 *   npm run referencia -- convidados --generar       crear los fotogramas (~US$0.04 cada uno)
 *       --tomas E01-P01,E04-P03     elegir tomas a mano
 *       --todas                     todas las tomas donde el texto nombra a un personaje aprobado
 *       --escena E01                solo esa escena
 *
 * Deja <toma>\E0X-P0Y-referencia.jpg y guarda una versión nueva del texto (el corregido
 * por el revisor si existe). Luego en el estudio: «Rehacer esta toma».
 * No genera video ni gasta en Veo. Nunca borra: lo reemplazado va a «archivo».
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import nextEnv from '@next/env';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { CONVIDADOS_ID } from '../lib/v7/presets/los-convidados-al-agape';
import { PRIMERA_PAGINA_ID } from '../lib/v7/presets/la-primera-pagina';
import { readV7FilmBundle, v7FilmRoot } from '../lib/v7/storage/film-store';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';
import { latestPromptRevision, savePromptRevision, shotReferencePath } from '../lib/v7/production/scene-veo-engine';
import { fileSha256, originalShotVideo } from '../lib/v7/production/shot-current-video';
import { needsIdentityFix, shotShows, type IdentityReport } from '../lib/v7/production/character-reference';
import { characterKeyFromId, listSheets, masterPath, multiKeyframePrompt, serieOf, type CharacterSheet } from '../lib/v7/production/character-identity';
import { GeminiImageMaker, IMAGE_USD, imageRef } from '../lib/v7/production/gemini-image';

nextEnv.loadEnvConfig(process.cwd());
const FILMS: Record<string, string> = FILM_KEYS;
const args = process.argv.slice(2);
const key = args.find((a) => FILMS[a]) ?? '';
const filmId = FILMS[key];
const flag = (f: string) => args.includes(f);
const option = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
if (!filmId) { console.log('Uso: npm run referencia -- ' + Object.keys(FILMS).join('|') + ' [--generar] [--tomas E01-P01,E04-P03] [--todas]'); process.exit(1); }
const root = v7FilmRoot(filmId);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

async function main() {
  const { film } = await readV7FilmBundle(filmId);
  const serie = serieOf(film);
  const approved: CharacterSheet[] = [];
  for (const s of await listSheets(serie)) {
    try { if (s.aprobado && s.aprobado.maestroSha256 === sha(await readFile(masterPath(serie, s.key)))) approved.push(s); } catch { /* sin retrato */ }
  }
  if (!approved.length) {
    console.log(`La serie «${serie}» no tiene personajes con retrato aprobado.`);
    console.log(`Primero: npm run personaje -- importar ${key}  ->  sube fotos  ->  maestro --generar  ->  aprobar`);
    return;
  }
  console.log(`Personajes oficiales: ${approved.map((s) => s.nombre).join(', ')}`);
  const onlyScene = option('--escena')?.toUpperCase();
  const wanted = option('--tomas')?.toUpperCase().split(',').map((s) => s.trim()).filter(Boolean);
  type Job = { label: string; prompt: string; cast: CharacterSheet[]; why: string };
  const jobs: Job[] = [];
  for (const scene of indexedScenes(film)) for (const { shot, label } of scene.shots) {
    if (wanted && !wanted.includes(label)) continue;
    if (onlyScene && !label.startsWith(onlyScene + '-')) continue;
    const revision = await latestPromptRevision(filmId, label).catch(() => null);
    const current = revision?.promptText ?? shot.visualPrompt;
    const inScene = approved.filter((s) => shot.characterIds.some((id) => characterKeyFromId(id) === s.key));
    const named = inScene.filter((s) => shotShows(s.nombre.replace(/^(el|la)\s+/i, '').split(/\s+/)[0], current));
    // Solo los personajes que el texto de la toma nombra: una toma sin personas (un objeto,
    // un paisaje) nunca recibe una cara. A mano (--tomas) se acepta el reparto de la escena.
    const cast = (named.length ? named : wanted ? inScene : []).slice(0, 3);
    if (!cast.length) continue;
    let report: (IdentityReport & { promptSugerido?: string }) | null = null;
    const dir = path.join(root, label.toLowerCase());
    const video = await originalShotVideo(dir, label);
    if (video) {
      try { report = JSON.parse(await readFile(path.join(dir, 'calidad', `${label}-${(await fileSha256(video)).slice(0, 12)}.json`), 'utf8')); } catch { report = null; }
    }
    const pick = wanted ? true : flag('--todas') || needsIdentityFix(report);
    if (!pick) continue;
    jobs.push({ label, prompt: (report?.promptSugerido?.trim() || current), cast,
      why: wanted ? 'elegida a mano' : flag('--todas') ? 'tiene personajes oficiales' : `el revisor dio cara ${report?.identidad ?? '?'}/10` });
  }
  if (!jobs.length) {
    console.log('No hay tomas que preparar. Usa --tomas E01-P01,E04-P03 o --todas, o revisa antes: npm run calidad -- ' + key + ' --revisar');
    return;
  }
  console.log(`Fotogramas a crear: ${jobs.length} · costo ~US$${(jobs.length * IMAGE_USD).toFixed(2)}`);
  for (const j of jobs) console.log(`  ${j.label}  ${j.cast.map((c) => c.nombre).join(' + ')}  (${j.why})`);
  if (!flag('--generar')) {
    console.log('\nNo se generó nada. Para crearlos: npm run referencia -- ' + key + ' --generar' + (wanted ? ' --tomas ' + wanted.join(',') : flag('--todas') ? ' --todas' : '') + (onlyScene ? ' --escena ' + onlyScene : ''));
    return;
  }
  const maker = new GeminiImageMaker();
  const done: string[] = [];
  for (const j of jobs) {
    process.stdout.write(`  ${j.label}... `);
    try {
      const refs = await Promise.all(j.cast.map((c) => imageRef(masterPath(serie, c.key))));
      await maker.make(refs, multiKeyframePrompt(j.cast.map((c) => ({ nombre: c.nombre, descripcion: c.descripcion })), j.prompt), shotReferencePath(filmId, j.label));
      await savePromptRevision(filmId, j.label, j.prompt);
      done.push(j.label);
      console.log('OK');
    } catch (e) { console.log('ERROR: ' + (e as Error).message); }
  }
  console.log(`\nListas ${done.length} de ${jobs.length}. Revisa cada foto en la carpeta de la toma (E0X-P0Y-referencia.jpg).`);
  console.log('Si una no te gusta, repítela con --tomas ESA-TOMA, o bórrala (sin foto la toma vuelve a ser solo texto).');
  console.log('En el estudio, en cada toma: «Rehacer esta toma» -> escribe la frase -> Generar (~US$1.20 por toma en Veo).');
}

try { await main(); } catch (e) { console.error('\nERROR: ' + (e instanceof Error ? e.message : String(e))); process.exit(1); }
