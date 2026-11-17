import test from 'node:test';
import assert from 'node:assert/strict';
import { createConvidadosBundle } from '../lib/v7/presets/los-convidados-al-agape';
import { pickCasting, planCharacters, shotTiming, speakerKey, voicePlan } from '../lib/v7/production/film-voice-mix';

test('voicePlan: cada toma de «Los convidados» tiene su frase y su personaje', () => {
  const lines = voicePlan(createConvidadosBundle().film);
  assert.equal(lines.length, 22);
  assert.equal(lines[0].label, 'E01-P01');
  assert.equal(lines[0].speaker, 'narrador');
  assert.equal(lines.find((l) => l.label === 'E02-P04')?.speaker, 'heraldo');
  assert.deepEqual([...new Set(lines.map((l) => l.speaker))].sort(), ['fiscal', 'heraldo', 'martin', 'narrador']);
  assert.ok(planCharacters(lines) < 10000, 'cabe en el plan gratis de ElevenLabs');
});

test('speakerKey quita el prefijo de la película', () => {
  assert.equal(speakerKey('film-x', 'film-x-character-martin'), 'martin');
  assert.equal(speakerKey('film-x', undefined), 'narrador');
});

test('pickCasting: voces distintas, respeta preferencias y el casting guardado', () => {
  const voices = ['George', 'Liam', 'Bill', 'Callum', 'Sarah'].map((name) => ({ voiceId: 'id-' + name, name }));
  const c = pickCasting(['narrador', 'martin', 'heraldo', 'fiscal'], voices);
  assert.equal(c.narrador.name, 'George');
  assert.equal(c.martin.name, 'Liam');
  assert.equal(c.heraldo.name, 'Bill');
  assert.equal(c.fiscal.name, 'Callum');
  const kept = pickCasting(['narrador', 'martin'], voices, { narrador: { voiceId: 'id-Liam', name: 'Liam' } });
  assert.equal(kept.narrador.name, 'Liam');
  assert.notEqual(kept.martin.voiceId, 'id-Liam');
  assert.throws(() => pickCasting(['a', 'b'], [voices[0]]));
});

test('shotTiming: alarga la toma solo si la voz no cabe', () => {
  assert.deepEqual(shotTiming(8, 5), { total: 8, freeze: 0 });
  assert.deepEqual(shotTiming(8, 9), { total: 9.95, freeze: 1.95 });
  assert.deepEqual(shotTiming(8, null), { total: 8, freeze: 0 });
});
