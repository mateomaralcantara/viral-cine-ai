import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPrimeraPaginaBundle, PRIMERA_PAGINA_ID } from '../lib/v7/presets/la-primera-pagina';
import { createDosToquesBundle } from '../lib/v7/presets/dos-toques-de-bocina';
import { saveV7FilmBundle } from '../lib/v7/storage/film-store';
import { sceneLabels, scenePlan, sceneStudioBoard, submitWholeScene } from '../lib/v7/production/scene-veo-engine';

const env = process.env as Record<string, string | undefined>;
const KEYS = ['VIRALCINE_DATA_DIR', 'V7_VEO_SCENES_ENABLED', 'V7_VEO_USD_PER_SECOND', 'V7_SCENE_MAX_USD', 'GEMINI_API_KEY', 'NODE_ENV', 'V7_FROZEN_FILMS'];
async function withData(fn: () => Promise<void>) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, env[k]]));
  const tmp = await mkdtemp(path.join(tmpdir(), 'v7-primera-'));
  env.VIRALCINE_DATA_DIR = tmp;
  for (const k of KEYS.slice(1)) delete env[k];
  try { await fn(); } finally {
    for (const k of KEYS) { if (saved[k] === undefined) delete env[k]; else env[k] = saved[k]; }
    await rm(tmp, { recursive: true, force: true });
  }
}

test('La primera página: 2 minutos, 3 escenas, 15 tomas de 8 s con prompts curados', async () => {
  await withData(async () => {
    await saveV7FilmBundle(createPrimeraPaginaBundle());
    const labels = await sceneLabels(PRIMERA_PAGINA_ID);
    assert.deepEqual(labels.studioLabels, ['E01', 'E02', 'E03']);
    let total = 0;
    for (const label of labels.studioLabels) {
      const plan = await scenePlan(PRIMERA_PAGINA_ID, label);
      assert.equal(plan.legacy, false);
      assert.equal(plan.shots.length, 5);
      for (const shot of plan.shots) {
        total += shot.editSeconds;
        assert.equal(shot.providerSeconds, 8);
        assert.ok(shot.defaultPrompt.startsWith(shot.defaultPrompt.split(' ')[0]) && !shot.defaultPrompt.startsWith('Drama cinematográfico'));
        assert.ok(!/GeneLibro|Libroseller|logo of|child|boy|girl/i.test(shot.defaultPrompt), shot.shotId + ': sin marcas ni niños en el video');
        assert.ok(shot.spokenText.length > 10, shot.shotId + ': tiene narración para la voz');
      }
    }
    assert.equal(total, 120);
    const board = await sceneStudioBoard(PRIMERA_PAGINA_ID, 'E01');
    assert.equal(board.shots[0].promptText, (await scenePlan(PRIMERA_PAGINA_ID, 'E01')).shots[0].defaultPrompt);
  });
});

test('Dos toques congelado: ninguna generación pagada aunque todo esté configurado', async () => {
  await withData(async () => {
    const dos = await saveV7FilmBundle(createDosToquesBundle());
    env.NODE_ENV = 'development'; env.V7_VEO_SCENES_ENABLED = 'true'; env.GEMINI_API_KEY = 'AIza-test-key-not-real';
    env.V7_VEO_USD_PER_SECOND = '0.10'; env.V7_SCENE_MAX_USD = '20';
    env.V7_FROZEN_FILMS = dos.film.id;
    const board = await sceneStudioBoard(dos.film.id, 'E06');
    assert.equal(board.providerEnabled, false);
    await assert.rejects(submitWholeScene(dos.film.id, 'E06', board.sceneAuthorization!), /congelada/);
    // En «Dos toques», E01/E02 siguen siendo escenas con motor propio; en otras películas, no.
    assert.deepEqual((await sceneLabels(dos.film.id)).studioLabels[0], 'E03');
  });
});

test('La primera página: E02 y E03 en español, con voces de fondo en español dominicano', async () => {
  await withData(async () => {
    await saveV7FilmBundle(createPrimeraPaginaBundle());
    for (const label of ['E02', 'E03']) {
      for (const shot of (await scenePlan(PRIMERA_PAGINA_ID, label)).shots) {
        assert.ok(shot.defaultPrompt.includes('español dominicano'), shot.shotId);
        assert.ok(!/Realistic, restrained|wearing a/.test(shot.defaultPrompt), shot.shotId + ': sin inglés');
      }
    }
  });
});
