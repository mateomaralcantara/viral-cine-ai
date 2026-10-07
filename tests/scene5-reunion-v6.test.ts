import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  assert.equal(result.maxTotalUsd, 2.13);

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

  assert.equal(SCENE5_SAFE_MAX_USD_V6, 2.13);
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


test('productor Escena 5 permanece WAN/Runway-only y con tope US$2.13', async () => {
  const producer = await readFile(
    new URL('../lib/engine/scene5-reunion-producer-v6.ts', import.meta.url),
    'utf8'
  );
  const command = await readFile(
    new URL('../scripts/generate-scene5-v6.ts', import.meta.url),
    'utf8'
  );

  assert.doesNotMatch(producer, /providers\/fal-media/);
  assert.doesNotMatch(producer, /applyAudioFirstLipSync/);
  assert.match(producer, /generateRunwayWan3AudioReferenceFromEnvironment/);
  assert.match(producer, /generateRunwayGrokLiteFromEnvironment/);
  assert.match(command, /--confirm-scene5-usd-2\.13/);
  assert.match(command, /Fal\.ai: PROHIBIDO \/ NO USADO/);
});


test('productor Escena 5 normaliza speaker reference a 9:16 antes de WAN', async () => {
  const producer = await readFile(
    new URL('../lib/engine/scene5-reunion-producer-v6.ts', import.meta.url),
    'utf8'
  );

  assert.match(producer, /normalizeReferenceImage/);
  assert.match(producer, /'-wan-safe-9x16\.png'/);
  assert.match(
    producer,
    /normalizeReferenceImage\([\s\S]*speakerSourceRef[\s\S]*speakerRef[\s\S]*'9:16'/
  );
  assert.match(producer, /runway-request-rejected-no-task/);
});


test('productor Escena 5 aplica tope acumulado entre reanudaciones', async () => {
  const producer = await readFile(
    new URL('../lib/engine/scene5-reunion-producer-v6.ts', import.meta.url),
    'utf8'
  );

  assert.match(producer, /readSpendLedger/);
  assert.match(producer, /SAFE CUMULATIVE COST GATE E5/);
  assert.match(producer, /SCENE5_SAFE_MAX_USD_V6/);
});


test('fix de Mateo E5 reemplaza solo audio local en T3/T5', async () => {
  const fixer = await readFile(
    new URL('../scripts/fix-scene5-mateo-child-voice-v6.ts', import.meta.url),
    'utf8'
  );

  assert.match(fixer, /replaceAudioPreserveVideo/);
  assert.match(fixer, /scene-005-shot-03-master\.wav/);
  assert.match(fixer, /scene-005-shot-05-master\.wav/);
  assert.match(fixer, /Gasto nuevo: US\$0/);
  assert.doesNotMatch(fixer, /generateRunway/);
  assert.doesNotMatch(fixer, /generateSpeech/);
  assert.doesNotMatch(fixer, /fal-media/);
});
