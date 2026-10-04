import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSyntheticSpeechAudio } from '../lib/media/ffmpeg';
import {
  fitAudioToSlot,
  probeMediaDurationSeconds
} from '../lib/media/segmented-ffmpeg';

test('FFmpeg comprime la narración E6/T5 de 10.542s a 8s con atempo 1.318x', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'viralcine-e6t5-audio-'));
  try {
    const input = path.join(root, 'voice.mp3');
    const output = path.join(root, 'master.wav');
    const rawSeconds = 10.542;
    const targetSeconds = 8;
    const speed = rawSeconds / targetSeconds;

    await createSyntheticSpeechAudio(rawSeconds, input);
    await fitAudioToSlot(input, speed, targetSeconds, output);

    const duration = await probeMediaDurationSeconds(output);
    assert.ok(Math.abs(duration - targetSeconds) <= 0.08);
    assert.ok(speed > 1.25);
    assert.ok(speed <= 1.33);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
