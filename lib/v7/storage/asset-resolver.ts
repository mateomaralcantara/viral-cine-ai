import path from 'node:path';
import { assetAbsolutePath } from '@/lib/storage/project-store';
import type { Asset } from '@/lib/v7/domain/asset';
import type { FilmV7 } from '@/lib/v7/domain/film';
import { v7FilmRoot } from './film-store';

/**
 * V7 data and migrated V6 assets may live in different worktrees.
 * Explicitly configure VIRALCINE_V6_DATA_DIR to the original V6 .data folder
 * rather than copying assets into V7 or changing the V7 data root.
 * Resolution only; this function never writes to the original V6 files.
 */
export function resolveLegacyV6AssetAbsolutePath(
  projectId: string,
  assetPath: string,
  v6DataDirectory = process.env.VIRALCINE_V6_DATA_DIR
) {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
    throw new Error('Identificador de proyecto V6 inválido.');
  }

  if (!v6DataDirectory) {
    return assetAbsolutePath(projectId, assetPath);
  }

  const root = path.join(path.resolve(v6DataDirectory), 'projects', projectId);
  const resolved = path.resolve(root, assetPath);
  const relative = path.relative(root, resolved);

  if (
    !relative ||
    relative === '..' ||
    relative.startsWith('..' + path.sep) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('Ruta de recurso V6 inválida.');
  }

  return resolved;
}

export function resolveV7AssetAbsolutePath(film: FilmV7, asset: Asset) {
  if (asset.filmId !== film.id) {
    throw new Error('Asset no pertenece a la película V7 solicitada.');
  }

  if (asset.source === 'legacy-v6') {
    if (!film.legacyProjectId) {
      throw new Error('Asset legacy sin legacyProjectId.');
    }
    return resolveLegacyV6AssetAbsolutePath(film.legacyProjectId, asset.storagePath);
  }

  const root = v7FilmRoot(film.id);
  const resolved = path.resolve(root, asset.storagePath);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error('Ruta de asset V7 inválida.');
  }
  return resolved;
}
