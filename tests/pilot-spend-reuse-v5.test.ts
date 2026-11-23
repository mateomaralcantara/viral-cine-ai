import test from 'node:test';
import assert from 'node:assert/strict';
import type { FilmShot } from '../lib/domain/schemas';
import { estimatePilotShotSpend } from '../lib/engine/pilot';

function shot(overrides: Partial<FilmShot> = {}): FilmShot {
  return {
    id: 'pilot-15d-01',
    order: 1,
    title: 'La moneda',
    durationSeconds: 6,
    visualPrompt: 'test',
    camera: 'sin cortes',
    spokenText: '',
    dialogueLines: [],
    mode: 'video',
    characterIds: [],
    status: 'pending',
    ...overrides
  } as FilmShot;
}

test('resume seguro no vuelve a estimar la imagen V2 ya generada', () => {
  const fresh = estimatePilotShotSpend(
    shot({ imageAsset: undefined, qualityForceRegenerate: true })
  );
  const reused = estimatePilotShotSpend(
    shot({
      imageAsset: 'images/scene-001-shot-01.png',
      qualityForceRegenerate: false
    })
  );

  assert.ok(fresh > reused);
  assert.equal(
    Math.round((fresh - reused) * 100) / 100,
    0.08
  );
});
