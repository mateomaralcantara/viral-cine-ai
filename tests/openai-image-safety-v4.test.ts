import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProviderSafeImagePrompt,
  hasSensitiveReferenceTerms
} from '../lib/engine/openai-image-safety-v4';

test('detecta lenguaje sensible de violencia en prompts históricos', () => {
  assert.equal(
    hasSensitiveReferenceTerms(
      'Un centurión observa a dos condenados; evitar sangre, heridas y clavos.'
    ),
    true
  );
});

test('convierte un prompt histórico sensible en referencia provider-safe', () => {
  const original = [
    'Drama histórico bíblico de tono sobrio.',
    'La violencia se sugiere; nunca mostrar heridas explícitas, clavos ni sangre.',
    'Historical setting: Jerusalén del siglo I al atardecer.',
    'Narrative action for this frame: el centurión escucha en silencio.',
    'Camera direction: plano medio con profundidad natural.',
    'No text, subtitles, captions, logos or watermarks.',
    'Negative constraints: gore, blood emphasis, crucifixion, deformed anatomy.'
  ].join(' ');

  const safe = buildProviderSafeImagePrompt(original);

  assert.match(safe, /historical cinematic still suitable for a general audience/i);
  assert.match(safe, /Jerusalén del siglo I/i);
  assert.match(safe, /centurión escucha en silencio/i);
  assert.match(safe, /plano medio/i);
  assert.doesNotMatch(
    safe,
    /crucif|condenad|herid|sangr|clav|espin|tortur|ejecut|muert|gore|violenc|blood|injur|wound|nail|thorn|death|kill/i
  );
});

test('si todo el contenido narrativo es sensible conserva un prompt neutro utilizable', () => {
  const safe = buildProviderSafeImagePrompt(
    'Crucifixión, sangre, heridas y muerte. Negative constraints: gore, blood.'
  );

  assert.match(safe, /respectful historical cinematic still/i);
  assert.match(safe, /period clothing, architecture, natural light/i);
  assert.match(safe, /Preserve character identity/i);
  assert.doesNotMatch(
    safe,
    /crucif|sangr|herid|muert|gore|blood/i
  );
});
