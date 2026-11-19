/**
 * Identidad de personajes para toda una SERIE (varias películas/capítulos).
 *
 *   .data/v7/personajes/<serie>/<personaje>/
 *       ficha.json     nombre, descripción fija, vestuarios, voz (ElevenLabs)
 *       fotos/         fotos que subes tú (actor, dibujo, portada…): jpg/png/webp
 *       maestro.jpg    retrato oficial creado desde las fotos (lo apruebas tú)
 *       archivo/       versiones anteriores del retrato (nunca se borran)
 *
 * Todas las películas de la serie usan la misma ficha: misma cara y misma voz.
 */
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FilmV7 } from '@/lib/v7/domain/film';
import { v7DataRoot } from '@/lib/v7/storage/film-store';

export type CharacterSheet = {
  key: string;
  nombre: string;
  descripcion: string;
  vestuarios: Record<string, string>;
  voz: { voiceId: string; nombre: string } | null;
  notas: string;
  aprobado: { maestroSha256: string; fecha: string } | null;
};

const SAFE = /^[a-z0-9][a-z0-9-]{0,60}$/;
const exists = (f: string) => access(f).then(() => true, () => false);

export function assertKey(value: string, what = 'nombre') {
  if (!SAFE.test(value)) throw new Error(`${what} inválido: «${value}» (usa minúsculas, números y guiones).`);
  return value;
}
/** Convierte «El Fiscal» -> «fiscal», «Martin» -> «martin». */
export function slug(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/^(el|la|los|las)\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/** Serie de una película: metadata.serie, o el id sin prefijo/sufijo. */
export function serieOf(film: Pick<FilmV7, 'id' | 'metadata'>) {
  const declared = typeof film.metadata?.serie === 'string' ? film.metadata.serie : '';
  return assertKey(declared || film.id.replace(/^film-/, '').replace(/-v\d+$/, ''), 'serie');
}

export const seriesRoot = (serie: string) => path.join(v7DataRoot(), 'personajes', assertKey(serie, 'serie'));
export const characterDir = (serie: string, key: string) => path.join(seriesRoot(serie), assertKey(key, 'personaje'));
export const sheetPath = (serie: string, key: string) => path.join(characterDir(serie, key), 'ficha.json');
export const masterPath = (serie: string, key: string) => path.join(characterDir(serie, key), 'maestro.jpg');
export const photosDir = (serie: string, key: string) => path.join(characterDir(serie, key), 'fotos');

/** Clave del personaje a partir del id de la película: film-x-character-martin -> martin. */
export function characterKeyFromId(characterId: string) {
  const m = /-character-([a-z0-9-]+)$/.exec(characterId);
  return m ? m[1] : slug(characterId);
}

export async function readSheet(serie: string, key: string): Promise<CharacterSheet | null> {
  try { return JSON.parse(await readFile(sheetPath(serie, key), 'utf8')) as CharacterSheet; } catch { return null; }
}
export async function writeSheet(serie: string, sheet: CharacterSheet) {
  await mkdir(photosDir(serie, sheet.key), { recursive: true });
  await writeFile(sheetPath(serie, sheet.key), JSON.stringify(sheet, null, 2) + '\n', 'utf8');
}
export async function listSheets(serie: string): Promise<CharacterSheet[]> {
  let names: string[] = [];
  try { names = (await readdir(seriesRoot(serie), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; }
  const out: CharacterSheet[] = [];
  for (const n of names.sort()) { const s = await readSheet(serie, n); if (s) out.push(s); }
  return out;
}
export async function listPhotos(serie: string, key: string) {
  try {
    return (await readdir(photosDir(serie, key))).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort().map((f) => path.join(photosDir(serie, key), f));
  } catch { return []; }
}
export async function hasMaster(serie: string, key: string) { return exists(masterPath(serie, key)); }

export function newSheet(key: string, nombre: string, descripcion = '', voz: CharacterSheet['voz'] = null): CharacterSheet {
  return { key: assertKey(key, 'personaje'), nombre, descripcion, vestuarios: {}, voz, notas: '', aprobado: null };
}

/** Prompt del retrato oficial a partir de las fotos subidas. */
export function masterFromPhotosPrompt(sheet: CharacterSheet, photoCount: number) {
  return [
    `Retrato fotográfico cinematográfico hiperrealista de ${sheet.nombre}.`,
    photoCount ? `Las ${photoCount} imágenes adjuntas son la referencia: debe ser exactamente esa misma persona o entidad (misma cara, rasgos, pelo, tono de piel, proporciones).` : '',
    sheet.descripcion ? `Descripción fija: ${sheet.descripcion}.` : '',
    'Plano medio, de frente, expresión serena, boca cerrada. Luz cinematográfica, fondo neutro oscuro desenfocado, formato 16:9.',
    'Sin texto, letras, logotipos ni marcas de agua.'
  ].filter(Boolean).join(' ');
}

/** Prompt del primer fotograma de una toma con varios personajes de referencia. */
export function multiKeyframePrompt(cast: Array<{ nombre: string; descripcion: string }>, shotPrompt: string) {
  const who = cast.map((c, i) => `Imagen ${i + 1}: ${c.nombre}${c.descripcion ? ` (${c.descripcion})` : ''}.`).join('\n');
  return [
    'Crea el PRIMER FOTOGRAMA de una toma de cine (16:9, fotografía hiperrealista, iluminación cinematográfica).',
    'Las imágenes adjuntas son los personajes oficiales: en la escena deben ser exactamente esas mismas personas o entidades (mismas caras, rasgos y proporciones).',
    who,
    'Respeta el vestuario, el lugar y la luz que pide la toma.',
    `TOMA: ${shotPrompt.replace(/\s+/g, ' ').trim()}`,
    'Bocas cerradas. Manos naturales. Sin texto, letras, subtítulos, logotipos ni marcas de agua.'
  ].join('\n');
}
