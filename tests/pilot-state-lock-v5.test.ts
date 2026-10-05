import test from 'node:test';
import assert from 'node:assert/strict';
import type { FilmProject } from '../lib/domain/schemas';
import {
  applyFifteenDaysPilotStateLocks,
  assertPilotStateLocksReady,
  getPilotStateLockStatus
} from '../lib/engine/pilot-state-lock-v5';

function project(): FilmProject {
  return {
    plan: {
      realMotion: {
        pilotShotIds: ['pilot-15d-01'],
        characterBible: [{
          characterId: 'char-v5-elena-0001',
          name: 'Elena',
          states: [{
            id: 'elena-b-street',
            label: 'Calle'
          }]
        }]
      },
      scenes: [{
        shots: [{
          id: 'pilot-15d-01',
          title: 'La moneda',
          characterIds: ['char-v5-elena-0001'],
          characterStateIds: {}
        }]
      }]
    }
  } as unknown as FilmProject;
}

test('State Lock detecta toma sin estado asociado', () => {
  const value = project();
  const status = getPilotStateLockStatus(value);

  assert.equal(status.total, 1);
  assert.equal(status.readyCount, 0);
  assert.equal(status.ready, false);
  assert.throws(
    () => assertPilotStateLocksReady(value),
    /PILOT STATE LOCK INCOMPLETO/
  );
});

test('State Lock aplica el estado Calle a la toma 1', () => {
  const value = project();
  const applied = applyFifteenDaysPilotStateLocks(value);
  const status = getPilotStateLockStatus(value);

  assert.equal(applied, 1);
  assert.equal(
    value.plan?.scenes[0]?.shots[0]?.characterStateIds?.['char-v5-elena-0001'],
    'elena-b-street'
  );
  assert.equal(status.readyCount, 1);
  assert.equal(status.ready, true);
  assert.doesNotThrow(() => assertPilotStateLocksReady(value));
});
