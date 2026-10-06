import test from 'node:test';
import assert from 'node:assert/strict';
import type { FilmProject } from '../lib/domain/schemas';
import { preparePilotShotOneRetry } from '../lib/engine/pilot-shot-one-v5';
import { assertShotGenerationAllowed } from '../lib/engine/spend-guard';

function project(): FilmProject {
  return {
    id: 'retry-shot-one',
    status: 'quality-review',
    input: { budgetUsd: 45 },
    productionLog: [],
    pilot: {
      enabled: true,
      maxScenes: 1,
      maxShotsPerScene: 1,
      maxSpendUsd: 0.97,
      approvedForFullProduction: false
    },
    plan: {
      characters: [],
      realMotion: {
        pilotShotIds: ['pilot-15d-01']
      },
      scenes: [{
        id: 'scene-15d-01',
        order: 1,
        status: 'review-required',
        shots: [{
          id: 'pilot-15d-01',
          order: 1,
          title: 'La moneda',
          durationSeconds: 6,
          visualPrompt: 'Prompt v1',
          camera: 'Cámara v1 sin cortes.',
          spokenText: '',
          dialogueLines: [],
          mode: 'video',
          characterIds: ['char-v5-elena-0001'],
          characterStateIds: {
            'char-v5-elena-0001': 'elena-b-street'
          },
          motionSpec: {
            version: '5.0-real-motion-v1',
            intention: 'Intención original válida.',
            startState: 'Estado inicial original.',
            endState: 'Estado final original.',
            bodyMotion: 'Movimiento corporal original.',
            environmentMotion: 'Movimiento ambiental original.',
            cameraMotion: 'Movimiento de cámara original.',
            shotClass: 'hero',
            preferredProviders: ['veo', 'fal-video'],
            minMotionScore: 8,
            minIdentityScore: 9,
            minContinuityScore: 8,
            minAnatomyScore: 9,
            minCameraScore: 8,
            allowStillFallbackFinal: false
          },
          status: 'review-required',
          qualityScore: 5.57,
          generationCount: 1,
          estimatedSpendUsd: 0.8,
          lastGenerationState: 'succeeded'
        }]
      }]
    }
  } as unknown as FilmProject;
}

test('Corrección V2 prepara un solo segundo intento sin ejecutarlo', () => {
  const value = project();
  const result = preparePilotShotOneRetry(value, 1.93);

  assert.equal(result.shot.qualityForceRegenerate, true);
  assert.match(result.shot.visualPrompt, /moneda metálica/i);
  assert.match(result.shot.visualPrompt, /NO camina/i);
  assert.match(result.shot.camera, /moneda nítida/i);
  assert.deepEqual(
    result.shot.motionSpec?.preferredProviders,
    ['veo', 'fal-video']
  );
  assert.equal(value.pilot?.maxSpendUsd, 1.93);
  assert.equal(result.shot.generationCount, 1);
  assert.equal(result.shot.status, 'review-required');
});

test('Spend guard permite generación 2 solo cuando el retry fue preparado', () => {
  const value = project();
  const scene = value.plan!.scenes[0];
  const shot = scene.shots[0];

  preparePilotShotOneRetry(value, 1.93);

  assert.doesNotThrow(() =>
    assertShotGenerationAllowed(value, scene, shot)
  );

  shot.generationCount = 2;

  assert.throws(
    () => assertShotGenerationAllowed(value, scene, shot),
    /2 de 2 generaciones permitidas/
  );
});


test('Spend guard permite reanudar con Fal el mismo segundo intento no-cobrable', () => {
  const value = project();
  const scene = value.plan!.scenes[0];
  const shot = scene.shots[0];

  shot.qualityForceRegenerate = false;
  shot.safeFailoverResume = true;
  shot.generationCount = 1;
  shot.estimatedSpendUsd = 0.8;

  assert.doesNotThrow(() =>
    assertShotGenerationAllowed(value, scene, shot)
  );

  shot.generationCount = 2;

  assert.throws(
    () => assertShotGenerationAllowed(value, scene, shot),
    /2 de 2 generaciones permitidas/
  );
});
