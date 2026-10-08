import { listProjects } from '@/lib/storage/project-store';
import { adaptLegacyProjectToV7 } from '@/lib/v7/compat/legacy-project-adapter';
import {
  readV7FilmBundle,
  saveV7FilmBundle
} from '@/lib/v7/storage/film-store';

export type V6CatalogMigrationResult = {
  migrated: Array<{ projectId: string; filmId: string; title: string }>;
  skipped: Array<{ projectId: string; filmId: string; title: string; reason: string }>;
  failed: Array<{ projectId: string; title: string; error: string }>;
};

export async function migrateV6CatalogToV7(): Promise<V6CatalogMigrationResult> {
  const projects = await listProjects();
  const result: V6CatalogMigrationResult = { migrated: [], skipped: [], failed: [] };

  for (const project of projects) {
    try {
      if (!project.plan) {
        result.skipped.push({
          projectId: project.id,
          filmId: '',
          title: project.input.title,
          reason: 'Proyecto V6 sin plan; queda disponible como legacy hasta que tenga plan.'
        });
        continue;
      }

      const bundle = adaptLegacyProjectToV7(project);
      try {
        await readV7FilmBundle(bundle.film.id);
        result.skipped.push({
          projectId: project.id,
          filmId: bundle.film.id,
          title: bundle.film.title,
          reason: 'Ya existe en V7; no se sobrescribe.'
        });
        continue;
      } catch {
        // No existe todavía: se materializa abajo.
      }

      await saveV7FilmBundle(bundle);
      result.migrated.push({
        projectId: project.id,
        filmId: bundle.film.id,
        title: bundle.film.title
      });
    } catch (error) {
      result.failed.push({
        projectId: project.id,
        title: project.input.title,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return result;
}
