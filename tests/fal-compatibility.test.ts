import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeFalFailure,
  FAL_VIDEO_PROMPT_MAX_LENGTH,
  isGooglePrepayDepleted,
  normalizeFalVideoPrompt
} from '../lib/providers/fal-compat';

test('limita el prompt de Vidu Q3 sin perder las restricciones finales', () => {
  const prompt = `Inicio cinematográfico ${'detalle visual '.repeat(180)} NO CAMBIAR ROSTRO NI VESTUARIO`;
  const normalized = normalizeFalVideoPrompt(prompt);

  assert.ok(normalized.length <= FAL_VIDEO_PROMPT_MAX_LENGTH);
  assert.match(normalized, /^Inicio cinematográfico/);
  assert.match(normalized, /NO CAMBIAR ROSTRO NI VESTUARIO$/);
});

test('muestra el campo exacto de una respuesta 422 de Fal.ai', () => {
  const failure = describeFalFailure({
    message: 'Unprocessable Entity',
    status: 422,
    requestId: 'req_demo',
    body: {
      detail: [{ loc: ['body', 'prompt'], msg: 'String should have at most 2000 characters' }]
    }
  });

  assert.equal(failure.status, 422);
  assert.equal(failure.requestId, 'req_demo');
  assert.deepEqual(failure.details, ['body.prompt: String should have at most 2000 characters']);
});

test('detecta saldo prepagado de Google agotado', () => {
  assert.equal(isGooglePrepayDepleted('Your prepayment credits are depleted.'), true);
  assert.equal(isGooglePrepayDepleted('Invalid API key'), false);
});
