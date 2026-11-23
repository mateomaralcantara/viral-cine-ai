import test from 'node:test';
import assert from 'node:assert/strict';
import type { FilmProject } from '../lib/domain/schemas';
import {
  applyFifteenDaysPilotRoutingLocks,
  assertPilotRoutingLocksReady,
  getPilotRoutingLockStatus
} from '../lib/engine/pilot-routing-lock-v5';

function project(): FilmProject {
  return {
    plan: {
      realMotion: {
        pilotShotIds: ['pilot-15d-01']
      },
      scenes: [{
        shots: [{
          id: 'pilot-15d-01',
          title: 'La moneda',
          characterIds: ['char-v5-elena-0001'],
          motionSpec: {
            version: '5.0-real-motion-v1',
            intention: 'Test filmable de movimiento real',
            startState: 'Inicio suficientemente descrito',
            endState: 'Final suficientemente descrito',
            bodyMotion: 'Movimiento corporal natural y continuo',
            environmentMotion: 'Entorno con movimiento sutil y realista',
            cameraMotion: 'Ascenso de cámara físico y continuo',
            shotClass: 'hero',
            preferredProviders: ['runway', 'seedance'],
            minMotionScore: 8,
            minIdentityScore: 9,
            minContinuityScore: 8,
            minAnatomyScore: 9,
            minCameraScore: 8,
            allowStillFallbackFinal: false
          }
        }]
      }]
    }
  } as unknown as FilmProject;
}

test('Routing Lock detecta ruta no aprobada', () => {
  const value = project();
  const status = getPilotRoutingLockStatus(value);

  assert.equal(status.total, 1);
  assert.equal(status.readyCount, 0);
  assert.equal(status.ready, false);
  assert.throws(
    () => assertPilotRoutingLocksReady(value),
    /PILOT ROUTING LOCK INCOMPLETO/
  );
});

test('Routing Lock fija Veo -> Fal para la toma 1', () => {
  const value = project();
  const applied = applyFifteenDaysPilotRoutingLocks(value);
  const status = getPilotRoutingLockStatus(value);

  assert.equal(applied, 1);
  assert.deepEqual(
    value.plan?.scenes[0]?.shots[0]?.motionSpec?.preferredProviders,
    ['veo', 'fal-video']
  );
  assert.equal(status.readyCount, 1);
  assert.equal(status.ready, true);
  assert.doesNotThrow(() => assertPilotRoutingLocksReady(value));
});
