import test from 'node:test';
import assert from 'node:assert/strict';
import type { FilmProject } from '../lib/domain/schemas';
import {
  armPilotShotOne,
  getPilotShotOnePreflight
} from '../lib/engine/pilot-shot-one-v5';

function project(): FilmProject {
  return {
    id: '15-dias-test',
    input: {
      budgetUsd: 45
    },
    status: 'planned',
    pilot: undefined,
    productionLog: [],
    plan: {
      characters: [{
        id: 'char-v5-elena-0001',
        name: 'Elena',
        referenceAsset: 'uploads/elena-face.png'
      }],
      realMotion: {
        pilotShotIds: ['pilot-15d-01'],
        characterBible: [{
          characterId: 'char-v5-elena-0001',
          name: 'Elena',
          identityLock: 'La misma Elena en toda la película con identidad facial estricta.',
          immutableTraits: ['rostro', 'ojos', 'piel'],
          forbiddenDrift: ['cambio de actriz'],
          masterReferenceAsset: 'uploads/elena-face.png',
          bodyReferenceAsset: 'uploads/elena-body.png',
          faceApproved: true,
          bodyApproved: true,
          states: [{
            id: 'elena-b-street',
            label: 'Calle',
            narrativeStage: 'Etapa de calle',
            appearance: 'Mismo rostro con cansancio natural y cabello menos cuidado.',
            wardrobe: 'Chaqueta gris desgastada y camiseta azul apagada.',
            physicalCondition: 'Fatiga moderada',
            performanceNotes: 'Contenida y observadora'
          }]
        }]
      },
      scenes: [{
        order: 1,
        shots: [{
          id: 'pilot-15d-01',
          order: 1,
          title: 'La moneda',
          durationSeconds: 6,
          visualPrompt: 'Elena recoge una moneda en una calle mojada.',
          camera: 'Plano detalle bajo y ascenso suave, sin cortes.',
          spokenText: '',
          dialogueLines: [],
          mode: 'video',
          characterIds: ['char-v5-elena-0001'],
          characterStateIds: {
            'char-v5-elena-0001': 'elena-b-street'
          },
          motionSpec: {
            version: '5.0-real-motion-v1',
            intention: 'Presentar a Elena desde una acción mínima.',
            startState: 'Moneda junto al bordillo.',
            endState: 'Elena se incorpora lentamente.',
            bodyMotion: 'Flexión natural de rodillas y torso.',
            environmentMotion: 'Gotas y reflejos de tráfico.',
            cameraMotion: 'Ascenso suave y continuo.',
            shotClass: 'hero',
            preferredProviders: ['veo', 'fal-video'],
            minMotionScore: 8,
            minIdentityScore: 9,
            minContinuityScore: 8,
            minAnatomyScore: 9,
            minCameraScore: 8,
            allowStillFallbackFinal: false
          },
          status: 'pending'
        }]
      }]
    }
  } as unknown as FilmProject;
}

function withPaidEnv(work: () => void) {
  const names = [
    'PRODUCTION_MODE',
    'ALLOW_EXTERNAL_API_CALLS',
    'ALLOW_PAID_GENERATION',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'FAL_KEY'
  ] as const;
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]])
  );

  process.env.PRODUCTION_MODE = 'real';
  process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
  process.env.ALLOW_PAID_GENERATION = 'true';
  process.env.OPENAI_API_KEY = 'sk-test-openai-123456789';
  process.env.GEMINI_API_KEY = 'AIza-test-gemini-123456789';
  delete process.env.FAL_KEY;

  try {
    work();
  } finally {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test('Toma 1 queda lista cuando todos los locks y credenciales están presentes', () => {
  withPaidEnv(() => {
    const value = project();
    const preflight = getPilotShotOnePreflight(value);

    assert.equal(preflight.ready, true);
    assert.equal(preflight.primaryProvider, 'veo');
    assert.equal(preflight.fallbackProvider, 'fal-video');
    assert.ok(preflight.estimatedUsd > 0);
    assert.ok(preflight.hardCapUsd >= preflight.estimatedUsd);
  });
});

test('Armar Toma 1 limita el proyecto a una sola escena y una sola toma', () => {
  withPaidEnv(() => {
    const value = project();
    const preflight = armPilotShotOne(value);

    assert.equal(value.pilot?.enabled, true);
    assert.equal(value.pilot?.maxScenes, 1);
    assert.equal(value.pilot?.maxShotsPerScene, 1);
    assert.equal(value.pilot?.maxSpendUsd, preflight.hardCapUsd);
    assert.equal(value.pilot?.approvedForFullProduction, false);
  });
});

test('OFFLINE SEGURO bloquea el armado pagado sin alterar el proyecto', () => {
  const previous = process.env.PRODUCTION_MODE;
  process.env.PRODUCTION_MODE = 'demo';

  try {
    const value = project();
    const preflight = getPilotShotOnePreflight(value);

    assert.equal(preflight.safetyReady, false);
    assert.equal(preflight.ready, false);
    assert.throws(
      () => armPilotShotOne(value),
      /TOMA 1 NO AUTORIZADA/
    );
    assert.equal(value.pilot, undefined);
  } finally {
    if (previous === undefined) delete process.env.PRODUCTION_MODE;
    else process.env.PRODUCTION_MODE = previous;
  }
});
