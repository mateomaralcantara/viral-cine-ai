import test from 'node:test';
import assert from 'node:assert/strict';
import type { RealMotionShotSpec } from '../lib/domain/schemas';
import { assessRealMotionQuality } from '../lib/engine/real-motion-quality-v5';

const spec: RealMotionShotSpec = {
  version: '5.0-real-motion-v1',
  intention: 'Actuación humana real.',
  startState: 'Inicio.',
  endState: 'Final.',
  bodyMotion: 'Movimiento corporal.',
  environmentMotion: 'Movimiento ambiental.',
  cameraMotion: 'Movimiento de cámara.',
  shotClass: 'hero',
  preferredProviders: ['veo', 'fal-video'],
  minMotionScore: 8,
  minIdentityScore: 9,
  minContinuityScore: 8,
  minAnatomyScore: 8,
  minCameraScore: 8,
  allowStillFallbackFinal: false
};

test('quality gate aprueba video generativo real que supera todos los umbrales', () => {
  const result = assessRealMotionQuality({
    provider: 'veo',
    hasVideo: true,
    durationSeconds: 6.02,
    expectedDurationSeconds: 6,
    motionScore: 8.8,
    identityScore: 9.4,
    continuityScore: 9,
    anatomyScore: 8.7,
    cameraScore: 8.6,
    frozenRatio: 0.05,
    blackFrameRatio: 0
  }, spec);

  assert.equal(result.pass, true);
  assert.equal(result.issues.length, 0);
  assert.ok(result.score >= 8.5);
});

test('quality gate rechaza still-motion aunque técnicamente tenga video', () => {
  const result = assessRealMotionQuality({
    provider: 'local-ffmpeg',
    hasVideo: true,
    durationSeconds: 6,
    expectedDurationSeconds: 6,
    motionScore: 9,
    identityScore: 10,
    continuityScore: 10,
    anatomyScore: 10,
    cameraScore: 9,
    frozenRatio: 0,
    blackFrameRatio: 0
  }, spec);

  assert.equal(result.pass, false);
  assert.match(result.issues.join(' '), /still-motion local/i);
});
