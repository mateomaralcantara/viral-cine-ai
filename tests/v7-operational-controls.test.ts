import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PermissionGrantSchema,
  RightsGrantSchema,
  ShotSchema,
  SpendEntrySchemaV7,
  VoiceProfileSchema,
  type FilmV7
} from '../lib/v7/domain';
import {
  appendSpendEntry,
  assertRetrySafe,
  summarizeSpend
} from '../lib/v7/cost/spend-ledger';
import { assertRightsReady } from '../lib/v7/security/rights-guard';
import {
  assertPermission,
  hasPermission
} from '../lib/v7/security/permission-guard';
import {
  rankProviderCandidates,
  selectProviderCandidate
} from '../lib/v7/providers/gateway/router';
import { auditVoiceContinuity } from '../lib/v7/audio/voice-continuity-auditor';
import { QAResultSchema } from '../lib/v7/qa/hierarchy';
import { rootCauseRepairPlan } from '../lib/v7/qa/root-cause';
import {
  appendTake,
  selectTake,
  selectedTake
} from '../lib/v7/production/take-service';
import {
  assertNoVersionOverwrite,
  createNextFilmVersion
} from '../lib/v7/versioning/version-manager';
import {
  addClip,
  addTrack,
  createTimeline
} from '../lib/v7/editor/timeline-engine';
import { exportTimelineAsOtioJson } from '../lib/v7/editor/otio-export';
import { calculateProductionMetrics } from '../lib/v7/metrics/production-metrics';

test('Spend Ledger V7 bloquea retry tras failed-unknown y contabiliza riesgo', () => {
  const first = SpendEntrySchemaV7.parse({
    id: 'spend-1',
    filmId: 'film-1',
    provider: 'runway',
    operation: 'video.generate',
    state: 'failed-unknown',
    estimatedUsd: 0.4,
    riskUsd: 0.4,
    idempotencyKey: 'film-1:shot-1:take-1',
    createdAt: '2026-10-08T00:00:00.000Z'
  });
  const ledger = appendSpendEntry([], first);
  assert.throws(
    () => assertRetrySafe(ledger, first.idempotencyKey),
    /V7_RETRY_BLOCKED/
  );
  assert.deepEqual(summarizeSpend(ledger), {
    succeededUsd: 0,
    reservedUsd: 0,
    unknownRiskUsd: 0.4,
    exposureUsd: 0.4
  });
});

test('Spend Ledger V7 permite reintento únicamente tras fallo confirmado sin cobro', () => {
  const entry = SpendEntrySchemaV7.parse({
    id: 'spend-2',
    filmId: 'film-1',
    provider: 'wan',
    operation: 'video.generate',
    state: 'failed-no-charge',
    estimatedUsd: 0.15,
    idempotencyKey: 'film-1:shot-2:take-1',
    createdAt: '2026-10-08T00:00:00.000Z'
  });
  const ledger = appendSpendEntry([], entry);
  assert.doesNotThrow(() => assertRetrySafe(ledger, entry.idempotencyKey));
});

test('Rights Guard bloquea una voz sin consentimiento o licencia', () => {
  const unknown = RightsGrantSchema.parse({
    id: 'rights-1',
    filmId: 'film-1',
    subjectType: 'voice',
    subjectId: 'voice-elena',
    status: 'unknown',
    territories: ['worldwide'],
    allowedUses: ['film'],
    createdAt: '2026-10-08T00:00:00.000Z'
  });
  assert.throws(
    () => assertRightsReady([unknown], [{ subjectType: 'voice', subjectId: 'voice-elena' }]),
    /V7_RIGHTS_BLOCKED/
  );

  const consented = RightsGrantSchema.parse({
    ...unknown,
    id: 'rights-2',
    status: 'consented',
    consentReference: 'consent/elena-v1',
    createdAt: '2026-10-08T00:01:00.000Z'
  });
  assert.doesNotThrow(
    () => assertRightsReady([unknown, consented], [{ subjectType: 'voice', subjectId: 'voice-elena' }])
  );
});

