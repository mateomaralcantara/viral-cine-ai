import test from 'node:test';
import assert from 'node:assert/strict';
import { listenVerdict, wordMatch } from '../lib/v7/qa/listen-check';

test('Agente de Escucha: detecta frases ininteligibles', () => {
  const line = 'Si Dios existe... voy a pedirle que te deje conmigo.';
  assert.equal(wordMatch(line, 'Si Dios existe, voy a pedirle que te deje conmigo'), 1);
  const bad = wordMatch(line, 'Si Dios existe [demelación de entimesio]');
  assert.ok(bad < 0.5);
  assert.equal(listenVerdict(bad), 'NO SE ENTIENDE');
  assert.equal(listenVerdict(0.9), 'SE ENTIENDE');
});
