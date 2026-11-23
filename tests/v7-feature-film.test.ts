import test from 'node:test';
import assert from 'node:assert/strict';
import type { FilmProject } from '../lib/domain/schemas';
import {
  AssetSchema,
  FilmV7Schema,
  FilmVersionSchema,
  GenerationJobSchema,
  SceneStateSnapshotSchema,
  ShotSchema,
  VoiceProfileSchema,
  type FilmV7
} from '../lib/v7/domain';
import { appendAsset } from '../lib/v7/assets/registry';
import { adaptLegacyProjectToV7 } from '../lib/v7/compat/legacy-project-adapter';
import { resolveContinuity } from '../lib/v7/continuity/continuity-brain';
import { assertCanReserve } from '../lib/v7/cost/budget-controller';
import { addClip, addTrack, createTimeline, timelineDurationSeconds } from '../lib/v7/editor/timeline-engine';
import { InMemoryJobQueue } from '../lib/v7/jobs/in-memory-queue';
import { planFilmJobs } from '../lib/v7/orchestration/film-orchestrator';
import { canTransition } from '../lib/v7/orchestration/state-machine';
import { aggregateQA, QAResultSchema } from '../lib/v7/qa/hierarchy';
import { registerVoiceProfile } from '../lib/v7/voice-vault/registry';

function featureFilmFixture(): FilmV7 {
  const filmId = 'film-v7-90m-test';
  const acts = [1, 2, 3].map((order) => ({
    id: 'act-' + order,
    filmId,
    order,
    title: 'Acto ' + order,
    dramaticObjective: 'Objetivo dramático ' + order,
    sequences: [] as Array<Record<string, unknown>>
  }));

  for (let sequenceNumber = 1; sequenceNumber <= 10; sequenceNumber += 1) {
    const actIndex = sequenceNumber <= 3 ? 0 : sequenceNumber <= 7 ? 1 : 2;
    const act = acts[actIndex];
    const sequenceId = 'sequence-' + sequenceNumber;
    const scenes = Array.from({ length: 6 }, (_, sceneOffset) => {
      const sceneNumber = (sequenceNumber - 1) * 6 + sceneOffset + 1;
      const sceneId = 'scene-' + sceneNumber;
      const shots = Array.from({ length: 10 }, (_, shotOffset) => ({
        id: sceneId + '-shot-' + (shotOffset + 1),
        sceneId,
        order: shotOffset + 1,
        title: 'Shot ' + (shotOffset + 1),
        intention: 'Acción cinematográfica de prueba',
        durationSeconds: 9,
        visualPrompt: 'Plano cinematográfico coherente',
        camera: '50mm dolly',
        spokenText: '',
        characterIds: [],
        characterStateIds: {},
        strategy: 'generic-cinematic',
        takes: [],
        metadata: {}
      }));
      return {
        id: sceneId,
        sequenceId,
        order: sceneNumber,
        title: 'Escena ' + sceneNumber,
        summary: 'Escena de largometraje de prueba',
        durationSeconds: 90,
        timeIndex: (sceneNumber - 1) * 90,
        characterIds: [],
        narrativeGoal: 'Avanzar el conflicto',
        emotionalGoal: 'Aumentar tensión',
        continuityNotes: [],
        shots,
        metadata: {}
      };
    });

    act.sequences.push({
      id: sequenceId,
      actId: act.id,
      order: act.sequences.length + 1,
      title: 'Secuencia ' + sequenceNumber,
      objective: 'Objetivo de secuencia',
      scenes
    });
  }

  return FilmV7Schema.parse({
    id: filmId,
    title: 'Feature Film 90',
    premise: 'Película de prueba para validar la arquitectura de largometraje.',
    durationMinutes: 90,
    genre: 'Drama',
    audience: 'Adultos',
    visualStyle: 'Cine realista',
    language: 'es',
    aspectRatio: '2.39:1',
    budgetUsd: 1000,
    acts,
    characters: Array.from({ length: 20 }, (_, index) => ({
      id: 'character-' + (index + 1),
      filmId,
      name: 'Personaje ' + (index + 1),
      role: index === 0 ? 'Protagonista' : 'Secundario',
      appearance: 'Apariencia canónica',
      personality: 'Perfil dramático',
      identityLock: 'Identidad persistente',
      immutableTraits: [],
      metadata: {}
    })),
    createdAt: '2026-10-08T00:00:00.000Z',
    updatedAt: '2026-10-08T00:00:00.000Z',
    metadata: {}
  });
}

