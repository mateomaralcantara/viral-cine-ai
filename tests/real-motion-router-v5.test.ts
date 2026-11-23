import test from 'node:test';
import assert from 'node:assert/strict';
import type { RealMotionShotSpec } from '../lib/domain/schemas';
import {
  BillingRiskError,
  RealMotionCircuitBreaker,
  SafeFailoverError,
  generateWithRealMotionRouter,
  type RealMotionProviderAdapter
} from '../lib/engine/real-motion-router-v5';

const spec: RealMotionShotSpec = {
  version: '5.0-real-motion-v1',
  intention: 'Prueba de movimiento humano creíble.',
  startState: 'Persona quieta antes de comenzar a caminar.',
  endState: 'Persona termina dos pasos más adelante.',
  bodyMotion: 'Camina con transferencia de peso natural.',
  environmentMotion: 'Tela y luz ambiental cambian sutilmente.',
  cameraMotion: 'Travelling lateral suave y continuo.',
  shotClass: 'standard',
  preferredProviders: ['veo', 'fal-video'],
  minMotionScore: 8,
  minIdentityScore: 9,
  minContinuityScore: 8,
  minAnatomyScore: 8,
  minCameraScore: 8,
  allowStillFallbackFinal: false
};

function request() {
  return {
    projectId: 'project',
    shotId: 'shot',
    referenceImagePath: 'ref.png',
    prompt: 'Real motion',
    durationSeconds: 6,
    aspectRatio: '16:9' as const,
    outputPath: 'out.mp4',
    motionSpec: spec
  };
}

test('router cambia de Veo a Fal solo cuando el fallo es seguro para failover', async () => {
  const calls: string[] = [];
  const adapters: RealMotionProviderAdapter[] = [
    {
      id: 'veo',
      available: () => true,
      generate: async () => {
        calls.push('veo');
        throw new SafeFailoverError('quota', 'veo', 'quota');
      }
    },
    {
      id: 'fal-video',
      available: () => true,
      generate: async () => {
        calls.push('fal-video');
        return { outputPath: 'out.mp4', model: 'test-model' };
      }
    }
  ];

  const result = await generateWithRealMotionRouter({
    request: request(),
    adapters,
    providerOrder: ['veo', 'fal-video'],
    circuitBreaker: new RealMotionCircuitBreaker(3, 900)
  });

  assert.deepEqual(calls, ['veo', 'fal-video']);
  assert.equal(result.provider, 'fal-video');
  assert.equal(result.attempt, 2);
});

test('router no duplica gasto cuando el estado de cobro es desconocido', async () => {
  const adapters: RealMotionProviderAdapter[] = [
    {
      id: 'veo',
      available: () => true,
      generate: async () => {
        throw new Error('fallo ambiguo');
      }
    },
    {
      id: 'fal-video',
      available: () => true,
      generate: async () => ({ outputPath: 'out.mp4' })
    }
  ];

  await assert.rejects(
    () => generateWithRealMotionRouter({
      request: request(),
      adapters,
      providerOrder: ['veo', 'fal-video'],
      circuitBreaker: new RealMotionCircuitBreaker(3, 900)
    }),
    BillingRiskError
  );
});

test('circuit breaker abre después de tres fallos seguros', () => {
  const breaker = new RealMotionCircuitBreaker(3, 900);
  breaker.safeFailure('veo', 1000);
  breaker.safeFailure('veo', 1001);
  assert.equal(breaker.canUse('veo', 1002), true);
  breaker.safeFailure('veo', 1003);
  assert.equal(breaker.canUse('veo', 1004), false);
  assert.equal(breaker.canUse('veo', 1003 + 901000), true);
});
