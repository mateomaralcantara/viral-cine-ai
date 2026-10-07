import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SCENE4_NARRATION_V6 } from '@/lib/engine/scene4-montage-plan-v6';
import {
  SCENE4_VISIBLE_LIPSYNC_SEGMENTS_V6,
  SCENE4_VISIBLE_LIPSYNC_SECONDS_V6,
  SCENE4_VISIBLE_LIPSYNC_MAX_USD_V6,
  validateScene4VisibleLipSyncPlanV6
} from '@/lib/engine/scene4-visible-lipsync-plan-v6';

test('Escena 4 visible lip-sync conserva exactamente la narración aprobada', () => {
  const result = validateScene4VisibleLipSyncPlanV6();
  assert.equal(result.narration, SCENE4_NARRATION_V6);
  assert.equal(
    SCENE4_VISIBLE_LIPSYNC_SEGMENTS_V6.map((item) => item.text).join(' '),
    SCENE4_NARRATION_V6
  );
});

test('Escena 4 WAN 3.0 limita gasto a T1-T2', () => {
  assert.deepEqual(
    SCENE4_VISIBLE_LIPSYNC_SEGMENTS_V6.map((item) => item.order),
    [1, 2]
  );
  assert.equal(SCENE4_VISIBLE_LIPSYNC_SECONDS_V6, 12);
  assert.equal(SCENE4_VISIBLE_LIPSYNC_MAX_USD_V6, 1.21);
});

test('Escena 4 WAN 3.0 no contiene ruta Fal', async () => {
  const source = await readFile(
    new URL('../scripts/lipsync-scene4-v6.ts', import.meta.url),
    'utf8'
  );

  assert.doesNotMatch(source, /providers\/fal-media/);
  assert.doesNotMatch(source, /applyAudioFirstLipSync/);
  assert.match(source, /generateRunwayWan3AudioReferenceFromEnvironment/);
  assert.match(source, /delete process\.env\.FAL_KEY/);
});