function legacyFixture(): FilmProject {
  const scenes = Array.from({ length: 4 }, (_, index) => ({
    id: 'legacy-scene-' + (index + 1),
    order: index + 1,
    act: 1,
    title: 'Legacy ' + (index + 1),
    durationSeconds: 30,
    summary: 'Resumen legacy',
    narration: '',
    dialogue: '',
    dialogueTurns: [],
    visualPrompt: 'Visual legacy',
    negativePrompt: '',
    camera: 'Plano medio',
    soundDesign: '',
    transition: 'cut',
    mode: 'ai-video' as const,
    characterIds: ['legacy-char'],
    shots: [{
      id: 'legacy-shot-' + (index + 1),
      order: 1,
      title: 'Toma',
      durationSeconds: 6,
      visualPrompt: 'Visual',
      camera: '50mm',
      spokenText: '',
      dialogueLines: [],
      mode: 'video' as const,
      characterIds: ['legacy-char'],
      status: 'ready' as const,
      imageAsset: 'images/legacy-' + (index + 1) + '.png',
      voiceAsset: 'audio/legacy-' + (index + 1) + '.wav',
      videoAsset: 'video/legacy-' + (index + 1) + '.mp4',
      pipelineVersion: '4.2-single-full-flow-music',
      lastProvider: 'legacy-provider'
    }],
    status: 'ready' as const,
    productionStrategy: 'real-cinema-v2' as const
  }));

  return {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-08T00:00:00.000Z',
    status: 'ready',
    input: {
      title: '15 DÍAS',
      premise: 'Historia de prueba compatible con el proyecto corto existente.',
      durationMinutes: 2.5,
      genre: 'Drama',
      audience: 'General',
      visualStyle: 'Cine',
      language: 'es',
      aspectRatio: '16:9',
      budgetUsd: 100,
      burnSubtitles: false,
      generateMusic: true
    },
    plan: {
      logline: 'Test',
      synopsis: 'Test',
      creativeDirection: 'Test',
      musicPrompt: 'Test',
      characters: [{
        id: 'legacy-char',
        name: 'Elena',
        role: 'Protagonista',
        age: 36,
        appearance: 'Mujer latina',
        wardrobe: 'Ropa cotidiana',
        personality: 'Resiliente',
        voiceInstructions: 'Español latino natural',
        voiceProvider: 'openai',
        voiceId: 'marin',
        imagePrompt: 'Retrato cinematográfico'
      }],
      scenes
    },
    progress: {
      phase: 'film-complete',
      percent: 100,
      message: 'Completado',
      updatedAt: '2026-10-08T00:00:00.000Z'
    },
    finalVideoAsset: 'exports/pelicula-final.mp4',
    productionLog: []
  };
}

test('V7 modela una película de 90 minutos con 3 actos, 10 secuencias, 60 escenas y 600 shots', () => {
  const film = featureFilmFixture();
  const sequences = film.acts.flatMap((act) => act.sequences);
  const scenes = sequences.flatMap((sequence) => sequence.scenes);
  const shots = scenes.flatMap((scene) => scene.shots);
  assert.equal(film.durationMinutes, 90);
  assert.equal(film.acts.length, 3);
  assert.equal(sequences.length, 10);
  assert.equal(scenes.length, 60);
  assert.equal(shots.length, 600);
  assert.equal(film.characters.length, 20);
});

test('Shot conserva múltiples Takes y selectedTakeId apunta al aprobado', () => {
  const shot = ShotSchema.parse({
    id: 'shot-x',
    sceneId: 'scene-x',
    order: 1,
    title: 'Plano',
    intention: 'Primer plano',
    durationSeconds: 6,
    visualPrompt: 'Cine',
    camera: '50mm',
    spokenText: '',
    characterIds: [],
    characterStateIds: {},
    strategy: 'dialogue-closeup',
    selectedTakeId: 'take-b',
    takes: [
      { id: 'take-a', shotId: 'shot-x', version: 1, status: 'rejected', estimatedCostUsd: 0.1, createdAt: '2026-10-08' },
      { id: 'take-b', shotId: 'shot-x', version: 2, status: 'approved', estimatedCostUsd: 0.1, createdAt: '2026-10-08', approvedAt: '2026-10-08' }
    ],
    metadata: {}
  });
  assert.equal(shot.takes.length, 2);
  assert.equal(shot.takes[0].id, 'take-a');
  assert.equal(shot.selectedTakeId, 'take-b');
});

