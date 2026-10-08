import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { dataRoot } from '@/lib/storage/project-store';
import { AssetSchema } from '@/lib/v7/domain/asset';
import { FilmV7Schema } from '@/lib/v7/domain/film';
import { VoiceProfileSchema } from '@/lib/v7/domain/voice-profile';

export const StoredFilmBundleSchema = z.object({
  film: FilmV7Schema,
  assets: z.array(AssetSchema).default([]),
  voiceProfiles: z.array(VoiceProfileSchema).default([]),
  savedAt: z.string()
});

export type StoredFilmBundle = z.infer<typeof StoredFilmBundleSchema>;

export function v7DataRoot() {
  return path.join(dataRoot(), 'v7');
}

export function v7FilmRoot(filmId: string) {
  if (!/^[a-zA-Z0-9._:-]+$/.test(filmId)) throw new Error('filmId V7 inválido.');
  return path.join(v7DataRoot(), 'films', filmId);
}

export async function saveV7FilmBundle(
  bundle: Omit<StoredFilmBundle, 'savedAt'> & { savedAt?: string }
) {
  const parsed = StoredFilmBundleSchema.parse({
    ...bundle,
    savedAt: bundle.savedAt || new Date().toISOString()
  });
  const root = v7FilmRoot(parsed.film.id);
  await mkdir(root, { recursive: true });
  const target = path.join(root, 'bundle.json');
  const temporary = target + '.tmp-' + randomUUID();
  await writeFile(temporary, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
  try {
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return parsed;
}

export async function readV7FilmBundle(filmId: string) {
  const raw = await readFile(path.join(v7FilmRoot(filmId), 'bundle.json'), 'utf8');
  return StoredFilmBundleSchema.parse(JSON.parse(raw));
}

export async function listV7FilmBundles() {
  const root = path.join(v7DataRoot(), 'films');
  await mkdir(root, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true });
  const results: StoredFilmBundle[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      results.push(await readV7FilmBundle(entry.name));
    } catch {
      // Un bundle incompleto nunca bloquea el listado del resto.
    }
  }
  return results.sort((a, b) => b.film.updatedAt.localeCompare(a.film.updatedAt));
}
