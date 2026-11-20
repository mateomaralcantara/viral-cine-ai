import test from 'node:test';
import assert from 'node:assert/strict';
import { doctorPrompt, validDoctorOutput } from '../lib/v7/qa/prompt-doctor';
import { FILTERED_PATTERN } from '../lib/v7/production/scene-veo-engine';

test('médico de textos: conserva el diálogo exacto y explica el bloqueo', () => {
  const p = doctorPrompt({ prompt: 'Primer plano de Martin. Martin dice en español: «Ninguna». Sin subtítulos ni texto en pantalla.', kind: 'bloqueada', problem: 'filtered out', line: 'Ninguna', onCamera: true, attempt: 2 });
  assert.match(p, /BLOQUEÓ/); assert.match(p, /«Ninguna»/); assert.match(p, /a fondo/);
  assert.equal(validDoctorOutput('Plano corto de Martin junto a la ventana de una habitación en penumbra azul.', { line: 'Ninguna', onCamera: true }), null, 'sin la frase no vale');
  const ok = validDoctorOutput('Plano corto de Martin junto a la ventana en penumbra azul; dice en español: «Ninguna».', { line: 'Ninguna', onCamera: true });
  assert.ok(ok && ok.endsWith('Sin subtítulos ni texto en pantalla.'));
});

test('un bloqueo del filtro de Google se reconoce como no cobrado', () => {
  assert.ok(FILTERED_PATTERN.test("1 videos were filtered out because they violated Vertex AI's usage guidelines. You will not be charged for blocked videos."));
  assert.ok(!FILTERED_PATTERN.test('Internal error'));
});