test('Permission Guard exige permisos explícitos salvo owner', () => {
  const editor = PermissionGrantSchema.parse({
    id: 'grant-1',
    filmId: 'film-1',
    principalId: 'user-editor',
    role: 'editor',
    permissions: ['film.read', 'timeline.edit'],
    createdAt: '2026-10-08T00:00:00.000Z'
  });
  const owner = PermissionGrantSchema.parse({
    id: 'grant-2',
    filmId: 'film-1',
    principalId: 'user-owner',
    role: 'owner',
    permissions: ['film.read'],
    createdAt: '2026-10-08T00:00:00.000Z'
  });

  assert.equal(hasPermission([editor], 'film-1', 'user-editor', 'timeline.edit'), true);
  assert.throws(
    () => assertPermission([editor], 'film-1', 'user-editor', 'budget.authorize'),
    /V7_PERMISSION_DENIED/
  );
  assert.doesNotThrow(
    () => assertPermission([owner], 'film-1', 'user-owner', 'master.approve')
  );
});

test('Provider Router excluye circuit-open y prioriza capability, calidad, éxito y costo', () => {
  const ranked = rankProviderCandidates([
    {
      providerId: 'expensive-high-quality',
      estimatedCostUsd: 1.5,
      successRate: 0.99,
      averageQuality: 9.8,
      averageLatencyMs: 20000,
      consecutiveSafeFailures: 0,
      circuitOpen: false,
      capabilityMatch: 1
    },
    {
      providerId: 'balanced',
      estimatedCostUsd: 0.25,
      successRate: 0.97,
      averageQuality: 9.2,
      averageLatencyMs: 10000,
      consecutiveSafeFailures: 0,
      circuitOpen: false,
      capabilityMatch: 1
    },
    {
      providerId: 'open-circuit',
      estimatedCostUsd: 0.01,
      successRate: 1,
      averageQuality: 10,
      averageLatencyMs: 1,
      consecutiveSafeFailures: 4,
      circuitOpen: true,
      capabilityMatch: 1
    }
  ]);
  assert.equal(ranked.at(-1)?.providerId, 'open-circuit');
  assert.equal(selectProviderCandidate(ranked).providerId, 'balanced');
});

test('Voice Continuity Auditor detecta cambio de Voice ID canónico', () => {
  const previous = VoiceProfileSchema.parse({
    id: 'voice-elena-v1',
    characterId: 'elena',
    provider: 'openai',
    providerVoiceId: 'marin',
    language: 'es-LATAM',
    timbre: 'cálido',
    speed: 1,
    emotionPresets: {},
    pronunciationDictionary: {},
    voiceVersion: 1,
    rightsStatus: 'provider-stock',
    approved: true
  });
  const current = VoiceProfileSchema.parse({
    ...previous,
    id: 'voice-elena-v2',
    providerVoiceId: 'otra-voz',
    voiceVersion: 2
  });
  const audit = auditVoiceContinuity(previous, current);
  assert.equal(audit.passed, false);
  assert.ok(audit.issues.some((issue) => /Voice ID/.test(issue)));
});

test('Root Cause Agent propone reparar solo la fuente fallida y prohíbe auto retry', () => {
  const qa = QAResultSchema.parse({
    id: 'qa-root-1',
    filmId: 'film-1',
    level: 'shot',
    targetId: 'shot-1',
    categoryScores: { identity: 2, continuity: 9, audio: 9 },
    overallScore: 6.7,
    criticalFailures: ['Cambio de identidad en rostro de Elena'],
    issues: [],
    passed: false
  });
  const plan = rootCauseRepairPlan(qa);
  assert.deepEqual(plan.regenerateOnly, ['identity-reference']);
  assert.equal(plan.preserveUnaffectedAssets, true);
  assert.equal(plan.autoRetryAllowed, false);
});

test('Take Service agrega nuevos Takes sin eliminar anteriores y selecciona el aprobado', () => {
  let shot = ShotSchema.parse({
    id: 'shot-takes',
    sceneId: 'scene-1',
    order: 1,
    title: 'Plano',
    intention: 'Prueba',
    durationSeconds: 6,
    visualPrompt: '',
    camera: '',
    spokenText: '',
    characterIds: [],
    characterStateIds: {},
    strategy: 'generic-cinematic',
    takes: [],
    metadata: {}
  });

  shot = appendTake(shot, {
    id: 'take-a',
    status: 'rejected',
    estimatedCostUsd: 0.2,
    rejectedAt: '2026-10-08T00:00:00.000Z'
  });
  shot = appendTake(shot, {
    id: 'take-b',
    status: 'approved',
    estimatedCostUsd: 0.2,
    approvedAt: '2026-10-08T00:01:00.000Z'
  });

  assert.equal(shot.takes.length, 2);
  assert.deepEqual(shot.takes.map((take) => take.version), [1, 2]);
  const selected = selectTake(shot, 'take-b');
  assert.equal(selectedTake(selected)?.id, 'take-b');
  assert.equal(selected.takes[0].id, 'take-a');
});

