/**
 * HARNESS DE CONTINUIDAD: el personaje es SIEMPRE el mismo.
 * La foto de partida de cada toma (Veo, imagen a video) se crea con:
 *   1. el retrato maestro aprobado de cada personaje (la cara oficial), y
 *   2. un fotograma de la última toma YA APROBADA (fijada) donde sale ese personaje:
 *      misma ropa, mismo pelo y barba, misma luz que lo anterior.
 * Así cada toma nueva hereda lo que ya quedó bien, escena tras escena.
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { shotShows } from './character-reference';
import { characterKeyFromId, listSheets, masterPath, type CharacterSheet } from './character-identity';

const run = promisify(execFile);
const exists = (f: string) => access(f).then(() => true, () => false);

type ShotLike = { label: string; shot: { characterIds: string[]; visualPrompt?: string } };
type SceneLike = { label: string; shots: ShotLike[] };

/** Personajes aprobados que la toma muestra (nombrados en el texto y en el reparto). */
export function castInShot(shot: ShotLike['shot'], prompt: string, approved: CharacterSheet[]) {
  return approved.filter((s) => shot.characterIds.some((id) => characterKeyFromId(id) === s.key)
    && shotShows(s.nombre.replace(/^(el|la)\s+/i, '').split(/\s+/)[0], prompt));
}

/**
 * Tomas anteriores candidatas a «ancla» para `label`, de la más cercana a la más lejana:
 * primero hacia atrás en la misma escena, luego las escenas anteriores (de la última toma a la primera).
 * Solo las que muestran a alguno de los personajes pedidos.
 */
export function anchorCandidates(scenes: SceneLike[], label: string, castKeys: string[], promptOf: (s: ShotLike) => string, approved: CharacterSheet[]) {
  const flat = scenes.flatMap((s) => s.shots);
  const at = flat.findIndex((s) => s.label === label);
  if (at < 0) return [];
  const wanted = approved.filter((a) => castKeys.includes(a.key));
  const out: string[] = [];
  for (let i = at - 1; i >= 0; i--) {
    const c = flat[i];
    if (castInShot(c.shot, promptOf(c), wanted).length) out.push(c.label);
  }
  return out;
}

/** Extrae un fotograma nítido (a 40 % de la duración) de un video aprobado. */
export async function extractAnchorFrame(video: string, out: string) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]);
  const at = Math.max(0, (Number(stdout.trim()) || 4) * 0.4);
  await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', at.toFixed(2), '-i', video, '-frames:v', '1', '-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720', '-q:v', '2', out]);
  if (!(await exists(out))) throw new Error('No se pudo extraer el fotograma de ' + path.basename(video));
  return out;
}

/**
 * Instrucción para la foto de partida. Orden de las imágenes adjuntas:
 * retratos de los personajes (1..n) · plano maestro del decorado (si hay) · fotograma de la toma anterior aprobada (si hay).
 */
export function continuityKeyframePrompt(cast: Array<{ nombre: string; descripcion: string }>, shotPrompt: string,
  opts: { anchorLabel?: string; costume?: string; set?: { nombre: string; descripcion: string } } = {}) {
  let n = 0;
  const who = cast.map((c) => `Imagen ${++n}: retrato oficial de ${c.nombre}${c.descripcion ? ` (${c.descripcion})` : ''}.`).join('\n');
  const setImage = opts.set ? ++n : 0;
  const anchorImage = opts.anchorLabel ? ++n : 0;
  return [
    'Crea el PRIMER FOTOGRAMA de una toma de cine (16:9, fotografía hiperrealista, iluminación cinematográfica).',
    cast.length ? 'CARAS: los retratos oficiales adjuntos. En la escena deben ser EXACTAMENTE esas mismas personas: misma cara, mismos rasgos, misma edad, mismo pelo y misma barba. No las rejuvenezcas ni las cambies.' : '',
    who,
    cast.length ? `CADA PERSONA APARECE UNA SOLA VEZ: ${cast.map((c) => c.nombre).join(', ')}${cast.length === 1 ? ' es la única persona de la imagen' : ' y nadie más'}. Nada de dobles, clones, reflejos con otra postura ni la misma persona repetida.` : '',
    opts.set ? `DECORADO (imagen ${setImage}): es el plano maestro aprobado de «${opts.set.nombre}». Mantén EXACTAMENTE la misma mesa (forma, longitud, material, copas, sillas), las mismas columnas, el mismo suelo y la misma luz. Puedes mostrar solo la parte que pida el encuadre, pero nunca otra mesa ni otra arquitectura.` : '',
    opts.anchorLabel
      ? `CONTINUIDAD (imagen ${anchorImage}): fotograma de la toma anterior ya aprobada (${opts.anchorLabel}). Mantén igual la ropa, el peinado, la barba, el estado (cansancio, frío, heridas) y el tono de luz. NO copies su encuadre: usa el encuadre que pide la toma.`
      : '',
    opts.costume ? `VESTUARIO FIJO DE LA ESCENA: ${opts.costume}.` : '',
    `TOMA: ${shotPrompt.replace(/\s+/g, ' ').trim()}`,
    'Bocas cerradas. Manos naturales. Sin texto, letras, subtítulos, logotipos ni marcas de agua.'
  ].filter(Boolean).join('\n');
}

/** Las tomas con personaje exigen foto de continuidad salvo que la película lo desactive. */
export function continuityRequired(film: { metadata?: Record<string, unknown> }) {
  return film.metadata?.continuidadObligatoria !== false;
}

/** Fichas con retrato maestro aprobado (y sin cambiar desde la aprobación). */
export async function approvedSheets(serie: string) {
  const out: CharacterSheet[] = [];
  for (const s of await listSheets(serie)) {
    try { if (s.aprobado && s.aprobado.maestroSha256 === createHash('sha256').update(await readFile(masterPath(serie, s.key))).digest('hex')) out.push(s); } catch { /* sin retrato */ }
  }
  return out;
}

/** Mensaje de bloqueo si la toma muestra un personaje oficial y no tiene foto de continuidad (null = puede enviarse). */
export async function continuityBlock(input: { film: { metadata?: Record<string, unknown> }; serie: string; shot: ShotLike['shot']; prompt: string; label: string; referenceFile: string }) {
  if (!continuityRequired(input.film)) return null;
  const cast = castInShot(input.shot, input.prompt, await approvedSheets(input.serie));
  if (!cast.length || await exists(input.referenceFile)) return null;
  // Último recurso de Pulir: Google bloquea la foto por «persona famosa»; queda anotado y se permite solo texto.
  if (await exists(path.join(path.dirname(input.referenceFile), 'continuidad-sin-foto.json'))) return null;
  return `${input.label} muestra a ${cast.map((c) => c.nombre).join(' y ')} y no tiene foto de continuidad: sin ella Veo inventa la cara. Créala antes (Harness de Continuidad): npm run continuidad -- <película> --tomas ${input.label} --generar`;
}
