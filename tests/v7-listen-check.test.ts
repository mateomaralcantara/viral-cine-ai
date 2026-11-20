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

test('quitar lo que no está en el guion: E01-P10 real', async () => {
  const { extraneousSpan } = await import('../lib/v7/qa/listen-check');
  const line = 'Si Dios existe... voy a pedirle que te deje conmigo.';
  const w = (palabra: string, inicio: number, fin: number) => ({ palabra, inicio, fin });
  const run1 = [w('Si', 0, 0.1), w('Dios', 0.1, 0.5), w('existe', 0.5, 1.1), w('y', 1.2, 1.3), w('vive', 1.3, 1.5), w('con', 1.5, 1.6), w('él', 1.6, 1.8),
    w('se', 1.8, 1.9), w('suada', 1.9, 2.4), w('voy', 2.5, 2.7), w('a', 2.7, 2.8), w('pedirle', 2.8, 3.2), w('que', 3.2, 3.4), w('te', 3.4, 3.5), w('deje', 3.5, 3.8), w('conmigo', 3.8, 4.3)];
  assert.deepEqual(extraneousSpan(line, run1), [1.1, 2.5]);
  assert.equal(extraneousSpan(line, run1.filter((x) => !['y', 'vive', 'con', 'él', 'se', 'suada'].includes(x.palabra))), null);
});
