import test from 'node:test';
import assert from 'node:assert/strict';
import { planSegmentedAudioTiming } from '../lib/engine/segmented-timing-v4';

test('E1/T7 redistribuye solo el tiempo necesario y reproduce el ajuste aprobado', () => {
  const result = planSegmentedAudioTiming([
    { id: 'narrador', index: 1, slotDurationSeconds: 2.333, audioDurationSeconds: 1.393 },
    { id: 'pilato', index: 2, slotDurationSeconds: 3.734, audioDurationSeconds: 3.204 },
    { id: 'multitud', index: 3, slotDurationSeconds: 0.933, audioDurationSeconds: 2.043 }
  ], 7, 1.2);

  assert.equal(result.length, 3);
  assert.ok(Math.abs(result[0].targetDurationSeconds - 2.333) < 0.003);
  assert.ok(result[1].speedFactor > 1.07 && result[1].speedFactor < 1.10);
  assert.ok(Math.abs(result[2].speedFactor - 1.2) < 0.003);
  assert.ok(Math.abs(result[2].startSeconds - 5.2975) < 0.01);
  assert.ok(Math.abs(result[2].endSeconds - 7) < 0.003);
});

test('audio que ya cabe conserva sus slots y no se ralentiza', () => {
  const result = planSegmentedAudioTiming([
    { id: 'a', index: 1, slotDurationSeconds: 2, audioDurationSeconds: 1 },
    { id: 'b', index: 2, slotDurationSeconds: 3, audioDurationSeconds: 2 }
  ], 5);
  assert.equal(result[0].speedFactor, 1);
  assert.equal(result[1].speedFactor, 1);
  assert.ok(Math.abs(result[0].targetDurationSeconds - 2) < 0.001);
  assert.ok(Math.abs(result[1].targetDurationSeconds - 3) < 0.001);
});

test('bloquea una toma que no cabe ni usando el máximo 1.2x', () => {
  assert.throws(
    () => planSegmentedAudioTiming([
      { id: 'a', index: 1, slotDurationSeconds: 3.5, audioDurationSeconds: 5 },
      { id: 'b', index: 2, slotDurationSeconds: 3.5, audioDurationSeconds: 5 }
    ], 7, 1.2),
    /no cabe|faltan/i
  );
});
