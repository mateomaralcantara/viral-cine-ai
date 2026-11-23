/**
 * Servicio de la sección «Personajes» del estudio (lo usan la web y los scripts).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readV7FilmBundle, v7FilmRoot } from '@/lib/v7/storage/film-store';
import {
  assertKey, characterKeyFromId, listPhotos, listSheets, masterApproved, masterFromPhotosPrompt, masterPath, newSheet,
  nextOrder, readSheet, serieOf, uniqueKey, writeSheet, type CharacterSheet
} from '@/lib/v7/production/character-identity';
import { GeminiImageMaker, IMAGE_USD, imageRef } from '@/lib/v7/production/gemini-image';

export const MASTER_CONFIRMATION = 'GENERAR';

async function maybe(file: string) { try { return await readFile(file); } catch { return null; } }

export async function filmSerie(filmId: string) {
  const { film } = await readV7FilmBundle(filmId);
  return { film, serie: serieOf(film) };
}

export type CharacterCard = CharacterSheet & {
  numero: number; photos: string[]; hasMaster: boolean; approved: boolean; masterVersion: string | null;
};

export async function charactersBoard(filmId: string) {
  const { film, serie } = await filmSerie(filmId);
  let sheets = await listSheets(serie);
  // Fichas antiguas sin número: se numeran en el orden del guion, una sola vez.
  if (sheets.some((x) => x.orden == null)) {
    const order = film.characters.map((c) => characterKeyFromId(c.id));
    let next = sheets.reduce((n, x) => Math.max(n, x.orden ?? 0), 0) + 1;
    const pending = sheets.filter((x) => x.orden == null)
      .sort((a, b) => ((order.indexOf(a.key) + 1) || 999) - ((order.indexOf(b.key) + 1) || 999));
    for (const x of pending) await writeSheet(serie, { ...x, orden: next++ });
    sheets = await listSheets(serie);
  }
  const cards: CharacterCard[] = [];
  for (const [i, s] of sheets.entries()) {
    const master = await maybe(masterPath(serie, s.key));
    cards.push({ ...s, numero: i + 1, photos: (await listPhotos(serie, s.key)).map((f) => path.basename(f)), hasMaster: !!master,
      approved: masterApproved(s, master), masterVersion: master ? createHash('sha256').update(master).digest('hex').slice(0, 10) : null });
  }
  const inScript = film.characters.map((c) => characterKeyFromId(c.id)).filter((k) => !sheets.some((s) => s.key === k));
  return { serie, filmTitle: film.title, characters: cards, notImported: inScript, masterUsd: IMAGE_USD, masterConfirmation: MASTER_CONFIRMATION };
}

export async function createCharacter(filmId: string, nombre: string, descripcion: string) {
  const { serie } = await filmSerie(filmId);
  const name = nombre.trim();
  if (name.length < 1 || name.length > 80) throw new Error('El nombre debe tener entre 1 y 80 caracteres.');
  if (descripcion.length > 3000) throw new Error('Descripción demasiado larga (máx. 3000).');
  const key = await uniqueKey(serie, name);
  await writeSheet(serie, { ...newSheet(key, name, descripcion.trim()), orden: await nextOrder(serie) });
  return key;
}

export async function updateCharacter(filmId: string, key: string, patch: Partial<Pick<CharacterSheet, 'nombre' | 'descripcion' | 'notas' | 'voz' | 'vestuarios'>>) {
  const { serie } = await filmSerie(filmId);
  const s = await readSheet(serie, assertKey(key, 'personaje'));
  if (!s) throw new Error('No existe ese personaje.');
  const next: CharacterSheet = { ...s };
  if (typeof patch.nombre === 'string') { if (!patch.nombre.trim() || patch.nombre.length > 80) throw new Error('Nombre inválido.'); next.nombre = patch.nombre.trim(); }
  if (typeof patch.descripcion === 'string') { if (patch.descripcion.length > 3000) throw new Error('Descripción demasiado larga.'); next.descripcion = patch.descripcion.trim(); }
  if (typeof patch.notas === 'string') next.notas = patch.notas.slice(0, 3000);
  if (patch.voz === null) next.voz = null;
  else if (patch.voz && typeof patch.voz.voiceId === 'string' && /^[A-Za-z0-9]{8,40}$/.test(patch.voz.voiceId)) next.voz = { voiceId: patch.voz.voiceId, nombre: String(patch.voz.nombre ?? '').slice(0, 80) };
  if (patch.vestuarios && typeof patch.vestuarios === 'object') {
    next.vestuarios = Object.fromEntries(Object.entries(patch.vestuarios).slice(0, 20).map(([k, v]) => [String(k).slice(0, 40), String(v).slice(0, 600)]));
  }
  await writeSheet(serie, next);
}

/** Crea fichas para los personajes del guion que aún no la tienen (con su voz si ya hay casting). */
export async function importFromScript(filmId: string) {
  const { film, serie } = await filmSerie(filmId);
  let casting: Record<string, { voiceId: string; name: string }> = {};
  try { casting = JSON.parse(await readFile(path.join(v7FilmRoot(filmId), 'voces', 'casting.json'), 'utf8')); } catch { /* sin voces */ }
  const created: string[] = [];
  let order = await nextOrder(serie);
  for (const c of film.characters) {
    const key = characterKeyFromId(c.id);
    const old = await readSheet(serie, key);
    const voice = casting[key] ? { voiceId: casting[key].voiceId, nombre: casting[key].name } : null;
    if (old) { if (!old.voz && voice) await writeSheet(serie, { ...old, voz: voice }); continue; }
    await writeSheet(serie, { ...newSheet(key, c.name, /sin imagen/i.test(c.appearance) ? '' : c.appearance, voice), orden: order++ });
    created.push(key);
  }
  return created;
}

