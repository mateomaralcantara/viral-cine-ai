import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createV7FilmDraft,
  preflightV7FilmCreation,
  V7FilmCreationInputSchema
} from '../lib/v7/creation/film-creation';
import { V6_MIGRATION_POLICY } from '../lib/v7/legacy/runtime-bridge';

test('V7 crea un corto de 5 minutos sin llamadas externas', () => {
  const input = V7FilmCreationInputSchema.parse({
    title: 'Corto V7',
    story: 'Una historia breve con conflicto, desarrollo y resolución cinematográfica.',
    durationMinutes: 5,
    genre: 'Drama',
    aspectRatio: '16:9',
    language: 'es',
    budgetUsd: 25,
    quality: 'cine'
  });
  const preflight = preflightV7FilmCreation(input);
  assert.equal(preflight.passed, true);
  assert.equal(preflight.externalApisRequired, false);
  assert.equal(preflight.estimatedApiCostUsd, 0);

  const draft = createV7FilmDraft(input, '2026-10-08T00:00:00.000Z', 'film-short');
  assert.equal(draft.film.durationMinutes, 5);
  assert.equal(draft.workflow.stages.length, 10);
  assert.equal(draft.workflow.stages[0].status, 'approved');
  assert.equal(draft.workflow.stages[1].status, 'ready');
  assert.equal(draft.film.metadata.productionLockedUntilPreflight, true);
});

test('V7 crea un largometraje de 90 minutos con calidad máxima', () => {
  const input = V7FilmCreationInputSchema.parse({
    title: 'Largometraje V7',
    story: 'Una historia de noventa minutos con personajes persistentes, conflictos y un arco completo.',
    durationMinutes: 90,
    genre: 'Suspenso',
    aspectRatio: '2.39:1',
    language: 'es',
    budgetUsd: 500,
    quality: 'maxima'
  });
  const preflight = preflightV7FilmCreation(input);
  assert.equal(preflight.passed, true);
  assert.ok(preflight.warnings.some((warning) => warning.includes('Largometraje')));

  const draft = createV7FilmDraft(input, '2026-10-08T00:00:00.000Z', 'film-feature');
  assert.equal(draft.film.durationMinutes, 90);
  assert.equal(draft.film.aspectRatio, '2.39:1');
  assert.equal(draft.film.metadata.qualityPreset, 'maxima');
});

test('V7 rechaza un formulario incompleto antes de crear o gastar', () => {
  const preflight = preflightV7FilmCreation({
    title: 'X',
    story: 'corta',
    durationMinutes: 0,
    genre: '',
    aspectRatio: '16:9',
    language: 'es',
    budgetUsd: -1,
    quality: 'cine'
  });
  assert.equal(preflight.passed, false);
  assert.equal(preflight.externalApisRequired, false);
  assert.equal(preflight.estimatedApiCostUsd, 0);
  assert.ok(preflight.errors.length >= 4);
});

test('política de migración declara V7 como único producto activo', () => {
  assert.equal(V6_MIGRATION_POLICY.userFacingProduct, 'v7');
  assert.equal(V6_MIGRATION_POLICY.v6NewFeatureDevelopment, false);
  assert.equal(V6_MIGRATION_POLICY.reuseV6SpecificSceneProducers, false);
  assert.equal(V6_MIGRATION_POLICY.strategy, 'replace-module-by-module-in-v7');
});


test('migración incluye proyectos V6 draft sin plan', async () => {
  const { FilmProjectSchema } = await import('../lib/domain/schemas');
  const { buildV7MigrationBundle } = await import('../lib/v7/migration/migrate-v6-catalog');

  const legacy = FilmProjectSchema.parse({
    id: '11111111-2222-4333-8444-555555555555',
    createdAt: '2026-10-08T00:00:00.000Z',
    updatedAt: '2026-10-08T00:00:00.000Z',
    status: 'draft',
    input: {
      title: 'Proyecto V6 sin plan',
      premise: 'Historia suficientemente extensa para migrar un borrador V6 a un proyecto V7.',
      durationMinutes: 5,
      genre: 'Drama',
      audience: 'General',
      visualStyle: 'Cinematográfico',
      language: 'es',
      aspectRatio: '16:9',
      budgetUsd: 25,
      burnSubtitles: false,
      generateMusic: true
    },
    supportVoices: [],
    progress: {
      phase: 'draft',
      percent: 0,
      message: 'Proyecto creado',
      updatedAt: '2026-10-08T00:00:00.000Z'
    },
    productionLog: []
  });

  const migrated = buildV7MigrationBundle(legacy);
  assert.equal(migrated.film.legacyProjectId, legacy.id);
  assert.equal(migrated.film.durationMinutes, 5);
  assert.equal(migrated.creationInput?.quality, 'cine');
  assert.equal(migrated.workflow?.stages[0].status, 'approved');
  assert.equal(migrated.workflow?.stages[1].status, 'ready');
});

test('asset legacy V6 se resuelve zero-copy desde el proyecto original', async () => {
  const { AssetSchema } = await import('../lib/v7/domain/asset');
  const { FilmV7Schema } = await import('../lib/v7/domain/film');
  const { resolveV7AssetAbsolutePath } = await import('../lib/v7/storage/asset-resolver');

  const film = FilmV7Schema.parse({
    id: 'film-zero-copy',
    title: 'Zero Copy',
    premise: 'Prueba de referencia legacy sin duplicar los archivos originales.',
    durationMinutes: 5,
    genre: 'Drama',
    audience: '',
    visualStyle: '',
    language: 'es',
    aspectRatio: '16:9',
    budgetUsd: 0,
    acts: [{
      id: 'act-zero-copy',
      filmId: 'film-zero-copy',
      order: 1,
      title: 'Acto',
      dramaticObjective: '',
      sequences: []
    }],
    characters: [],
    legacyProjectId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    createdAt: '2026-10-08T00:00:00.000Z',
    updatedAt: '2026-10-08T00:00:00.000Z',
    metadata: {}
  });
  const asset = AssetSchema.parse({
    id: 'asset-zero-copy',
    filmId: film.id,
    type: 'video',
    storagePath: 'video/legacy.mp4',
    source: 'legacy-v6',
    version: 1,
    approved: true,
    createdAt: '2026-10-08T00:00:00.000Z'
  });

  const resolved = resolveV7AssetAbsolutePath(film, asset)
    .split(String.fromCharCode(92))
    .join('/');
  const expected = ['/projects', film.legacyProjectId, 'video', 'legacy.mp4'].join('/');
  assert.ok(resolved.includes(expected));
});
