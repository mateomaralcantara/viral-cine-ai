import test from 'node:test';
import assert from 'node:assert/strict';
import { createEpisodio1Bundle, EPISODIO_1_SPEC, getEpisodio1Stats } from '../lib/v7/presets/convidados-episodio-1';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';
import { voicePlan, VOICE_ALIASES, voiceTreatment } from '../lib/v7/production/film-voice-mix';
import { serieOf } from '../lib/v7/production/character-identity';

test('Episodio 1: 10 secuencias, ~14 min de tomas, serie compartida', () => {
  const film = createEpisodio1Bundle().film;
  const stats = getEpisodio1Stats();
  assert.equal(stats.scenes, 10);
  assert.ok(stats.totalSeconds > 780 && stats.totalSeconds < 960, String(stats.totalSeconds));
  assert.equal(serieOf(film), 'los-convidados-al-agape');
  assert.equal(indexedScenes(film).length, 10);
  assert.ok(film.acts.length <= 5);
});

test('Episodio 1: todas las tomas cumplen el motor (4/6/8 s) y en español sin texto en pantalla', () => {
  for (const b of EPISODIO_1_SPEC.scenes.flatMap((s) => s.beats)) {
    assert.ok([4, 6, 8].includes(b.seconds ?? 8), b.title);
    assert.match(b.prompt, /Sin subtítulos ni texto en pantalla/, b.title);
    if (b.onCamera) assert.ok(b.prompt.includes('«' + b.line + '»'), 'el diálogo va en el prompt: ' + b.title);
    if (b.onCamera) assert.ok(b.line.length / ((b.seconds ?? 8) - 0.5) <= 15, 'diálogo demasiado largo para la toma: ' + b.title);
  }
});

test('Episodio 1: el diálogo en cámara no pasa por ElevenLabs; la voz interior usa la voz de Martin', () => {
  const lines = voicePlan(createEpisodio1Bundle().film);
  const onCam = EPISODIO_1_SPEC.scenes.flatMap((s) => s.beats).filter((b) => b.onCamera).length;
  assert.ok(onCam > 60);
  assert.ok(lines.every((l) => ['martin', 'narrador', 'voz-interior', 'voz-desconocida'].includes(l.speaker)));
  assert.equal(VOICE_ALIASES['voz-interior'], 'martin');
  assert.ok(voiceTreatment('voz-desconocida'));
});

test('Episodio 1: no muestra el tribunal ni figuras históricas en la montaña', () => {
  const prompts = EPISODIO_1_SPEC.scenes.flatMap((s) => s.beats.map((b) => b.prompt)).join(' ');
  assert.ok(!/tribunal|Sócrates|Platón|Nietzsche está|Kant está/i.test(prompts));
});
