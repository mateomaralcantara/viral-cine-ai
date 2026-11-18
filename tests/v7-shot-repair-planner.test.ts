import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptRepair, cleanWindow, planRepair, repairAudioFilter, repairVideoFilter } from '../lib/v7/qa/shot-repair-planner';
import type { ShotReview } from '../lib/v7/qa/shot-vision-review';

const review = (over: Partial<ShotReview>): ShotReview => ({ puntuacion: 5, coincideConGuion: 9, identidad: 9, textoEnPantalla: false, bocasHablando: false,
  problemas: [], veredicto: 'rehacer', motivo: '', promptSugerido: '', ...over });

test('cleanWindow evita los segundos con fallo', () => {
  assert.deepEqual(cleanWindow(8, [1]), { start: 1.6, end: 8 });
  assert.deepEqual(cleanWindow(8, [6.5]), { start: 0, end: 5.9 });
  assert.equal(cleanWindow(8, []), null);
  assert.equal(cleanWindow(4, [1, 2.5]), null);
});

test('recuadro congelado en el segundo 1 (E05-P01): quita el tramo y ralentiza poco', () => {
  const p = planRepair(review({ problemas: [{ tipo: 'Artefacto visual', gravedad: 'critico', descripcion: 'un recuadro de la escena anterior queda superpuesto', segundo: 1 }] }), 8);
  assert.deepEqual(p.window, { start: 1.6, end: 8 });
  assert.equal(p.speed, 1);
  assert.equal(p.unfixable.length, 0);
  assert.match(repairVideoFilter(p), /trim=start=1.6:end=8/);
});

test('logo abajo a la derecha (E05-P04): recorte que conserva arriba a la izquierda', () => {
  const p = planRepair(review({ textoEnPantalla: true, problemas: [{ tipo: 'Texto en pantalla', gravedad: 'critico', descripcion: 'logotipo en la esquina inferior derecha' }] }), 8);
  assert.equal(p.zoom, 1.2); assert.equal(p.anchorX, 0); assert.equal(p.anchorY, 0);
  assert.equal(planRepair(review({ textoEnPantalla: true }), 8, 2).zoom, 1.3);
});

test('bocas hablando: se silencia el audio original', () => {
  const p = planRepair(review({ bocasHablando: true }), 8);
  assert.ok(p.muteOriginal);
  assert.match(repairAudioFilter(p), /volume=0/);
});

test('identidad: queda como no reparable gratis', () => {
  const p = planRepair(review({ identidad: 2, problemas: [{ tipo: 'Identidad de personaje', gravedad: 'critico', descripcion: 'pelo corto' }] }), 8);
  assert.ok(p.unfixable[0].includes('identidad'));
});

test('manos deformes: zoom anclado arriba', () => {
  const p = planRepair(review({ problemas: [{ tipo: 'Anatomía', gravedad: 'critico', descripcion: 'dedos fusionados en la mano' }] }), 8);
  assert.equal(p.anchorY, 0); assert.ok(p.zoom > 1);
});

test('acceptRepair exige mejora real', () => {
  assert.ok(acceptRepair(review({ puntuacion: 5 }), review({ puntuacion: 6 })));
  assert.ok(!acceptRepair(review({ puntuacion: 5 }), review({ puntuacion: 5.2 })));
  assert.ok(!acceptRepair(review({ puntuacion: 5 }), review({ puntuacion: 7, coincideConGuion: 6 })));
});
