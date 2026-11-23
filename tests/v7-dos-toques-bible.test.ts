import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createDosToquesBundle } from '../lib/v7/presets/dos-toques-de-bocina';

test('approved production bible preserves canonical cast and exact ten-minute continuity', async () => {
  const bible = await readFile(
    new URL('../films/dos-toques-de-bocina/BIBLIA-CINEMATOGRAFICA-MAESTRA-V1.md', import.meta.url),
    'utf8'
  );
  const bundle = createDosToquesBundle('2026-10-09T00:00:00.000Z');
  const scenes = bundle.film.acts.flatMap(a => a.sequences.flatMap(s => s.scenes));
  const shots = scenes.flatMap(s => s.shots);
  assert.equal(bundle.film.durationMinutes, 10);
  assert.equal(scenes.length, 10);
  assert.equal(shots.length, 80);
  assert.equal(scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0), 600);
  assert.equal(bundle.assets.length, 0);
  assert.match(bible, /Daniel es el hijo y Samuel el amigo/);
  assert.match(bible, /DOS TOQUES DE BOCINA/);
  assert.match(bible, /600 s/);
  assert.match(bible, /Libroseller/);
  assert.match(bible, /dos toques de bocina/i);
  assert.match(bible, /US\$0/);
  assert.match(bible, /NO son voces sintetizadas/);
  assert.ok(bundle.voiceProfiles.every(v => !v.approved));
});
