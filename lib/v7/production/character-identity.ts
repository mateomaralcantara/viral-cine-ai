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
import { createHash } from 'node:crypto';
import { access, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
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
  /** Número del personaje en la serie (1, 2, 3…). */
  orden?: number;
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
  return out.sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999) || a.key.localeCompare(b.key));
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

/** Clave única para un nombre nuevo: «El Fiscal» -> fiscal, fiscal-2… */
export async function uniqueKey(serie: string, nombre: string) {
  const base = slug(nombre) || 'personaje';
  let key = base;
  for (let i = 2; await readSheet(serie, key); i++) key = (base.slice(0, 55) + '-' + i);
  return assertKey(key, 'personaje');
}

export async function nextOrder(serie: string) {
  return (await listSheets(serie)).reduce((n, s) => Math.max(n, s.orden ?? 0), 0) + 1;
}

const PHOTO_NAME = /^[a-z0-9][a-z0-9._-]{0,80}\.(jpe?g|png|webp)$/i;
export const MAX_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** Comprueba la cabecera real del archivo (no solo la extensión). */
export function imageKind(bytes: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes.length > 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

export async function savePhoto(serie: string, key: string, bytes: Buffer) {
  if (!(await readSheet(serie, key))) throw new Error('No existe ese personaje.');
  if (bytes.length > MAX_PHOTO_BYTES) throw new Error('La foto pesa más de 8 MB.');
  const kind = imageKind(bytes);
  if (!kind) throw new Error('Solo fotos JPG, PNG o WEBP.');
  if ((await listPhotos(serie, key)).length >= MAX_PHOTOS) throw new Error(`Máximo ${MAX_PHOTOS} fotos por personaje. Quita alguna.`);
  const name = `foto-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}.${kind}`;
  await mkdir(photosDir(serie, key), { recursive: true });
  await writeFile(path.join(photosDir(serie, key), name), bytes, { flag: 'wx' });
  return name;
}

/** «Quitar» una foto la mueve a fotos/archivo (nunca se borra). */
export async function removePhoto(serie: string, key: string, name: string) {
  if (!PHOTO_NAME.test(name)) throw new Error('Nombre de foto inválido.');
  const from = path.join(photosDir(serie, key), name);
  if (!(await exists(from))) throw new Error('No existe esa foto.');
  const dir = path.join(photosDir(serie, key), 'archivo');
  await mkdir(dir, { recursive: true });
  await rename(from, path.join(dir, name));
}

export function photoFilePath(serie: string, key: string, name: string) {
  if (name === 'maestro') return masterPath(serie, key);
  if (!PHOTO_NAME.test(name)) throw new Error('Nombre de foto inválido.');
  return path.join(photosDir(serie, key), name);
}

export function masterApproved(sheet: CharacterSheet, masterBytes: Buffer | null) {
  return !!(masterBytes && sheet.aprobado && sheet.aprobado.maestroSha256 === createHash('sha256').update(masterBytes).digest('hex'));
}