export async function generateMaster(filmId: string, key: string, confirmation: string) {
  if (confirmation.trim().toUpperCase() !== MASTER_CONFIRMATION) throw new Error(`Para gastar ~US$${IMAGE_USD.toFixed(2)} escribe ${MASTER_CONFIRMATION}.`);
  const { serie } = await filmSerie(filmId);
  const s = await readSheet(serie, assertKey(key, 'personaje'));
  if (!s) throw new Error('No existe ese personaje.');
  const photos = (await listPhotos(serie, s.key)).slice(0, 3);
  if (!photos.length && !s.descripcion) throw new Error('Sube al menos una foto o escribe una descripción.');
  const model = await new GeminiImageMaker().make(await Promise.all(photos.map(imageRef)), masterFromPhotosPrompt(s, photos.length), masterPath(serie, s.key));
  return { model, costUsd: IMAGE_USD };
}

export async function approveMaster(filmId: string, key: string) {
  const { serie } = await filmSerie(filmId);
  const s = await readSheet(serie, assertKey(key, 'personaje'));
  if (!s) throw new Error('No existe ese personaje.');
  const master = await maybe(masterPath(serie, s.key));
  if (!master) throw new Error('Aún no hay retrato oficial.');
  await writeSheet(serie, { ...s, aprobado: { maestroSha256: createHash('sha256').update(master).digest('hex'), fecha: new Date().toISOString() } });
}

/** Voces disponibles en ElevenLabs (listar es gratis). */
export async function elevenVoices() {
  const k = process.env.ELEVENLABS_API_KEY?.trim();
  if (!k) return [];
  const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': k }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('ElevenLabs no devolvió las voces (' + res.status + ').');
  const body = await res.json() as { voices?: Array<{ voice_id: string; name: string; labels?: Record<string, string>; preview_url?: string }> };
  return (body.voices ?? []).map((v) => ({ voiceId: v.voice_id, name: v.name, gender: v.labels?.gender ?? '', preview: v.preview_url ?? '' }));
}
