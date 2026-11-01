import assert from 'node:assert/strict';
import test from 'node:test';
import {
  grokLiteImageToVideoCredits
} from '@/lib/providers/runway-router-v6';

test('Grok Lite image-to-video 8s 720p cuesta 25 creditos', () => {
  assert.equal(
    grokLiteImageToVideoCredits(8, 'auto_720p'),
    25
  );
});

test('Grok Lite image-to-video 8s 480p cuesta 17 creditos', () => {
  assert.equal(
    grokLiteImageToVideoCredits(8, 'auto_480p'),
    17
  );
});
