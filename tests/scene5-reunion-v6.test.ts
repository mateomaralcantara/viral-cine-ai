import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFifteenDaysShortPlanV5
} from '@/lib/production-presets/fifteen-days-short-v5';
import {
  FIFTEEN_DAYS_CORE_VOICE_LOCKS_V5
} from '@/lib/engine/fifteen-days-voice-lock-v5';
import {
  planScene5ReunionV6,
  validateScene5ReunionV6,
  SCENE5_DIALOGUE_V6,
  SCENE5_SAFE_MAX_USD_V6
} from '@/lib/engine/scene5-reunion-plan-v6';

test('Escena 5 V6 queda en 6 tomas / 30s con diálogo exacto', () => {
  const plan = buildFifteenDaysShortPlanV5();
  const project: any = {
    id: 'test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'ready',
    input: {
      title: '15 DÍAS',
      premise: 'Premisa suficientemente larga para prueba de plan escena cinco.',
      durationMinutes: 2.5,
      genre: 'Drama',
      audience: 'Adulto',
      visualStyle: 'Cine realista',
      language: 'es',
      aspectRatio: '16:9',
      budgetUsd: 20,
      burnSubtitles: false,
      generateMusic: true
    },
    plan,
    progress: {
      phase: 'test',
      percent: 60,
      totalScenes: 6,
      updatedAt: new Date().toISOString()
    },
    productionLog: []
  };

  planScene5ReunionV6(project);
  const result = validateScene5ReunionV6(project);

  assert.equal(result.shots, 6);
  assert.equal(result.durationSeconds, 30);
  assert.equal(result.dialogueShots, 4);
  assert.equal(result.silentShots, 2);
  assert.equal(result.maxTotalUsd, 2.05);

  const scene5 = project.plan.scenes.find((scene: any) => scene.order === 5);
  assert.deepEqual(
    scene5.shots
      .filter((shot: any) => shot.spokenText)
      .map((shot: any) => ({
        order: shot.order,
        speakerId: shot.speakerId,
        text: shot.spokenText
      })),
    [...SCENE5_DIALOGUE_V6]
  );
});

test('Escena 5 V6 prohíbe Fal y separa Runway silencioso de WAN hablado', () => {
  const plan = buildFifteenDaysShortPlanV5();
  const project: any = {
    id: 'test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'ready',
    input: {
      title: '15 DÍAS',
      premise: 'Premisa suficientemente larga para prueba de routing de escena cinco.',
      durationMinutes: 2.5,
      genre: 'Drama',
      audience: 'Adulto',
      visualStyle: 'Cine realista',
      language: 'es',
      aspectRatio: '16:9',
      budgetUsd: 20,
      burnSubtitles: false,
      generateMusic: true
    },
    plan,
    progress: {
      phase: 'test',
      percent: 60,
      totalScenes: 6,
      updatedAt: new Date().toISOString()
    },
    productionLog: []
  };

  planScene5ReunionV6(project);
  validateScene5ReunionV6(project);

  const scene5 = project.plan.scenes.find((scene: any) => scene.order === 5);
  for (const shot of scene5.shots) {
    const providers = shot.motionSpec?.preferredProviders || [];
    assert.equal(providers.includes('fal-video'), false);
    if (shot.spokenText) {
      assert.equal(providers[0], 'wan');
    } else {
      assert.equal(providers[0], 'runway');
    }
  }

  assert.equal(SCENE5_SAFE_MAX_USD_V6, 2.05);
});

test('Voice Lock 5.1 incluye voces infantiles candidatas para Mateo y Sofía', () => {
  const mateo = FIFTEEN_DAYS_CORE_VOICE_LOCKS_V5.find(
    (item) => item.id === 'char-v5-mateo-0005'
  );
  const sofia = FIFTEEN_DAYS_CORE_VOICE_LOCKS_V5.find(
    (item) => item.id === 'char-v5-sofia-0004'
  );

  assert.equal(mateo?.provider, 'openai');
  assert.equal(mateo?.voiceId, 'ash');
  assert.match(mateo?.instructions || '', /niño latino de 7 años/i);

  assert.equal(sofia?.provider, 'openai');
  assert.equal(sofia?.voiceId, 'coral');
  assert.match(sofia?.instructions || '', /niña latina de 10 años/i);
});