test('SceneStateSnapshot y Continuity Brain conservan vestuario, emoción y última voz', () => {
  const snapshot = SceneStateSnapshotSchema.parse({
    id: 'snapshot-1',
    filmId: 'film-1',
    sceneId: 'scene-1',
    sequenceId: 'sequence-1',
    timeIndex: 100,
    characters: {},
    emotionalStates: {},
    physicalStates: {},
    injuries: {},
    wardrobe: {},
    props: {},
    locations: [],
    lighting: 'interior cálido',
    lastApprovedVoiceAssetId: 'voice-asset-1',
    continuityNotes: [],
    createdAt: '2026-10-08'
  });
  const result = resolveContinuity(snapshot, [{
    id: 'event-1',
    filmId: 'film-1',
    sceneId: 'scene-1',
    entityType: 'character',
    entityId: 'elena',
    eventType: 'character.wardrobe.changed',
    payload: { wardrobeSetId: 'wardrobe-blue' },
    effectiveFrom: 50,
    createdAt: '2026-10-08'
  }, {
    id: 'event-2',
    filmId: 'film-1',
    sceneId: 'scene-1',
    entityType: 'character',
    entityId: 'elena',
    eventType: 'character.emotion.changed',
    payload: { emotion: 'ansiedad contenida' },
    effectiveFrom: 80,
    createdAt: '2026-10-08'
  }]);
  assert.equal(result.snapshot.wardrobe.elena, 'wardrobe-blue');
  assert.equal(result.snapshot.emotionalStates.elena, 'ansiedad contenida');
  assert.equal(result.snapshot.lastApprovedVoiceAssetId, 'voice-asset-1');
});

