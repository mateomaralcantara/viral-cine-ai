import { SCENE4_NARRATION_V6 } from '@/lib/engine/scene4-montage-plan-v6';

export const SCENE4_VISIBLE_LIPSYNC_SEGMENTS_V6 = [
  {
    order: 1,
    text: 'No fue magia. Fueron quince días'
  },
  {
    order: 2,
    text: 'levantándome, escribiendo y volviendo a intentarlo.'
  }
] as const;

export const SCENE4_VISIBLE_LIPSYNC_SECONDS_V6 = 12;
export const SCENE4_VISIBLE_LIPSYNC_MAX_USD_V6 = 1.21;

export function validateScene4VisibleLipSyncPlanV6() {
  const rebuilt = SCENE4_VISIBLE_LIPSYNC_SEGMENTS_V6
    .map((item) => item.text)
    .join(' ');

  if (rebuilt !== SCENE4_NARRATION_V6) {
    throw new Error(
      'El plan de lip-sync de Escena 4 no conserva exactamente la narración aprobada.'
    );
  }

  if (
    SCENE4_VISIBLE_LIPSYNC_SEGMENTS_V6.some(
      (item) => item.order < 1 || item.order > 5
    )
  ) {
    throw new Error('El plan de lip-sync apunta a una toma inexistente.');
  }

  return {
    narration: rebuilt,
    speakingShots: SCENE4_VISIBLE_LIPSYNC_SEGMENTS_V6.length,
    visibleLipSyncSeconds: SCENE4_VISIBLE_LIPSYNC_SECONDS_V6,
    maxUsd: SCENE4_VISIBLE_LIPSYNC_MAX_USD_V6
  };
}
