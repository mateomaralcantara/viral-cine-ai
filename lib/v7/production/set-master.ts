/**
 * DECORADOS MAESTROS: igual que el retrato oficial de un personaje, pero de un lugar.
 * Un plano maestro aprobado del decorado (p. ej. el salón del Ágape) acompaña a cada foto
 * de continuidad: la mesa, las columnas y la luz son siempre las mismas en todas las tomas.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { v7DataRoot } from '@/lib/v7/storage/film-store';

export type SetSheet = { key: string; nombre: string; descripcion: string; aprobado: { maestroSha256: string; fecha: string } | null };

const safe = (s: string) => { if (!/^[a-z0-9-]{2,60}$/.test(s)) throw new Error('Nombre de decorado inválido: ' + s); return s; };
export const setDir = (serie: string, key: string) => path.join(v7DataRoot(), 'decorados', safe(serie), safe(key));
export const setMasterPath = (serie: string, key: string) => path.join(setDir(serie, key), 'maestro.jpg');
const setSheetPath = (serie: string, key: string) => path.join(setDir(serie, key), 'ficha.json');

export async function readSetSheet(serie: string, key: string): Promise<SetSheet | null> {
  try { return JSON.parse(await readFile(setSheetPath(serie, key), 'utf8')) as SetSheet; } catch { return null; }
}
export async function writeSetSheet(serie: string, sheet: SetSheet) {
  await mkdir(setDir(serie, sheet.key), { recursive: true });
  await writeFile(setSheetPath(serie, sheet.key), JSON.stringify(sheet, null, 2) + '\n');
}

/** Decorado de la película (metadata.decorado) con su plano maestro aprobado, o null. */
export async function approvedSet(film: { metadata?: Record<string, unknown> }, serie: string) {
  const key = typeof film.metadata?.decorado === 'string' ? film.metadata.decorado : '';
  if (!key) return null;
  const sheet = await readSetSheet(serie, key);
  if (!sheet?.aprobado) return null;
  try {
    const sha = createHash('sha256').update(await readFile(setMasterPath(serie, key))).digest('hex');
    return sha === sheet.aprobado.maestroSha256 ? { ...sheet, file: setMasterPath(serie, key) } : null;
  } catch { return null; }
}

/** Instrucción para crear el plano maestro del decorado (sin personas). */
export function setMasterPrompt(nombre: string, descripcion: string) {
  return [
    'Crea el PLANO MAESTRO de un decorado de cine (16:9, fotografía hiperrealista, plano general amplio y simétrico).',
    `DECORADO: ${nombre}. ${descripcion}`,
    'Sin personas. Que se vea con claridad la forma completa de la mesa, la distribución de las sillas, las columnas y la luz.',
    'Sin texto, letras, inscripciones, logotipos ni marcas de agua.'
  ].join('\n');
}
