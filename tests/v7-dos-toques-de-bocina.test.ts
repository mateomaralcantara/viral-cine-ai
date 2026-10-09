import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDosToquesBundle, DOS_TOQUES_ID, DOS_TOQUES_DURATION_SECONDS, getDosToquesProductionStats
} from '../lib/v7/presets/dos-toques-de-bocina';

test('Dos Toques is a new independent 600-second film with ten scenes', () => {
  const bundle = createDosToquesBundle('2026-10-09T00:00:00.000Z');
  const film = bundle.film;
  const scenes = film.acts.flatMap(a => a.sequences.flatMap(s => s.scenes));
  const shots = scenes.flatMap(s => s.shots);
  const stats = getDosToquesProductionStats();

  assert.equal(film.id, DOS_TOQUES_ID);
  assert.equal(film.title, 'DOS TOQUES DE BOCINA');
  assert.equal(film.durationMinutes, 10);
  assert.equal(film.budgetUsd, 0);
  assert.equal(film.legacyProjectId, undefined);
  assert.equal(film.metadata.isolatedFromV6And15Dias, true);
  assert.equal(film.acts.length, 3);
  assert.equal(scenes.length, 10);
  assert.equal(stats.scenes, 10);
  assert.equal(stats.shots, shots.length);
  assert.equal(stats.totalSeconds, DOS_TOQUES_DURATION_SECONDS);
  assert.equal(Math.round(scenes.reduce((sum, s) => sum + s.durationSeconds, 0)), 600);
  assert.ok(shots.length >= 75);
  assert.ok(shots.every(s => s.durationSeconds > 0 && s.durationSeconds <= 8));
  assert.ok(shots.every(s => s.takes.length === 0 && !s.selectedTakeId));
  assert.ok(scenes.every(s => !s.metadata.shotGenerationApproved));
  assert.equal(bundle.assets.length, 0);
  assert.equal(bundle.creationInput?.budgetUsd, 0);
  assert.ok(bundle.voiceProfiles.length >= 7);
  assert.ok(bundle.voiceProfiles.every(v => !v.approved && v.rightsStatus === 'unknown'));
  assert.ok(film.characters.every(c => c.metadata.canonicalImageApproved === false));
  assert.equal(film.metadata.screenplayApprovedForPaidRendering, false);
  assert.equal(film.metadata.storyTreatmentApproved, true);
});

test('scene time indexes and frame durations preserve exactly 10 minutes', () => {
  const scenes = createDosToquesBundle().film.acts.flatMap(a => a.sequences.flatMap(s => s.scenes));
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const start = scenes.slice(0, i).reduce((sum, s) => sum + s.durationSeconds, 0);
    assert.equal(scene.timeIndex, start);
    const shotTotal = scene.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
    assert.ok(Math.abs(shotTotal - scene.durationSeconds) < 0.000001);
    assert.ok(scene.shots.every(s => s.metadata.lipsyncStatus === 'deferred'));
  }
});