test('Version Manager crea cadena append-only de cuts', () => {
  const v1 = createNextFilmVersion([], {
    filmId: 'film-1',
    label: 'cut-v001',
    createdBy: 'director',
    createdAt: '2026-10-08T00:00:00.000Z'
  });
  const v2 = createNextFilmVersion([v1], {
    filmId: 'film-1',
    label: 'director-cut-v002',
    createdBy: 'director',
    createdAt: '2026-10-08T00:01:00.000Z'
  });
  assert.equal(v2.versionNumber, 2);
  assert.equal(v2.parentVersionId, v1.id);
  assert.doesNotThrow(() => assertNoVersionOverwrite([v1], v2));
  assert.throws(() => assertNoVersionOverwrite([v1], v1), /append-only/);
});

test('Timeline exporta representación OTIO-JSON multipista sin I/O externo', () => {
  let timeline = createTimeline({ filmId: 'film-1', name: 'cut-v001', frameRate: 24 });
  timeline = addTrack(timeline, {
    id: 'v1',
    timelineId: timeline.id,
    type: 'video',
    order: 0,
    name: 'V1 Picture',
    clips: []
  });
  timeline = addTrack(timeline, {
    id: 'a1',
    timelineId: timeline.id,
    type: 'dialogue',
    order: 1,
    name: 'A1 Dialogue',
    clips: []
  });
  timeline = addClip(timeline, 'v1', {
    id: 'clip-video',
    trackId: 'v1',
    assetId: 'asset-video',
    sourceStartSeconds: 0,
    sourceDurationSeconds: 6,
    timelineStartSeconds: 0,
    timelineDurationSeconds: 6,
    gainDb: 0,
    metadata: {}
  });
  const otio = exportTimelineAsOtioJson(timeline);
  assert.equal(otio.OTIO_SCHEMA, 'Timeline.1');
  assert.equal(otio.tracks.children.length, 2);
  assert.equal(otio.tracks.children[0].kind, 'Video');
});

test('Production metrics calcula costo por minuto terminado desde Takes seleccionados', () => {
  const film: FilmV7 = {
    id: 'film-metrics',
    title: 'Metrics',
    premise: '',
    durationMinutes: 1,
    genre: 'Drama',
    audience: '',
    visualStyle: '',
    language: 'es',
    aspectRatio: '16:9',
    budgetUsd: 10,
    acts: [{
      id: 'act-1',
      filmId: 'film-metrics',
      order: 1,
      title: 'Acto 1',
      dramaticObjective: '',
      sequences: [{
        id: 'seq-1',
        actId: 'act-1',
        order: 1,
        title: 'Secuencia 1',
        objective: '',
        scenes: [{
          id: 'scene-1',
          sequenceId: 'seq-1',
          order: 1,
          title: 'Escena',
          summary: '',
          durationSeconds: 60,
          timeIndex: 0,
          characterIds: [],
          narrativeGoal: '',
          emotionalGoal: '',
          continuityNotes: [],
          shots: [{
            id: 'shot-1',
            sceneId: 'scene-1',
            order: 1,
            title: 'Shot',
            intention: '',
            durationSeconds: 60,
            visualPrompt: '',
            camera: '',
            spokenText: '',
            characterIds: [],
            characterStateIds: {},
            strategy: 'generic-cinematic',
            selectedTakeId: 'take-1',
            takes: [{
              id: 'take-1',
              shotId: 'shot-1',
              version: 1,
              status: 'approved',
              estimatedCostUsd: 2,
              actualCostUsd: 2,
              createdAt: '2026-10-08T00:00:00.000Z',
              approvedAt: '2026-10-08T00:00:00.000Z'
            }],
            metadata: {}
          }],
          metadata: {}
        }]
      }]
    }],
    characters: [],
    createdAt: '2026-10-08T00:00:00.000Z',
    updatedAt: '2026-10-08T00:00:00.000Z',
    metadata: {}
  };
  const metrics = calculateProductionMetrics(film);
  assert.equal(metrics.finishedMinutes, 1);
  assert.equal(metrics.actualSpendUsd, 2);
  assert.equal(metrics.costPerFinishedMinuteUsd, 2);
  assert.equal(metrics.approvalRate, 1);
});
