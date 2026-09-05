import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQualityDecision, shouldPauseForQuality } from '../lib/engine/quality-review';

const scene = { id: 'scene-1', order: 1 };
const hashes = { image: 'a'.repeat(64), voice: 'b'.repeat(64), video: 'c'.repeat(64) };

test('la puerta estricta aprueba únicamente calidad alta sin fallos críticos', () => {
  const previous = process.env.SCENE_QUALITY_MIN_SCORE;
  process.env.SCENE_QUALITY_MIN_SCORE = '9';
  try {
    const report = buildQualityDecision({
      projectId: 'project-1',
      scene,
      attempt: 1,
      model: 'quality-test',
      contactSheetAsset: 'quality/scene-001.jpg',
      assetHashes: hashes,
      review: {
        scores: {
          narrativeAlignment: 9.4,
          characterContinuity: 9.2,
          visualQuality: 9.1,
          composition: 9,
          motionConsistency: 8.9,
          professionalReadiness: 9.4
        },
        criticalFailure: false,
        issues: [],
        strengths: ['Continuidad sólida'],
        correctionPrompt: ''
      }
    });
    assert.equal(report.passed, true);
    assert.ok(report.overallScore >= 9);
    assert.equal(report.version, 3);
  } finally {
    restore('SCENE_QUALITY_MIN_SCORE', previous);
  }
});

test('la evaluación identifica de forma independiente la toma revisada', () => {
  const report = buildQualityDecision({
    projectId: 'project-1',
    scene,
    shot: { id: 'shot-2', order: 2 },
    attempt: 1,
    model: 'quality-test',
    contactSheetAsset: 'quality/scene-001-shot-02.jpg',
    assetHashes: hashes,
    review: {
      scores: {
        narrativeAlignment: 9,
        characterContinuity: 9,
        visualQuality: 9,
        composition: 9,
        motionConsistency: 9,
        professionalReadiness: 9
      },
      criticalFailure: false,
      issues: [],
      strengths: ['Movimiento continuo'],
      correctionPrompt: ''
    }
  });
  assert.equal(report.shotId, 'shot-2');
  assert.equal(report.shotOrder, 2);
  assert.equal(report.passed, true);
});

test('una categoría deficiente o un fallo crítico detiene la escena', () => {
  const previous = process.env.SCENE_QUALITY_MIN_SCORE;
  process.env.SCENE_QUALITY_MIN_SCORE = '9';
  try {
    const report = buildQualityDecision({
      projectId: 'project-1',
      scene,
      attempt: 3,
      model: 'quality-test',
      contactSheetAsset: 'quality/scene-001.jpg',
      assetHashes: hashes,
      review: {
        scores: {
          narrativeAlignment: 10,
          characterContinuity: 7.9,
          visualQuality: 10,
          composition: 10,
          motionConsistency: 10,
          professionalReadiness: 10
        },
        criticalFailure: false,
        issues: ['La identidad del personaje cambia.'],
        strengths: [],
        correctionPrompt: 'Conservar exactamente la identidad facial de la referencia.'
      }
    });
    assert.equal(report.passed, false);
    assert.equal(report.attempt, 3);
    assert.equal(report.correctionPrompt.length > 0, true);
  } finally {
    restore('SCENE_QUALITY_MIN_SCORE', previous);
  }
});

test('el modo automatico acepta una nota baja si no existe un fallo critico', () => {
  const previous = process.env.SCENE_QUALITY_POLICY;
  process.env.SCENE_QUALITY_POLICY = 'critical-only';
  try {
    assert.equal(shouldPauseForQuality({ passed: false, criticalFailure: false }), false);
    assert.equal(shouldPauseForQuality({ passed: false, criticalFailure: true }), true);
    assert.equal(shouldPauseForQuality({ passed: true, criticalFailure: false }), false);
  } finally {
    restore('SCENE_QUALITY_POLICY', previous);
  }
});

test('el modo estricto conserva la pausa ante cualquier rechazo de calidad', () => {
  const previous = process.env.SCENE_QUALITY_POLICY;
  process.env.SCENE_QUALITY_POLICY = 'strict';
  try {
    assert.equal(shouldPauseForQuality({ passed: false, criticalFailure: false }), true);
  } finally {
    restore('SCENE_QUALITY_POLICY', previous);
  }
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
