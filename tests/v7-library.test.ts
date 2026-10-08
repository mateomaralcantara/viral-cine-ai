import test from 'node:test';
import assert from 'node:assert/strict';
import { FilmV7Schema } from '../lib/v7/domain/film';
import { AssetSchema } from '../lib/v7/domain/asset';
import {
  classifyLibraryStatus,
  getMasterAsset,
  summarizeV7FilmLibraryItem
} from '../lib/v7/library/library-view';
import { createInitialV7Workflow } from '../lib/v7/domain/workflow';
import type { StoredFilmBundle } from '../lib/v7/storage/film-store';

function bundle(overrides: Partial<StoredFilmBundle> = {}): StoredFilmBundle {
  const film = FilmV7Schema.parse({
    id: 'film-library',
    title: 'Película Library',
    premise: 'Historia válida para probar la biblioteca audiovisual de ViralCine 7.',
    durationMinutes: 5,
    genre: 'Drama',
    audience: '',
    visualStyle: '',
    language: 'es',
    aspectRatio: '16:9',
    budgetUsd: 0,
    acts: [{
      id: 'act-1',
      filmId: 'film-library',
      order: 1,
      title: 'Acto 1',
      dramaticObjective: '',
      sequences: []
    }],
    characters: [],
    createdAt: '2026-10-08T00:00:00.000Z',
    updatedAt: '2026-10-08T00:00:00.000Z',
    metadata: {}
  });
  return {
    film,
    assets: [],
    voiceProfiles: [],
    workflow: createInitialV7Workflow('2026-10-08T00:00:00.000Z'),
    savedAt: '2026-10-08T00:00:00.000Z',
    ...overrides
  };
}

test('biblioteca clasifica un proyecto nuevo como desarrollo', () => {
  assert.equal(classifyLibraryStatus(bundle()), 'development');
});

test('biblioteca clasifica producción cuando el stage production está ready', () => {
  const value = bundle();
  value.workflow = {
    stages: value.workflow!.stages.map((stage) =>
      stage.id === 'production' ? { ...stage, status: 'ready' as const } : stage
    )
  };
  assert.equal(classifyLibraryStatus(value), 'production');
});

test('biblioteca detecta master V7 aprobado y clasifica como terminada', () => {
  const value = bundle({
    assets: [AssetSchema.parse({
      id: 'master-1',
      filmId: 'film-library',
      type: 'master',
      storagePath: 'exports/pelicula-final.mp4',
      source: 'local',
      version: 1,
      approved: true,
      createdAt: '2026-10-08T00:00:00.000Z'
    })]
  });
  assert.equal(getMasterAsset(value)?.id, 'master-1');
  assert.equal(classifyLibraryStatus(value), 'finished');
});

test('biblioteca detecta master V6 migrado sin copiar el video', () => {
  const value = bundle({
    film: FilmV7Schema.parse({
      ...bundle().film,
      legacyProjectId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      metadata: { originalFinalVideoAsset: 'exports/pelicula-final.mp4' }
    })
  });
  const master = getMasterAsset(value);
  assert.equal(master?.source, 'legacy-v6');
  assert.equal(master?.storagePath, 'exports/pelicula-final.mp4');
  const summary = summarizeV7FilmLibraryItem(value);
  assert.equal(summary.hasMaster, true);
  assert.equal(summary.isMigrated, true);
  assert.equal(summary.libraryStatus, 'finished');
  assert.equal(summary.masterMediaId, 'master');
});
