import { randomUUID } from 'node:crypto';
import { FilmVersionSchema, type FilmVersion } from '@/lib/v7/domain/version';

export function createNextFilmVersion(
  versions: readonly FilmVersion[],
  input: {
    filmId: string;
    label: string;
    createdBy: string;
    changeSummary?: string;
    status?: FilmVersion['status'];
    timelineVersionId?: string;
    createdAt?: string;
  }
) {
  const previous = [...versions]
    .filter((version) => version.filmId === input.filmId)
    .sort((a, b) => b.versionNumber - a.versionNumber)[0];
  return FilmVersionSchema.parse({
    id: randomUUID(),
    filmId: input.filmId,
    label: input.label,
    versionNumber: (previous?.versionNumber || 0) + 1,
    parentVersionId: previous?.id,
    status: input.status || 'draft',
    timelineVersionId: input.timelineVersionId,
    changeSummary: input.changeSummary || '',
    createdBy: input.createdBy,
    createdAt: input.createdAt || new Date().toISOString()
  });
}

export function assertNoVersionOverwrite(
  existing: readonly FilmVersion[],
  candidate: FilmVersion
) {
  if (existing.some((version) =>
    version.id === candidate.id ||
    (version.filmId === candidate.filmId && version.versionNumber === candidate.versionNumber)
  )) {
    throw new Error('Versionado V7 es append-only: versión existente.');
  }
}
