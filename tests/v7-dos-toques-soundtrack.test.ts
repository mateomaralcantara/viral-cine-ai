import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('original emotional score has a valid ten-scene 600s cue map', async () => {
  const raw = await readFile(new URL('../films/dos-toques-de-bocina/BANDA-SONORA-CUES-V1.json', import.meta.url), 'utf8');
  const plan = JSON.parse(raw) as {
    filmId: string;
    durationSeconds: number;
    state: string;
    cues: Array<{ start: number; end: number; scene: number; title: string }>;
    mixPolicy: {
      recommendedMusicGainDb: number;
      expectedHornBeepCount: number;
      noMusicPriorityWindows: number[][];
      dialoguePriority: boolean;
    };
  };
  assert.equal(plan.filmId, 'film-dos-toques-de-bocina-v7');
  assert.equal(plan.durationSeconds, 600);
  assert.equal(plan.cues.length, 10);
  assert.equal(plan.cues[0].start, 0);
  assert.equal(plan.cues.at(-1)?.end, 600);
  for (let i = 0; i < plan.cues.length; i++) {
    assert.equal(plan.cues[i].scene, i + 1);
    assert.ok(plan.cues[i].end > plan.cues[i].start);
    if (i > 0) assert.equal(plan.cues[i].start, plan.cues[i - 1].end);
  }
  assert.equal(plan.state, 'editorial-review-required');
  assert.ok(plan.mixPolicy.dialoguePriority);
  assert.ok(plan.mixPolicy.recommendedMusicGainDb < 0);
  assert.equal(plan.mixPolicy.expectedHornBeepCount, 2);
  assert.ok(plan.mixPolicy.noMusicPriorityWindows.length >= 2);
});
