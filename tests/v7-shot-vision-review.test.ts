import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewPrompt, normalizeReview, reviewCostUsd } from '../lib/v7/qa/shot-vision-review';

const base = { puntuacion: 9, coincideConGuion: 9, identidad: 8, textoEnPantalla: false, bocasHablando: false, problemas: [], veredicto: 'aprobar', motivo: 'Bien', promptSugerido: 'x' };

test('buildReviewPrompt incluye guion, personajes, voz y reglas', () => {
  const p = buildReviewPrompt({ label: 'E01-P01', title: 'Duelo', prompt: 'Martin junto a la ventana', spokenText: 'Martin tenía…', speaker: 'narrador',
    characters: [{ name: 'Martin', appearance: 'barba oscura' }], hasCover: true });
  for (const s of ['E01-P01', 'Martin junto a la ventana', 'barba oscura', 'Martin tenía…', 'portada', 'labios']) assert.ok(p.includes(s), s);
});

test('normalizeReview aprueba una buena toma y vacía el texto sugerido', () => {
  const r = normalizeReview(JSON.stringify(base));
  assert.equal(r.veredicto, 'aprobar');
  assert.equal(r.promptSugerido, '');
});

test('normalizeReview: el veredicto lo deciden las reglas, no el modelo', () => {
  assert.equal(normalizeReview({ ...base, textoEnPantalla: true }).veredicto, 'rehacer');
  assert.equal(normalizeReview({ ...base, bocasHablando: true }).veredicto, 'revisar');
  assert.equal(normalizeReview({ ...base, puntuacion: 7 }).veredicto, 'revisar');
  assert.equal(normalizeReview({ ...base, puntuacion: 5, promptSugerido: 'nuevo' }).promptSugerido, 'nuevo');
  assert.equal(normalizeReview({ ...base, problemas: [{ tipo: 'manos', gravedad: 'critico', descripcion: 'seis dedos' }] }).veredicto, 'rehacer');
  assert.equal(normalizeReview({ ...base, puntuacion: 42, identidad: null }).puntuacion, 10);
});

test('reviewCostUsd', () => {
  assert.equal(reviewCostUsd(1_000_000, 0), 0.5);
  assert.ok(reviewCostUsd(5000, 800) < 0.01);
});

test('diálogo en cámara: hablar no es defecto y la regla pide labios sincronizados', async () => {
  const { rulesFor } = await import('../lib/v7/qa/shot-vision-review');
  assert.equal(normalizeReview({ ...base, bocasHablando: true }, { onCamera: true }).veredicto, 'aprobar');
  assert.ok(rulesFor({ onCamera: true }).some((r) => /labios sincronizados/.test(r)));
  const p = buildReviewPrompt({ label: 'E01-P03', title: 't', prompt: 'p', spokenText: '¿Por qué me miras así?', speaker: 'esposa', characters: [], hasCover: false, onCamera: true });
  assert.match(p, /DIÁLOGO EN CÁMARA/);
});
