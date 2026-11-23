import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createPlaceholderImage,
  renderCinematicStillVideo
} from '../lib/media/ffmpeg';
import {
  assertCinematicVideoTrack,
  probeVideo
} from '../lib/media/probe';

test('fallback local acepta micro-turno segmentado de 0.36s', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'viralcine-short-turn-'));
  try {
    const image = path.join(root, 'reference.png');
    const video = path.join(root, 'turn.mp4');

    await createPlaceholderImage(
      'Micro turno',
      'Prueba de fallback local',
      image,
      { aspectRatio: '16:9' } as any
    );

    await renderCinematicStillVideo(image, 0.36, video, '16:9');
    const probe = await probeVideo(video);

    assert.equal(probe.hasVideo, true);
    assert.ok(probe.durationSeconds >= 0.32);
    await assertCinematicVideoTrack(video, 0.36);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