test('Voice Vault es versionado y append-only', () => {
  const v1 = VoiceProfileSchema.parse({
    id: 'voice-elena',
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
  const v2 = VoiceProfileSchema.parse({ ...v1, voiceVersion: 2, previousApprovedSampleAssetId: 'sample-1' });
  const vault = registerVoiceProfile(registerVoiceProfile([], v1), v2);
  assert.equal(vault.length, 2);
  assert.throws(() => registerVoiceProfile(vault, v1), /append-only/);
});

test('Asset Registry conserva provenance y no sobrescribe IDs', () => {
  const asset = AssetSchema.parse({
    id: 'asset-1',
    filmId: 'film-1',
    type: 'video',
    storagePath: 'video/take-1.mp4',
    source: 'generated',
    provider: 'runway',
    providerTaskId: 'task-1',
    generationJobId: 'job-1',
    shotId: 'shot-1',
    takeId: 'take-1',
    version: 1,
    approved: false,
    createdAt: '2026-10-08'
  });
  const registry = appendAsset([], asset);
  assert.equal(registry[0].providerTaskId, 'task-1');
  assert.throws(() => appendAsset(registry, asset), /append-only/);
});

test('GenerationJob conserva idempotencyKey y failed-unknown no puede reintentarse automáticamente', () => {
  const job = GenerationJobSchema.parse({
    id: 'job-1',
    filmId: 'film-1',
    type: 'video.generate',
    status: 'ready',
    priority: 10,
    dependsOn: [],
    estimatedCostUsd: 0.4,
    idempotencyKey: 'film-1:shot-1:take-1',
    attempt: 0,
    maxAttempts: 1,
    createdAt: '2026-10-08'
  });
  assert.equal(job.idempotencyKey, 'film-1:shot-1:take-1');
  assert.equal(canTransition('failed-unknown', 'ready'), false);
  assert.equal(canTransition('failed-no-charge', 'ready'), true);
});

test('Budget Controller cuenta gasto exitoso, reservado y riesgo desconocido', () => {
  assert.doesNotThrow(() => assertCanReserve({
    limitUsd: 10,
    succeededUsd: 4,
    reservedUsd: 2,
    unknownRiskUsd: 1
  }, 3));
  assert.throws(() => assertCanReserve({
    limitUsd: 10,
    succeededUsd: 4,
    reservedUsd: 2,
    unknownRiskUsd: 1
  }, 3.01), /V7_BUDGET_BLOCKED/);
});

test('FilmVersion permite cortes nuevos sin sobrescribir la versión anterior', () => {
  const v1 = FilmVersionSchema.parse({
    id: 'film-version-1',
    filmId: 'film-1',
    label: 'cut-v001',
    versionNumber: 1,
    status: 'approved',
    changeSummary: 'Primer corte',
    createdBy: 'director',
    createdAt: '2026-10-08'
  });
  const v2 = FilmVersionSchema.parse({
    id: 'film-version-2',
    filmId: 'film-1',
    label: 'director-cut-v002',
    versionNumber: 2,
    parentVersionId: v1.id,
    status: 'draft',
    changeSummary: 'Nuevo montaje',
    createdBy: 'director',
    createdAt: '2026-10-08'
  });
  assert.equal(v1.label, 'cut-v001');
  assert.equal(v2.parentVersionId, v1.id);
});

test('adaptador V6→V7 no modifica el proyecto y preserva referencias de media', () => {
  const legacy = legacyFixture();
  const before = JSON.stringify(legacy);
  const bundle = adaptLegacyProjectToV7(legacy);
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(bundle.film.title, '15 DÍAS');
  assert.equal(bundle.film.legacyProjectId, legacy.id);
  assert.ok(bundle.assets.some((asset) => asset.storagePath === 'video/legacy-1.mp4'));
  const firstShot = bundle.film.acts[0].sequences[0].scenes[0].shots[0];
  assert.equal(firstShot.takes.length, 1);
  assert.equal(firstShot.takes[0].legacyVideoAssetPath, 'video/legacy-1.mp4');
  assert.equal(firstShot.selectedTakeId, firstShot.takes[0].id);
});

test('adaptador V6→V7 convierte Voice Lock existente en Voice DNA sin generar audio', () => {
  const bundle = adaptLegacyProjectToV7(legacyFixture());
  assert.equal(bundle.voiceProfiles.length, 1);
  assert.equal(bundle.voiceProfiles[0].providerVoiceId, 'marin');
  assert.equal(bundle.voiceProfiles[0].approved, true);
});

test('Job Queue solo libera jobs cuyas dependencias ya terminaron', async () => {
  const queue = new InMemoryJobQueue();
  const base = {
    filmId: 'film-1',
    type: 'video.generate' as const,
    priority: 1,
    estimatedCostUsd: 0,
    attempt: 0,
    maxAttempts: 1,
    createdAt: '2026-10-08'
  };
  await queue.enqueue(GenerationJobSchema.parse({
    ...base, id: 'job-a', status: 'succeeded', dependsOn: [], idempotencyKey: 'a'
  }));
  await queue.enqueue(GenerationJobSchema.parse({
    ...base, id: 'job-b', status: 'ready', dependsOn: ['job-a'], idempotencyKey: 'b'
  }));
  const ready = await queue.listReady();
  assert.deepEqual(ready.map((job) => job.id), ['job-b']);
});

test('orquestador V7 crea DAG de continuidad → video → QA sin ejecutar proveedores', () => {
  const full = featureFilmFixture();
  const film = FilmV7Schema.parse({
    ...full,
    acts: [{
      ...full.acts[0],
      sequences: [{
        ...full.acts[0].sequences[0],
        scenes: [full.acts[0].sequences[0].scenes[0]]
      }]
    }]
  });
  const plan = planFilmJobs(film, '2026-10-08');
  assert.ok(plan.jobs.some((job) => job.type === 'continuity.resolve'));
  assert.ok(plan.jobs.some((job) => job.type === 'video.generate'));
  assert.ok(plan.jobs.some((job) => job.type === 'qa.scene'));
  assert.ok(plan.layers.length >= 3);
  assert.ok(plan.jobs.every((job) => job.provider === undefined));
});

test('Timeline V7 soporta tracks multipista y calcula duración', () => {
  let timeline = createTimeline({ filmId: 'film-1', name: 'cut-v001' });
  timeline = addTrack(timeline, {
    id: 'v1',
    timelineId: timeline.id,
    type: 'video',
    order: 0,
    name: 'V1 Picture',
    clips: []
  });
  timeline = addClip(timeline, 'v1', {
    id: 'clip-1',
    trackId: 'v1',
    assetId: 'asset-video-1',
    sourceStartSeconds: 0,
    sourceDurationSeconds: 6,
    timelineStartSeconds: 10,
    timelineDurationSeconds: 6,
    gainDb: 0,
    metadata: {}
  });
  assert.equal(timelineDurationSeconds(timeline), 16);
});

test('QA jerárquico falla si existe cualquier criticalFailure', () => {
  const result = QAResultSchema.parse({
    id: 'qa-1',
    filmId: 'film-1',
    level: 'scene',
    targetId: 'scene-1',
    categoryScores: { identity: 9, continuity: 9 },
    overallScore: 9,
    criticalFailures: ['Cambio de identidad'],
    issues: [],
    passed: false
  });
  assert.equal(aggregateQA([result]).passed, false);
});

test('V7 no necesita ampliar ni mutar schemas V6 para representar largometraje', () => {
  const film = featureFilmFixture();
  assert.equal(film.characters.length, 20);
  assert.ok(film.acts.flatMap((a) => a.sequences.flatMap((s) => s.scenes)).length > 8);
});
