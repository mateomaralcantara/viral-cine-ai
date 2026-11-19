import test from 'node:test';
import assert from 'node:assert/strict';
import { keyframePrompt, masterPortraitPrompt, needsIdentityFix, sanitizePrompt, shotShows } from '../lib/v7/production/character-reference';

test('sanitizePrompt quita palabras que hacen saltar el filtro', () => {
  assert.equal(sanitizePrompt('una luz blanca intensa y divina inunda'), 'una luz blanca intensa y cálida inunda');
  assert.ok(!/sagrad/i.test(sanitizePrompt('un lugar sagrado')));
});

test('needsIdentityFix según el informe del revisor', () => {
  assert.ok(needsIdentityFix({ identidad: 2, problemas: [] }));
  assert.ok(needsIdentityFix({ identidad: 8, problemas: [{ tipo: 'Identidad de personaje', descripcion: 'pelo corto', gravedad: 'critico' }] }));
  assert.ok(!needsIdentityFix({ identidad: 9, problemas: [{ tipo: 'Anatomía', descripcion: 'dedos', gravedad: 'critico' }] }));
  assert.ok(!needsIdentityFix(null));
});

test('prompts de imagen: misma persona, sin texto, bocas cerradas', () => {
  const m = masterPortraitPrompt('Martin', 'barba oscura');
  assert.match(m, /misma persona/); assert.match(m, /Sin texto/);
  const k = keyframePrompt('Martin', 'Martin en la cima, luz divina');
  assert.match(k, /PRIMER FOTOGRAMA/); assert.match(k, /bocas cerradas/i); assert.ok(!/divina/.test(k));
});

test('shotShows detecta al protagonista', () => {
  assert.ok(shotShows('Martin', 'Plano de Martin junto a la ventana'));
  assert.ok(!shotShows('Martin', 'Un salón vacío con columnas'));
});
