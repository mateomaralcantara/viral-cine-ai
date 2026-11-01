import test from 'node:test';
import assert from 'node:assert/strict';
import { isImageProviderFallbackEligible } from '../lib/engine/image-reference-fallback-v4';

test('imagen bloqueada por moderación activa fallback local/de continuidad', () => {
  assert.equal(
    isImageProviderFallbackEligible({
      status: 400,
      code: 'moderation_blocked',
      error: {
        code: 'moderation_blocked',
        type: 'image_generation_user_error',
        message: 'Your request was rejected by the safety system.'
      }
    }),
    true
  );
});

test('429 y 5xx de imágenes activan fallback sin tumbar el batch', () => {
  assert.equal(isImageProviderFallbackEligible({ status: 429 }), true);
  assert.equal(isImageProviderFallbackEligible({ status: 503 }), true);
});

test('credenciales inválidas no se esconden detrás del fallback', () => {
  assert.equal(
    isImageProviderFallbackEligible({
      status: 401,
      code: 'invalid_api_key',
      error: { code: 'invalid_api_key' }
    }),
    false
  );
});
