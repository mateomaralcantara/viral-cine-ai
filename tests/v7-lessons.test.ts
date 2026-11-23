import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { activeLessons, applyLessons, learnFromDefects, LESSONS, readCounts } from '../lib/v7/qa/lessons';
import { EPISODIO_1_SPEC } from '../lib/v7/presets/convidados-episodio-1';

const beats = EPISODIO_1_SPEC.scenes.flatMap((s) => s.beats);

test('lecciones del piloto: monitor sin números, diálogo sin subtítulos, diálogo intacto', () => {
  const fixed = activeLessons({});
  const monitor = beats.find((b) => b.title === 'Línea plana')!;
  const r = applyLessons(monitor.prompt, fixed);
  assert.ok(r.applied.includes('pantallas') && r.applied.includes('luz-monitor'));
  assert.ok(r.text.endsWith('Sin subtítulos ni texto en pantalla.'));
  const dialog = beats.find((b) => b.onCamera)!;
  const d = applyLessons(dialog.prompt, fixed);
  assert.ok(d.applied.includes('subtitulos') && d.applied.includes('labios'));
  assert.ok(d.text.includes('«' + dialog.line + '»'), 'el diálogo no cambia');
  const landscape = applyLessons('Plano aéreo de una montaña sobre nubes. Sin subtítulos ni texto en pantalla.', fixed);
  assert.deepEqual(landscape.applied, [], 'un paisaje no recibe lecciones de diálogo ni manos');
  assert.equal(applyLessons(r.text, fixed).text, r.text, 'aplicar dos veces no duplica');
});

test('una lección nueva se activa cuando el defecto se repite (una vez por video)', async () => {
  process.env.VIRALCINE_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'lecciones-'));
  assert.ok(!activeLessons(await readCounts()).some((l) => l.id === 'parpadeo'));
  await learnFromDefects(['parpadeo de imagen: glitch en el segundo 4'], 'video-a');
  await learnFromDefects(['parpadeo de imagen: glitch en el segundo 4'], 'video-a');
  assert.ok(!activeLessons(await readCounts()).some((l) => l.id === 'parpadeo'), 'el mismo video no cuenta dos veces');
  await learnFromDefects(['Se observa un parpadeo constante (flickering)'], 'video-b');
  assert.ok(activeLessons(await readCounts()).some((l) => l.id === 'parpadeo'));
  assert.ok(LESSONS.length >= 8);
});

test('diálogo para Veo: «…» pasa a pausa con coma y se indica la pronunciación; el guion no cambia', async () => {
  const { speakableDialogue } = await import('../lib/v7/qa/lessons');
  const out = speakableDialogue('Martin dice en español: «Kant... los límites del conocimiento.». Sin subtítulos ni texto en pantalla.');
  assert.match(out, /«Kant, los límites del conocimiento\.»/);
  assert.match(out, /Pronunciación: Kant/);
  assert.equal((out.match(/«/g) ?? []).length, 1, 'la pista de pronunciación no crea otro diálogo');
  assert.ok(out.endsWith('Sin subtítulos ni texto en pantalla.'));
  assert.equal(speakableDialogue('Un paisaje sin diálogo. Sin subtítulos ni texto en pantalla.'), 'Un paisaje sin diálogo. Sin subtítulos ni texto en pantalla.');
});
