import test from 'node:test';
import assert from 'node:assert/strict';
import type { FilmProject } from '@/lib/domain/schemas';
import { buildFifteenDaysShortPlanV5 } from '@/lib/production-presets/fifteen-days-short-v5';
import { applyFifteenDaysCoreVoiceLocksV5 } from '@/lib/engine/fifteen-days-voice-lock-v5';
import {
  planScene3SynchronizedV6,
  validateScene3SynchronizedV6,
  SCENE3_DIALOGUE_V6,
  SCENE3_MARIANA_ID_V6
} from '@/lib/engine/scene3-sync-plan-v6';
import { grok15AudioDrivenCredits, wan3VideoCredits } from '@/lib/providers/runway-router-v6';
import { decideLipSync } from '@/lib/engine/lip-sync-policy-v4';

function fixture(): FilmProject {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z',
    status: 'ready',
    input: {
      title: '15 DÍAS',
      premise: 'Una historia de reconstrucción personal contada en un cortometraje.',
      durationMinutes: 2.5,
      genre: 'Drama',
      audience: 'Adulto',
      visualStyle: 'Cine realista',
      language: 'es',
      aspectRatio: '16:9',
      budgetUsd: 20,
      burnSubtitles: false,
      generateMusic: false
    },
    plan: buildFifteenDaysShortPlanV5(),
    progress: {
      phase: 'ready',
      percent: 30,
      message: 'Test',
      updatedAt: '2026-10-07T00:00:00.000Z'
    },
    productionLog: []
  } as FilmProject;
}

test('Escena 3 V6 se planifica en setup, diálogo audio-driven y reacción', () => {
  const project = fixture();
  const scene = planScene3SynchronizedV6(project);
  const plan = validateScene3SynchronizedV6(project);

  assert.equal(scene.shots.length, 3);
  assert.deepEqual(scene.shots.map((shot) => shot.durationSeconds), [8, 8, 8]);
  assert.equal(plan.durationSeconds, 24);
  assert.equal(plan.dialogueShot, 2);
  assert.equal(scene.shots[1].spokenText, SCENE3_DIALOGUE_V6);
  assert.equal(scene.shots[1].speakerId, SCENE3_MARIANA_ID_V6);
  assert.equal(scene.shots[0].spokenText, '');
  assert.equal(scene.shots[2].spokenText, '');
});

test('Mariana queda con voz OpenAI cedar y exige lip-sync individual', () => {
  const project = fixture();
  applyFifteenDaysCoreVoiceLocksV5(project);

  const mariana = project.plan!.characters.find(
    (item) => item.id === SCENE3_MARIANA_ID_V6
  );

  assert.equal(mariana?.voiceProvider, 'openai');
  assert.equal(mariana?.voiceId, 'cedar');
  assert.match(mariana?.voiceInstructions || '', /exactamente/i);
  assert.equal(
    decideLipSync(project, SCENE3_MARIANA_ID_V6).required,
    true
  );
});

test('Grok 1.5 audio-driven E3/T2 8s 720p con 1 imagen y 1 audio cuesta 130 créditos', () => {
  assert.equal(
    grok15AudioDrivenCredits(8, '720p', 1, 1),
    130
  );
});


test('WAN 3.0 E3/T2 8s 720p cuesta 80 creditos', () => {
  assert.equal(
    wan3VideoCredits(8, '1280:720'),
    80
  );
});
