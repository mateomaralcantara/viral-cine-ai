import test from 'node:test';
import assert from 'node:assert/strict';
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

test('Escena 4 visible lip-sync limita gasto a T1-T2', () => {
  assert.deepEqual(
    SCENE4_VISIBLE_LIPSYNC_SEGMENTS_V6.map((item) => item.order),
    [1, 2]
  );
  assert.equal(SCENE4_VISIBLE_LIPSYNC_SECONDS_V6, 12);
  assert.equal(SCENE4_VISIBLE_LIPSYNC_MAX_USD_V6, 1.61);
});
