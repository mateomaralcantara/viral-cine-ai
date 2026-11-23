import test from 'node:test';
import assert from 'node:assert/strict';
import { needsIdentityFix, shotShows } from '../lib/v7/production/character-reference';
import { characterKeyFromId, masterFromPhotosPrompt, multiKeyframePrompt, newSheet, serieOf, slug } from '../lib/v7/production/character-identity';
import { REVIEW_RULES } from '../lib/v7/qa/shot-vision-review';

test('needsIdentityFix según el informe del revisor', () => {
  assert.ok(needsIdentityFix({ identidad: 2, problemas: [] }));
  assert.ok(needsIdentityFix({ identidad: 8, problemas: [{ tipo: 'Identidad de personaje', descripcion: 'pelo corto', gravedad: 'critico' }] }));
  assert.ok(!needsIdentityFix({ identidad: 9, problemas: [{ tipo: 'Anatomía', descripcion: 'dedos', gravedad: 'critico' }] }));
  assert.ok(!needsIdentityFix(null));
});

test('shotShows detecta al personaje (con o sin tilde)', () => {
  assert.ok(shotShows('Martin', 'Plano de Martín junto a la ventana'));
  assert.ok(shotShows('Heraldo', 'el Heraldo espera'));
  assert.ok(!shotShows('Martin', 'Un salón vacío con columnas'));
});

test('serie y claves de personaje', () => {
  assert.equal(serieOf({ id: 'film-los-convidados-al-agape-v7', metadata: {} }), 'los-convidados-al-agape');
  assert.equal(serieOf({ id: 'film-capitulo-1-v7', metadata: { serie: 'los-convidados-al-agape' } }), 'los-convidados-al-agape');
  assert.equal(characterKeyFromId('film-x-v7-character-fiscal'), 'fiscal');
  assert.equal(slug('El Fiscal'), 'fiscal');
  assert.throws(() => serieOf({ id: 'x', metadata: { serie: '../etc' } }));
});

test('prompts de identidad: misma persona o entidad, sin censura de lo divino', () => {
  const s = { ...newSheet('dios', 'Dios', 'una presencia de luz con rostro anciano y sereno, majestuosa y divina') };
  const m = masterFromPhotosPrompt(s, 2);
  assert.match(m, /2 imágenes/); assert.match(m, /divina/);
  const k = multiKeyframePrompt([{ nombre: 'Martin', descripcion: '' }, { nombre: 'Dios', descripcion: 'luz divina' }], 'Martin ante una luz divina');
  assert.match(k, /Imagen 2: Dios/); assert.match(k, /luz divina/);
  assert.ok(REVIEW_RULES.some((r) => /divinas.*permitidas/i.test(r)), 'el revisor no penaliza lo divino');
});
