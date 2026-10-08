import path from 'node:path';
import { assetAbsolutePath } from '@/lib/storage/project-store';
import type { Asset } from '@/lib/v7/domain/asset';
import type { FilmV7 } from '@/lib/v7/domain/film';
import { v7FilmRoot } from './film-store';

export function resolveV7AssetAbsolutePath(film: FilmV7, asset: Asset) {
  if (asset.filmId !== film.id) {
    throw new Error('Asset no pertenece a la película V7 solicitada.');
  }

  if (asset.source === 'legacy-v6') {
    if (!film.legacyProjectId) {
      throw new Error('Asset legacy sin legacyProjectId.');
    }
    return assetAbsolutePath(film.legacyProjectId, asset.storagePath);
  }

  const root = v7FilmRoot(film.id);
  const resolved = path.resolve(root, asset.storagePath);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error('Ruta de asset V7 inválida.');
  }
  return resolved;
}
