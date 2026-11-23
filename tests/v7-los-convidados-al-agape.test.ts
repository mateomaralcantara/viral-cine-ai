import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createConvidadosBundle, CONVIDADOS_ID, getConvidadosStats } from '../lib/v7/presets/los-convidados-al-agape';
import { saveV7FilmBundle } from '../lib/v7/storage/film-store';
import { sceneLabels, scenePlan } from '../lib/v7/production/scene-veo-engine';

test('Los convidados al Ágape: tráiler de 3 min, 5 escenas, 22 tomas curadas en español', async () => {
  const saved = process.env.VIRALCINE_DATA_DIR;
  const tmp = await mkdtemp(path.join(tmpdir(), 'v7-agape-'));
  process.env.VIRALCINE_DATA_DIR = tmp;
  try {
    const stats = getConvidadosStats();
    assert.deepEqual(stats, { scenes: 5, shots: 22, totalSeconds: 176 });
    const bundle = await saveV7FilmBundle(createConvidadosBundle());
    assert.equal(bundle.film.durationMinutes, 3);
    const labels = (await sceneLabels(CONVIDADOS_ID)).studioLabels;
    assert.deepEqual(labels, ['E01', 'E02', 'E03', 'E04', 'E05']);
    for (const label of labels) {
      for (const shot of (await scenePlan(CONVIDADOS_ID, label)).shots) {
        assert.equal(shot.providerSeconds, 8);
        assert.ok(shot.defaultPrompt.includes('Sin subtítulos ni texto en pantalla'), shot.shotId);
        assert.ok(!/wearing|Realistic|niña|niño|sangre|cadáver|arma/i.test(shot.defaultPrompt), shot.shotId + ': español y sin contenido que bloquee el filtro');
        assert.ok(shot.spokenText.length > 5, shot.shotId + ': narración o diálogo');
        if (shot.defaultPrompt.includes('Martin, un hombre')) {
          assert.ok(shot.defaultPrompt.includes('pelo oscuro ondulado hasta los hombros'), shot.shotId + ': Martin siempre igual');
        }
      }
    }
  } finally {
    if (saved === undefined) delete process.env.VIRALCINE_DATA_DIR; else process.env.VIRALCINE_DATA_DIR = saved;
    await rm(tmp, { recursive: true, force: true });
  }
});
