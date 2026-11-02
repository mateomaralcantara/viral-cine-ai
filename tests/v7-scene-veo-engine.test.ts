import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDosToquesBundle } from '../lib/v7/presets/dos-toques-de-bocina';
import { saveV7FilmBundle } from '../lib/v7/storage/film-store';
import {
  authorizationPhrase, candidatePath, estimateShotUsd, latestPromptRevision, recordPath,
  savePromptRevision, sceneExposureUsd, scenePlan, sceneStudioBoard, submitSceneShot
} from '../lib/v7/production/scene-veo-engine';
import { resolveV7ShotVideo } from '../lib/v7/production/shot-video-source';

const env = process.env as Record<string, string | undefined>;
const KEYS = ['VIRALCINE_DATA_DIR', 'V7_VEO_SCENES_ENABLED', 'V7_VEO_USD_PER_SECOND', 'V7_SCENE_MAX_USD', 'GEMINI_API_KEY', 'NODE_ENV'] as const;

async function withStudio(fn: (filmId: string, root: string) => Promise<void>) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  const tmp = await mkdtemp(path.join(tmpdir(), 'v7-scene-veo-'));
  process.env.VIRALCINE_DATA_DIR = tmp;
  for (const k of KEYS.slice(1)) delete env[k];
  try {
    const bundle = await saveV7FilmBundle(createDosToquesBundle());
    await fn(bundle.film.id, path.join(tmp, 'v7', 'films', bundle.film.id));
  } finally {
    for (const k of KEYS) { if (saved[k] === undefined) delete env[k]; else env[k] = saved[k]; }
    await rm(tmp, { recursive: true, force: true });
  }
}
const PROMPT = 'Gabriel waits alone in a quiet fictional family court hallway, holding worn papers, rain on the windows, slow push-in, realistic cinematic drama.';

test('E03 se planifica con 9 tomas E03-P01…P09 y duración de Veo válida', async () => {
  await withStudio(async (filmId) => {
    const plan = await scenePlan(filmId, 'E03');
    assert.equal(plan.shots.length, 9);
    assert.deepEqual(plan.shots.map((s) => s.shotId), Array.from({ length: 9 }, (_, i) => 'E03-P0' + (i + 1)));
    assert.ok(plan.shots.every((s) => [4, 6, 8].includes(s.providerSeconds)));
    assert.equal(plan.legacy, false);
    assert.equal((await scenePlan(filmId, 'E02')).legacy, true);
  });
});

test('Las versiones de prompt son inmutables y la última manda', async () => {
  await withStudio(async (filmId) => {
    const a = await savePromptRevision(filmId, 'E03-P01', PROMPT);
    const b = await savePromptRevision(filmId, 'E03-P01', PROMPT + ' Warm light.');
    assert.notEqual(a.revisionId, b.revisionId);
    assert.equal((await latestPromptRevision(filmId, 'E03-P01'))?.revisionId, b.revisionId);
    await assert.rejects(savePromptRevision(filmId, 'E03-P01', 'corto'), /entre 60 y 3500/);
  });
});

test('Sin interruptor, tarifa verificada y tope fijo no se envía nada ni se reserva gasto', async () => {
  await withStudio(async (filmId, root) => {
    const rev = await savePromptRevision(filmId, 'E03-P01', PROMPT);
    await assert.rejects(submitSceneShot(filmId, 'E03-P01', { revisionId: rev.revisionId, authorization: 'x' }), /apagado/);
    env.NODE_ENV = 'development';
    process.env.V7_VEO_SCENES_ENABLED = 'true';
    process.env.GEMINI_API_KEY = 'AIza-test-key-not-real';
    await assert.rejects(submitSceneShot(filmId, 'E03-P01', { revisionId: rev.revisionId, authorization: 'x' }), /Tarifa de Veo sin verificar/);
    process.env.V7_VEO_USD_PER_SECOND = '0.05';
    await assert.rejects(submitSceneShot(filmId, 'E03-P01', { revisionId: rev.revisionId, authorization: 'x' }), /V7_SCENE_MAX_USD/);
    process.env.V7_SCENE_MAX_USD = '5';
    const usd = estimateShotUsd((await scenePlan(filmId, 'E03')).shots[0].editSeconds, 0.05);
    await assert.rejects(submitSceneShot(filmId, 'E03-P01', { revisionId: rev.revisionId, authorization: 'AUTORIZO E03-P01' }),
      new RegExp(authorizationPhrase('E03-P01', usd).replace('$', '\\$')));
    await assert.rejects(readFile(recordPath(filmId, 'E03-P01')), { code: 'ENOENT' });
    assert.equal(await sceneExposureUsd(filmId, 'E03'), 0);
    assert.ok(root.length > 0);
  });
});

test('El tope de escena es fijo: un intento dudoso cuenta y bloquea superar el tope', async () => {
  await withStudio(async (filmId) => {
    env.NODE_ENV = 'development';
    process.env.V7_VEO_SCENES_ENABLED = 'true';
    process.env.GEMINI_API_KEY = 'AIza-test-key-not-real';
    process.env.V7_VEO_USD_PER_SECOND = '0.05';
    process.env.V7_SCENE_MAX_USD = '0.40';
    await mkdir(path.dirname(recordPath(filmId, 'E03-P01')), { recursive: true });
    await writeFile(recordPath(filmId, 'E03-P01'), JSON.stringify({
      schemaVersion: 1, provider: 'veo', filmId, shotId: 'E03-P01', sceneLabel: 'E03', model: 'm', mode: 'text-to-video',
      durationSeconds: 8, estimatedUsd: 0.4, revisionId: 'v00000000000000000-00000000-0000-0000-0000-000000000000',
      promptHash: 'x', referenceSha256: null, status: 'failed-unknown', createdAt: '', updatedAt: ''
    }));
    assert.equal(await sceneExposureUsd(filmId, 'E03'), 0.4);
    const rev = await savePromptRevision(filmId, 'E03-P02', PROMPT);
    const board = await sceneStudioBoard(filmId, 'E03');
    const p02 = board.shots.find((s) => s.shotId === 'E03-P02')!;
    await assert.rejects(submitSceneShot(filmId, 'E03-P02', { revisionId: rev.revisionId, authorization: p02.authorization! }), /Tope de la escena/);
    const r1 = await savePromptRevision(filmId, 'E03-P01', PROMPT + ' v2');
    process.env.V7_SCENE_MAX_USD = '10';
    const p01 = (await sceneStudioBoard(filmId, 'E03')).shots[0];
    await assert.rejects(submitSceneShot(filmId, 'E03-P01', { revisionId: r1.revisionId, authorization: p01.authorization! }), /nunca se reenvía/);
  });
});

test('Un video de Veo recuperado aparece en el tablero de aprobación con el formato de siempre', async () => {
  await withStudio(async (filmId) => {
    const label = 'E03-P01';
    await mkdir(path.dirname(candidatePath(filmId, label)), { recursive: true });
    await writeFile(candidatePath(filmId, label), Buffer.alloc(20000, 1));
    await writeFile(recordPath(filmId, label), JSON.stringify({
      schemaVersion: 1, provider: 'veo', filmId, shotId: label, status: 'review-required',
      candidateName: path.basename(candidatePath(filmId, label)), estimatedUsd: 0.4
    }));
    const resolved = await resolveV7ShotVideo(filmId, label);
    assert.equal(resolved?.provider, 'veo');
    assert.equal(resolved?.filename, 'E03-P01-veo-candidato.mp4');
  });
});
