import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isVeoNoChargeFailure,
  isVeoQuotaFailure,
  VeoNoVideoError
} from '../lib/providers/veo';

test('Veo 429 se clasifica como fallo de cuota sin generación', () => {
  assert.equal(isVeoQuotaFailure({ status: 429 }), true);
});

test('Veo RESOURCE_EXHAUSTED se clasifica como fallo de cuota', () => {
  assert.equal(
    isVeoQuotaFailure(
      new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"You exceeded your current quota"}}')
    ),
    true
  );
});

test('errores Veo ajenos a cuota no se clasifican como quota failure', () => {
  assert.equal(isVeoQuotaFailure({ status: 500, message: 'internal error' }), false);
});

test('no-video y quota son categorías distinguibles', () => {
  const noVideo = new VeoNoVideoError('Veo terminó sin devolver video.');
  assert.equal(isVeoNoChargeFailure(noVideo), true);
  assert.equal(isVeoQuotaFailure(noVideo), false);
});
