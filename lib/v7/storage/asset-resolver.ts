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
    const legacyRoot = process.env.V7_LEGACY_PROJECTS_ROOT;

    if (legacyRoot) {
      const allowedPilotIds = new Set([
        '65c11676-a345-49cf-8bf6-e7ecca008f18',
        '3d6bb950-7472-4d0d-b489-186d55684704'
      ]);

      if (!allowedPilotIds.has(film.legacyProjectId)) {
        throw new Error('Proyecto legacy no autorizado para lectura externa.');
      }

      if (!path.isAbsolute(legacyRoot)) {
        throw new Error('La ruta legacy debe ser absoluta.');
      }

      if (
        path.isAbsolute(asset.storagePath) ||
        asset.storagePath.includes('\\') ||
        asset.storagePath.includes('\0')
      ) {
        throw new Error('Ruta legacy invalida.');
      }

      const projectRoot = path.resolve(legacyRoot, film.legacyProjectId);
      const resolved = path.resolve(projectRoot, asset.storagePath);

      if (
        !resolved.startsWith(
          projectRoot + path.sep
        )
      ) {
        throw new Error('Asset fuera del proyecto original.');
      }

      return resolved;
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
