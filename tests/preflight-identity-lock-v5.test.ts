import test from 'node:test';
import assert from 'node:assert/strict';
import type { FilmProject } from '../lib/domain/schemas';
import {
  assertIdentityLocksReady,
  getIdentityLockStatus
} from '../lib/engine/preflight-identity-check';

function projectWith(entry: Record<string, unknown>): FilmProject {
  return {
    plan: {
      characters: [
        {
          id: 'elena',
          referenceAsset: 'uploads/elena-face.png'
        }
      ],
      realMotion: {
        characterBible: [
          {
            characterId: 'elena',
            name: 'Elena',
            ...entry
          }
        ]
      }
    }
  } as unknown as FilmProject;
}

test('Identity Lock 5.1 conserva la aprobación facial legacy y exige BODY MASTER', () => {
  const project = projectWith({
    identityApproved: true
  });

  const status = getIdentityLockStatus(project);

  assert.equal(status.items[0]?.faceApproved, true);
  assert.equal(status.items[0]?.hasFaceReference, true);
  assert.equal(status.items[0]?.hasBodyReference, false);
  assert.equal(status.ready, false);
  assert.throws(
    () => assertIdentityLocksReady(project),
    /falta BODY MASTER/
  );
});

test('Identity Lock 5.1 queda listo con FACE + BODY aprobados', () => {
  const project = projectWith({
    faceApproved: true,
    bodyReferenceAsset: 'uploads/elena-body.png',
    bodyApproved: true
  });

  const status = getIdentityLockStatus(project);

  assert.equal(status.approved, 1);
  assert.equal(status.required, 1);
  assert.equal(status.ready, true);
  assert.doesNotThrow(() => assertIdentityLocksReady(project));
});
