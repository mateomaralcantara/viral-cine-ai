import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPillarboxRepairFilter,
  detectSymmetricBlackSideBars
} from '@/lib/media/pillarbox';

function makeFrame(width: number, height: number, left: number, right: number, center = 90) {
  const frame = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = left; x < width - right; x += 1) {
      frame[y * width + x] = center;
    }
  }
  return frame;
}

test('detecta pillarbox simétrico persistente', () => {
  const width = 1280;
  const height = 720;
  const frames = [
    makeFrame(width, height, 100, 100),
    makeFrame(width, height, 99, 100),
    makeFrame(width, height, 100, 99)
  ];

  const bars = detectSymmetricBlackSideBars(frames, width, height);

  assert.ok(bars);
  assert.equal(bars?.cropX, 99);
  assert.equal(bars?.cropWidth, 1082);
  assert.ok((bars?.left || 0) >= 99);
  assert.ok((bars?.right || 0) >= 99);
});

test('no trata una imagen completa como pillarbox', () => {
  const width = 1280;
  const height = 720;
  const frame = makeFrame(width, height, 0, 0);

  assert.equal(
    detectSymmetricBlackSideBars([frame], width, height),
    undefined
  );
});

test('construye filtro de reparación 16:9 sin estirar horizontalmente', () => {
  const filter = buildPillarboxRepairFilter(
    { left: 100, right: 100, cropX: 100, cropWidth: 1080 },
    1280,
    720
  );

  assert.match(filter, /crop=1080:ih:100:0/);
  assert.match(filter, /scale=1280:-2/);
  assert.match(filter, /crop=1280:720/);
  assert.doesNotMatch(filter, /scale=1280:720/);
});
