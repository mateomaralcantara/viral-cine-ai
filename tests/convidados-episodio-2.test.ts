import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEpisodio2Bundle, EPISODIO_2_SPEC, getEpisodio2Stats } from '../lib/v7/presets/convidados-episodio-2';
import { speechSeconds } from '../lib/v7/production/film-voice-mix';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';

const beats = EPISODIO_2_SPEC.scenes.flatMap((s) => s.beats);

test('Episodio 2: 8 secuencias, registrado para los agentes y con los harness activos', () => {
  assert.equal(getEpisodio2Stats().scenes, 8);
  assert.equal(FILM_KEYS.episodio2, 'film-convidados-ep02-v7');
  assert.equal(EPISODIO_2_SPEC.metadata?.puertaDeCalidad, true);
  assert.equal(EPISODIO_2_SPEC.metadata?.continuidadObligatoria, true);
  assert.ok(createEpisodio2Bundle().film.acts.length > 0);
});

test('Episodio 2: toda frase dicha en cámara cabe en su toma (nada se corta ni se atropella)', () => {
  for (const b of beats.filter((x) => x.onCamera)) assert.ok(speechSeconds(b.line) + 0.6 <= (b.seconds ?? 8), `${b.title}: «${b.line}» en ${b.seconds}s`);
});

test('Episodio 2: el Heraldo y el Fiscal nunca hablan en cámara (voz estable, sin labios inventados)', () => {
  for (const b of beats.filter((x) => x.voice === 'heraldo' || x.voice === 'fiscal')) assert.notEqual(b.onCamera, true, b.title);
});

test('Episodio 2: el vestuario de Martin es el mismo en todas las escenas y ningún plano pide letras legibles', () => {
  assert.equal(new Set(EPISODIO_2_SPEC.scenes.map((s) => s.wardrobe)).size, 1);
  for (const b of beats) assert.ok(!/inscripci[oó]n(es)? (luminosas|legibles)/i.test(b.prompt), b.title);
});
