import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import {
  assetAbsolutePath,
  assetRelativePath,
  getProject,
  projectAssetDir,
  saveProject
} from '@/lib/storage/project-store';
import {
  audioFileToDataUri,
  generateRunwayGrokLiteFromEnvironment,
  generateRunwayWan3AudioReferenceFromEnvironment,
  grokLiteImageToVideoCredits,
  imageFileToDataUri,
  wan3VideoCredits
} from '@/lib/providers/runway-router-v6';
import {
  appendSpend,
  latestSpendForKey,
  readSpendLedger
} from '@/lib/engine/spend-ledger';
import {
  concatenate,
  createSilenceAudio,
  normalizeGeneratedVideo,
  normalizeGeneratedVideoWithEmbeddedAudio,
  normalizeReferenceImage
} from '@/lib/media/ffmpeg';
import {
  assertCinematicSceneVideo,
  probeVideo
} from '@/lib/media/probe';
import {
  renderedAssets,
  saveSceneCheckpoint,
  saveShotCheckpoint
} from '@/lib/engine/scene-checkpoints';
import {
  SCENE6_ELENA_ID_V6,
  SCENE6_SOFIA_ID_V6,
  SCENE6_MATEO_ID_V6
} from '@/lib/engine/scene6-closing-plan-v6';
import {
  buildScene6BRepairShotsV6,
  validateScene6BRepairShotsV6,
  SCENE6B_DIALOGUE_V6,
  SCENE6B_MAX_VIDEO_USD_V6,
  SCENE6B_AUTHORIZED_MAX_USD_V6
} from '@/lib/engine/scene6b-repair-spec-v6';

const GROK_MODEL = 'grok_imagine_1_5_lite' as const;
const GROK_RATIO = 'auto_720p' as const;
const WAN_RATIO = '1280:720' as const;
const MAX_GROK_4S_CREDITS = 13;
const MAX_WAN_4S_CREDITS = 40;
const MAX_TOTAL_VIDEO_CREDITS = 66;

export type Scene6BRepairResultV6 = {
  projectId: string;
  sceneVideo: string;
  previousSceneVideo: string;
  runwayCredits: number;
  runwayUsd: number;
  voiceUsd: number;
};

export async function produceScene6BRepairV6(
  projectId: string
): Promise<Scene6BRepairResultV6> {
  delete process.env.FAL_KEY;
  process.env.ENABLE_LIPSYNC = 'false';
  process.env.ALLOW_PAID_PROVIDER_FALLBACK = 'false';

  let project = await getProject(projectId);
  assertProjectReady(project);

  const scene5 = sceneByOrder(project, 5);
  const scene6 = sceneByOrder(project, 6);

  if (
    scene5.status !== 'ready' ||
    !scene5.qualityOverrideApproved ||
    !scene5.videoAsset?.endsWith(
      'scene-005-wan3-reunion-v6-mateo-true-child.mp4'
    )
  ) {
    throw new Error(
      'Escena 5 debe seguir aprobada y congelada antes de Scene 6B.'
    );
  }

  const originalMaster = path.join(
    projectAssetDir(project.id, 'video'),
    'scene-006-home-promise-v6.mp4'
  );
  await access(originalMaster);

  const originalElenaAudio = path.join(
    projectAssetDir(project.id, 'audio'),
    'scene6-v6',
    'scene-006-shot-02-elena-master.wav'
  );
  await access(originalElenaAudio);

  const refs = {
    elena: await characterReference(
      project,
      SCENE6_ELENA_ID_V6,
      'elena-d-restored'
    ),
    sofia: await characterReference(
      project,
      SCENE6_SOFIA_ID_V6,
      'sofia-main'
    ),
    mateo: await characterReference(
      project,
      SCENE6_MATEO_ID_V6,
      'mateo-main'
    )
  };

  const familyReference = path.join(
    projectAssetDir(project.id, 'images'),
    'scene5-v6',
    'scene-005-shot-01-family-reference.png'
  );
  await access(familyReference);

  const repairShots =
    buildScene6BRepairShotsV6(scene6.id);
  validateScene6BRepairShotsV6(repairShots);

  const silentCredits =
    grokLiteImageToVideoCredits(4, GROK_RATIO) * 2;
  const dialogueCredits =
    wan3VideoCredits(4, WAN_RATIO);
  const expectedCredits =
    silentCredits + dialogueCredits;
  const expectedUsd = expectedCredits * 0.01;

  if (expectedCredits !== MAX_TOTAL_VIDEO_CREDITS) {
    throw new Error(
      'SAFE COST GATE 6B: video esperado cambió a ' +
        expectedCredits +
        ' créditos.'
    );
  }
  if (
    Math.abs(
      expectedUsd - SCENE6B_MAX_VIDEO_USD_V6
    ) > 0.0001
  ) {
    throw new Error(
      'SAFE COST GATE 6B: video esperado cambió a US$' +
        expectedUsd.toFixed(2) +
        '.'
    );
  }
  if (
    expectedUsd >
    SCENE6B_AUTHORIZED_MAX_USD_V6 + 0.0001
  ) {
    throw new Error(
      'SAFE COST GATE 6B: excede autorización US$' +
        SCENE6B_AUTHORIZED_MAX_USD_V6.toFixed(2) +
        '.'
    );
  }

  const dirs = {
    images: path.join(
      projectAssetDir(project.id, 'images'),
      'scene6b-repair-v6'
    ),
    audio: path.join(
      projectAssetDir(project.id, 'audio'),
      'scene6b-repair-v6'
    ),
    video: path.join(
      projectAssetDir(project.id, 'video'),
      'scene6b-repair-v6'
    )
  };
  await Promise.all([
    mkdir(dirs.images, { recursive: true }),
    mkdir(dirs.audio, { recursive: true }),
    mkdir(dirs.video, { recursive: true })
  ]);

  const silence4 = path.join(
    dirs.audio,
    'silence-4s.mp3'
  );
  if (!(await exists(silence4))) {
    await createSilenceAudio(4, silence4);
  }

  const elenaWanRef = path.join(
    dirs.images,
    'elena-identity-wan-9x16.png'
  );
  if (!(await exists(elenaWanRef))) {
    await normalizeReferenceImage(
      refs.elena,
      elenaWanRef,
      '9:16'
    );
  }

  const sofiaGrokRef = path.join(
    dirs.images,
    'sofia-identity-grok-safe-9x16.png'
  );
  if (!(await exists(sofiaGrokRef))) {
    await normalizeReferenceImage(
      refs.sofia,
      sofiaGrokRef,
      '9:16'
    );
  }

  const familyGrokRef = path.join(
    dirs.images,
    'family-grok-safe-16x9.png'
  );
  if (!(await exists(familyGrokRef))) {
    await normalizeReferenceImage(
      familyReference,
      familyGrokRef,
      '16:9'
    );
  }

  let totalRunwayCredits = 0;

  // T1 — Sofía sola. Nunca se usa una referencia con Elena.
  const t1 = repairShots[0];
  const t1Raw = path.join(
    dirs.video,
    'scene-006b-shot-01-grok-lite-raw.mp4'
  );
  const t1Final = path.join(
    dirs.video,
    'scene-006b-shot-01.mp4'
  );

  const t1Credits = grokLiteImageToVideoCredits(
    t1.durationSeconds,
    GROK_RATIO
  );
  if (t1Credits !== MAX_GROK_4S_CREDITS) {
    throw new Error(
      'SAFE COST GATE 6B/T1: Grok Lite cambió a ' +
        t1Credits +
        ' créditos.'
    );
  }

  let t1Charged = 0;
  if (!(await exists(t1Raw))) {
    const spendKey =
      'v6safe:e6b:t1:grok-lite:1';
    await assertRetryAvailable(
      project.id,
      spendKey,
      'E6B/T1 Grok Lite'
    );
    await assertScene6BRepairBudget(
      project.id,
      t1Credits * 0.01,
      'E6B/T1 Grok Lite'
    );

    await appendSpend(project.id, {
      operation: 'video',
      provider: 'runway-direct',
      model: GROK_MODEL,
      state: 'submitted',
      estimatedUsd: t1Credits * 0.01,
      sceneId: scene6.id,
      shotId: t1.id,
      characterId: SCENE6_SOFIA_ID_V6,
      idempotencyKey: spendKey
    });

    try {
      const generated = await withPaidGate(
        async () =>
          generateRunwayGrokLiteFromEnvironment(
            {
              model: GROK_MODEL,
              promptImage:
                await imageFileToDataUri(sofiaGrokRef),
              promptText:
                buildIdentityIsolatedSilentPrompt(t1),
              ratio: GROK_RATIO,
              duration: t1.durationSeconds
            },
            t1Raw
          )
      );

      if (generated.credits !== t1Credits) {
        throw new Error(
          'Runway devolvió ' +
            generated.credits +
            ' créditos en E6B/T1; esperábamos ' +
            t1Credits +
            '.'
        );
      }

      t1Charged = generated.credits;
      totalRunwayCredits += t1Charged;

      await appendSpend(project.id, {
        operation: 'video',
        provider: 'runway-direct',
        model: generated.model,
        state: 'succeeded',
        estimatedUsd: t1Credits * 0.01,
        actualUsd: t1Charged * 0.01,
        sceneId: scene6.id,
        shotId: t1.id,
        characterId: SCENE6_SOFIA_ID_V6,
        idempotencyKey: spendKey,
        providerRequestId: generated.taskId,
        outputAsset:
          assetRelativePath(project.id, t1Raw)
      });
    } catch (error) {
      await recordRunwayFailure(
        project.id,
        scene6,
        t1,
        'v6safe:e6b:t1:grok-lite:1',
        GROK_MODEL,
        t1Credits * 0.01,
        error
      );
      throw error;
    }
  }

  await normalizeGeneratedVideo(
    t1Raw,
    silence4,
    4,
    t1Final,
    project.input.aspectRatio
  );
  await assertCinematicSceneVideo(
    t1Final,
    4,
    { requireMotion: true }
  );

  // T2 — Elena sola. Sin frame de Sofía como continuidad.
  const t2 = repairShots[1];
  const t2Raw = path.join(
    dirs.video,
    'scene-006b-shot-02-wan3-raw.mp4'
  );
  const t2Final = path.join(
    dirs.video,
    'scene-006b-shot-02-wan3-final.mp4'
  );

  const t2Credits = wan3VideoCredits(
    t2.durationSeconds,
    WAN_RATIO
  );
  if (t2Credits !== MAX_WAN_4S_CREDITS) {
    throw new Error(
      'SAFE COST GATE 6B/T2: WAN cambió a ' +
        t2Credits +
        ' créditos.'
    );
  }

  let t2Charged = 0;
  if (!(await exists(t2Raw))) {
    const spendKey =
      'v6safe:e6b:t2:wan3-audio-reference:1';
    await assertRetryAvailable(
      project.id,
      spendKey,
      'E6B/T2 WAN 3.0'
    );
    await assertScene6BRepairBudget(
      project.id,
      t2Credits * 0.01,
      'E6B/T2 WAN 3.0'
    );

    await appendSpend(project.id, {
      operation: 'video',
      provider: 'runway-direct',
      model: 'wan3',
      state: 'submitted',
      estimatedUsd: t2Credits * 0.01,
      sceneId: scene6.id,
      shotId: t2.id,
      characterId: SCENE6_ELENA_ID_V6,
      idempotencyKey: spendKey
    });

    try {
      const generated = await withPaidGate(
        async () =>
          generateRunwayWan3AudioReferenceFromEnvironment(
            {
              model: 'wan3',
              promptText:
                buildElenaOnlyDialoguePrompt(t2),
              audio: true,
              duration: t2.durationSeconds,
              ratio: WAN_RATIO,
              references: [
                {
                  uri:
                    await imageFileToDataUri(
                      elenaWanRef
                    )
                }
              ],
              referenceAudio: [
                {
                  type: 'audio',
                  uri:
                    await audioFileToDataUri(
                      originalElenaAudio
                    )
                }
              ]
            },
            t2Raw
          )
      );

      if (generated.credits !== t2Credits) {
        throw new Error(
          'Runway devolvió ' +
            generated.credits +
            ' créditos en E6B/T2; esperábamos ' +
            t2Credits +
            '.'
        );
      }

      t2Charged = generated.credits;
      totalRunwayCredits += t2Charged;

      await appendSpend(project.id, {
        operation: 'video',
        provider: 'runway-direct',
        model: generated.model,
        state: 'succeeded',
        estimatedUsd: t2Credits * 0.01,
        actualUsd: t2Charged * 0.01,
        sceneId: scene6.id,
        shotId: t2.id,
        characterId: SCENE6_ELENA_ID_V6,
        idempotencyKey: spendKey,
        providerRequestId: generated.taskId,
        outputAsset:
          assetRelativePath(project.id, t2Raw)
      });
    } catch (error) {
      await recordRunwayFailure(
        project.id,
        scene6,
        t2,
        'v6safe:e6b:t2:wan3-audio-reference:1',
        'wan3',
        t2Credits * 0.01,
        error
      );
      throw error;
    }
  }

  const t2Probe = await probeVideo(t2Raw);
  if (!t2Probe.hasVideo || !t2Probe.hasAudio) {
    throw new Error(
      'E6B/T2 WAN incompleta: video=' +
        t2Probe.hasVideo +
        ', audio=' +
        t2Probe.hasAudio +
        '.'
    );
  }

  await normalizeGeneratedVideoWithEmbeddedAudio(
    t2Raw,
    4,
    t2Final,
    project.input.aspectRatio
  );
  await assertCinematicSceneVideo(
    t2Final,
    4,
    {
      requireMotion: true,
      requireAudibleAudio: true
    }
  );

  // T3 — abrazo familiar desde atrás; rostros no visibles.
  const t3 = repairShots[2];
  const t3Raw = path.join(
    dirs.video,
    'scene-006b-shot-03-grok-lite-raw.mp4'
  );
  const t3Final = path.join(
    dirs.video,
    'scene-006b-shot-03.mp4'
  );

  const t3Credits = grokLiteImageToVideoCredits(
    t3.durationSeconds,
    GROK_RATIO
  );
  if (t3Credits !== MAX_GROK_4S_CREDITS) {
    throw new Error(
      'SAFE COST GATE 6B/T3: Grok Lite cambió a ' +
        t3Credits +
        ' créditos.'
    );
  }

  let t3Charged = 0;
  if (!(await exists(t3Raw))) {
    const spendKey =
      'v6safe:e6b:t3:grok-lite:1';
    await assertRetryAvailable(
      project.id,
      spendKey,
      'E6B/T3 Grok Lite'
    );
    await assertScene6BRepairBudget(
      project.id,
      t3Credits * 0.01,
      'E6B/T3 Grok Lite'
    );

    await appendSpend(project.id, {
      operation: 'video',
      provider: 'runway-direct',
      model: GROK_MODEL,
      state: 'submitted',
      estimatedUsd: t3Credits * 0.01,
      sceneId: scene6.id,
      shotId: t3.id,
      idempotencyKey: spendKey
    });

    try {
      const generated = await withPaidGate(
        async () =>
          generateRunwayGrokLiteFromEnvironment(
            {
              model: GROK_MODEL,
              promptImage:
                await imageFileToDataUri(
                  familyGrokRef
                ),
              promptText:
                buildRearFamilyHugPrompt(t3),
              ratio: GROK_RATIO,
              duration: t3.durationSeconds
            },
            t3Raw
          )
      );

      if (generated.credits !== t3Credits) {
        throw new Error(
          'Runway devolvió ' +
            generated.credits +
            ' créditos en E6B/T3; esperábamos ' +
            t3Credits +
            '.'
        );
      }

      t3Charged = generated.credits;
      totalRunwayCredits += t3Charged;

      await appendSpend(project.id, {
        operation: 'video',
        provider: 'runway-direct',
        model: generated.model,
        state: 'succeeded',
        estimatedUsd: t3Credits * 0.01,
        actualUsd: t3Charged * 0.01,
        sceneId: scene6.id,
        shotId: t3.id,
        idempotencyKey: spendKey,
        providerRequestId: generated.taskId,
        outputAsset:
          assetRelativePath(project.id, t3Raw)
      });
    } catch (error) {
      await recordRunwayFailure(
        project.id,
        scene6,
        t3,
        'v6safe:e6b:t3:grok-lite:1',
        GROK_MODEL,
        t3Credits * 0.01,
        error
      );
      throw error;
    }
  }

  await normalizeGeneratedVideo(
    t3Raw,
    silence4,
    4,
    t3Final,
    project.input.aspectRatio
  );
  await assertCinematicSceneVideo(
    t3Final,
    4,
    { requireMotion: true }
  );

  const finalScenePath = path.join(
    projectAssetDir(project.id, 'video'),
    'scene-006b-repair-v6.mp4'
  );

  await concatenate(
    [t1Final, t2Final, t3Final],
    finalScenePath
  );
  await assertCinematicSceneVideo(
    finalScenePath,
    12,
    {
      requireMotion: true,
      requireAudibleAudio: true
    }
  );

  // Solo ahora se sustituye la variante en revisión.
  project = await getProject(project.id);
  const finalScene = sceneByOrder(project, 6);
  const previousSceneVideo =
    finalScene.videoAsset ||
    assetRelativePath(project.id, originalMaster);
  const finalShots =
    buildScene6BRepairShotsV6(finalScene.id);

  applyShotMedia(
    project,
    finalShots[0],
    refs.sofia,
    silence4,
    t1Raw,
    t1Final,
    'Runway Direct / grok_imagine_1_5_lite',
    t1Charged
  );
  applyShotMedia(
    project,
    finalShots[1],
    refs.elena,
    originalElenaAudio,
    t2Raw,
    t2Final,
    'Runway Direct / WAN 3.0 audio-reference',
    t2Charged
  );
  finalShots[1].lipSyncAsset =
    assetRelativePath(project.id, t2Raw);
  applyShotMedia(
    project,
    finalShots[2],
    familyReference,
    silence4,
    t3Raw,
    t3Final,
    'Runway Direct / grok_imagine_1_5_lite',
    t3Charged
  );

  finalScene.shots = finalShots;
  finalScene.summary =
    'Repair B: Sofía aislada, Elena aislada para la promesa y abrazo final visto desde atrás para eliminar mezcla facial.';
  finalScene.dialogue =
    'Elena: ' + SCENE6B_DIALOGUE_V6;
  finalScene.dialogueTurns = [
    {
      speakerId: SCENE6_ELENA_ID_V6,
      text: SCENE6B_DIALOGUE_V6,
      emotion: 'emocionada, serena y contenida'
    }
  ];
  finalScene.imageAsset =
    assetRelativePath(project.id, familyReference);
  finalScene.videoAsset =
    assetRelativePath(project.id, finalScenePath);
  finalScene.status = 'review-required';
  finalScene.error =
    'Scene 6B Repair lista. Revisar separación de identidades, Elena sola en T2 y abrazo trasero sin rostros.';
  finalScene.productionStrategy =
    'real-cinema-v2';

  project.status = 'quality-review';
  project.error = undefined;
  project.progress = {
    phase: 'quality-review',
    percent: 96,
    message:
      'Scene 6B Repair generada. Revisión humana requerida antes de congelar.',
    currentScene: 6,
    totalScenes: 6,
    updatedAt: new Date().toISOString()
  };
  project.productionLog.push(
    new Date().toISOString() +
      ' ViralCine 6 Safe: Scene 6B Repair generada; master anterior preservado=' +
      previousSceneVideo +
      '; T1 Sofía aislada; T2 Elena aislada + audio marin reutilizado; T3 abrazo posterior sin rostros; Fal.ai NO.'
  );

  for (const shot of finalShots) {
    const image =
      shot.order === 1
        ? refs.sofia
        : shot.order === 2
          ? refs.elena
          : familyReference;
    const voice =
      shot.order === 2
        ? originalElenaAudio
        : silence4;
    const video =
      shot.order === 1
        ? t1Final
        : shot.order === 2
          ? t2Final
          : t3Final;

    await saveShotCheckpoint(
      project,
      finalScene,
      shot,
      renderedAssets(
        project.id,
        shot.mode,
        image,
        voice,
        video
      )
    );
  }

  await saveSceneCheckpoint(
    project,
    finalScene,
    renderedAssets(
      project.id,
      finalScene.mode,
      familyReference,
      originalElenaAudio,
      finalScenePath
    )
  );
  await saveProject(project);

  return {
    projectId: project.id,
    sceneVideo: finalScenePath,
    previousSceneVideo,
    runwayCredits: totalRunwayCredits,
    runwayUsd: totalRunwayCredits * 0.01,
    voiceUsd: 0
  };
}

function applyShotMedia(
  project: FilmProject,
  shot: FilmShot,
  image: string,
  voice: string,
  rawVideo: string,
  finalVideo: string,
  provider: string,
  chargedCredits: number
) {
  shot.imageAsset = assetRelativePath(
    project.id,
    image
  );
  shot.voiceAsset = assetRelativePath(
    project.id,
    voice
  );
  shot.baseVideoAsset = assetRelativePath(
    project.id,
    rawVideo
  );
  shot.videoAsset = assetRelativePath(
    project.id,
    finalVideo
  );
  shot.status = 'ready';
  shot.error = undefined;
  shot.lastProvider = provider;
  shot.lastGenerationState = 'succeeded';
  shot.generationCount =
    (shot.generationCount || 0) +
    (chargedCredits > 0 ? 1 : 0);
  shot.estimatedSpendUsd =
    (shot.estimatedSpendUsd || 0) +
    chargedCredits * 0.01;
}

async function characterReference(
  project: FilmProject,
  characterId: string,
  stateId: string
) {
  const character = project.plan?.characters.find(
    (item) => item.id === characterId
  );
  const bible =
    project.plan?.realMotion?.characterBible.find(
      (item) => item.characterId === characterId
    );
  const state = bible?.states.find(
    (item) => item.id === stateId
  );

  const candidates = [
    state?.referenceAsset,
    bible?.bodyReferenceAsset,
    bible?.masterReferenceAsset,
    character?.referenceAsset
  ].filter((value): value is string => Boolean(value));

  for (const asset of candidates) {
    const full = assetAbsolutePath(
      project.id,
      asset
    );
    if (await exists(full)) return full;
  }

  throw new Error(
    'No existe referencia visual utilizable para ' +
      (character?.name || characterId) +
      ' / ' +
      stateId +
      '.'
  );
}

function buildIdentityIsolatedSilentPrompt(
  shot: FilmShot
) {
  return [
    shot.visualPrompt,
    'IDENTITY LOCK ABSOLUTO: la única persona visible es Sofía, niña de 10 años de la imagen de referencia.',
    'No introducir madre, adulto, hermano, doble, reflejo humano ni persona de fondo.',
    'Mantener exactamente rostro infantil, cabello, piel, edad, altura aparente y proporciones de Sofía.',
    'Boca cerrada. Sin habla. Sin morphing. Sin envejecimiento. Sin cambio de género.',
    'Una sola acción sencilla y natural.',
    'Cámara: ' + shot.camera,
    'Sin texto, subtítulos, logos ni marcas de agua.'
  ].join(' ').slice(0, 1900);
}

function buildElenaOnlyDialoguePrompt(
  shot: FilmShot
) {
  return [
    shot.visualPrompt,
    'IDENTITY LOCK ABSOLUTO: la única persona visible es Elena, mujer adulta de la imagen de referencia.',
    'No mostrar a Sofía. No mostrar a Mateo. No mostrar niños, dobles, reflejos humanos ni personas de fondo.',
    'No transformar a Elena en niña ni mezclar rasgos con Sofía.',
    'Elena es la única hablante.',
    'El audio contiene exactamente: “' +
      SCENE6B_DIALOGUE_V6 +
      '”',
    'Sincronizar labios y mandíbula con precisión.',
    'Mantener rostro adulto, cabello, piel y proporciones de Elena sin cambios.',
    'Cámara: ' + shot.camera,
    'Sin texto, subtítulos, logos, música ni diálogo adicional.'
  ].join(' ').slice(0, 2300);
}

function buildRearFamilyHugPrompt(
  shot: FilmShot
) {
  return [
    shot.visualPrompt,
    'IDENTITY/ANATOMY LOCK: exactamente tres personas y solo tres.',
    'Posiciones inmutables: Elena adulta alta en el centro, Sofía niña de 10 años a la izquierda, Mateo niño de 7 años a la derecha.',
    'Todos permanecen de espaldas a cámara durante los 4 segundos.',
    'Ningún rostro visible, ni siquiera de perfil.',
    'No intercambiar cabello, cuerpos, altura, edad, ropa ni posiciones.',
    'No fusionar cuerpos. No crear extremidades extra. No crear cuarta persona.',
    'Un solo abrazo familiar sostenido, sin soltarse y volver a abrazar.',
    'Cámara: ' + shot.camera,
    'Sin texto, subtítulos, logos ni marcas de agua.'
  ].join(' ').slice(0, 1900);
}

async function recordRunwayFailure(
  projectId: string,
  scene: FilmScene,
  shot: FilmShot,
  spendKey: string,
  model: string,
  estimatedUsd: number,
  error: unknown
) {
  const message = errorText(error);
  const taskId =
    message.match(/taskId=([0-9a-f-]{36})/i)?.[1];
  const rejectedBeforeTask =
    !taskId &&
    /Runway HTTP 400/i.test(message) &&
    /Validation of body failed/i.test(message);

  await appendSpend(projectId, {
    operation: 'video',
    provider: 'runway-direct',
    model,
    state: rejectedBeforeTask
      ? 'failed-no-charge'
      : 'failed-unknown',
    estimatedUsd,
    actualUsd:
      rejectedBeforeTask ? 0 : undefined,
    sceneId: scene.id,
    shotId: shot.id,
    characterId: shot.speakerId,
    idempotencyKey: spendKey,
    providerRequestId: taskId,
    error:
      (rejectedBeforeTask
        ? '[runway-request-rejected-no-task] '
        : '') +
      message
  });
}

async function assertRetryAvailable(
  projectId: string,
  spendKey: string,
  label: string
) {
  const previous =
    await latestSpendForKey(projectId, spendKey);
  if (!previous) return;

  if (
    previous.state === 'reserved' ||
    previous.state === 'failed-no-charge'
  ) {
    return;
  }

  throw new Error(
    'SAFE RETRY BLOCK ' +
      label +
      ': estado previo=' +
      previous.state +
      '. No se reintentará automáticamente.'
  );
}

async function assertScene6BRepairBudget(
  projectId: string,
  nextUsd: number,
  label: string
) {
  const ledger = await readSpendLedger(projectId);
  const actual = ledger
    .filter(
      (entry) =>
        (entry.idempotencyKey || '').startsWith(
          'v6safe:e6b:'
        ) &&
        entry.state === 'succeeded'
    )
    .reduce(
      (sum, entry) =>
        sum +
        (typeof entry.actualUsd === 'number'
          ? entry.actualUsd
          : 0),
      0
    );

  if (
    actual + nextUsd >
    SCENE6B_AUTHORIZED_MAX_USD_V6 + 0.0001
  ) {
    throw new Error(
      'SAFE CUMULATIVE COST GATE E6B: ya hay US$' +
        actual.toFixed(4) +
        ' confirmados; ' +
        label +
        ' añadiría US$' +
        nextUsd.toFixed(4) +
        ' y superaría US$' +
        SCENE6B_AUTHORIZED_MAX_USD_V6.toFixed(2) +
        '.'
    );
  }
}

async function withPaidGate<T>(
  run: () => Promise<T>
) {
  const oldExternal =
    process.env.ALLOW_EXTERNAL_API_CALLS;
  const oldPaid =
    process.env.ALLOW_PAID_GENERATION;
  const oldFallback =
    process.env.ALLOW_PAID_PROVIDER_FALLBACK;
  const oldProduction =
    process.env.PRODUCTION_MODE;

  process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
  process.env.ALLOW_PAID_GENERATION = 'true';
  process.env.ALLOW_PAID_PROVIDER_FALLBACK = 'false';
  process.env.PRODUCTION_MODE = 'real';

  try {
    return await run();
  } finally {
    restoreEnv(
      'ALLOW_EXTERNAL_API_CALLS',
      oldExternal
    );
    restoreEnv(
      'ALLOW_PAID_GENERATION',
      oldPaid
    );
    restoreEnv(
      'ALLOW_PAID_PROVIDER_FALLBACK',
      oldFallback
    );
    restoreEnv(
      'PRODUCTION_MODE',
      oldProduction
    );
  }
}

function assertProjectReady(project: FilmProject) {
  if (
    project.input.title.trim().toLocaleUpperCase() !==
    '15 DÍAS'
  ) {
    throw new Error(
      'Este productor solo está autorizado para 15 DÍAS.'
    );
  }
  if (
    !project.plan ||
    project.plan.scenes.length !== 6
  ) {
    throw new Error(
      'Este productor exige 15 DÍAS short de 6 escenas.'
    );
  }
  if (
    process.env.ALLOW_EXTERNAL_API_CALLS === 'true' ||
    process.env.ALLOW_PAID_GENERATION === 'true' ||
    process.env.ALLOW_PAID_PROVIDER_FALLBACK ===
      'true'
  ) {
    throw new Error(
      'Las APIs generales deben iniciar bloqueadas. Scene 6B abre únicamente cada llamada autorizada.'
    );
  }
}

function sceneByOrder(
  project: FilmProject,
  order: number
): FilmScene {
  const scene = project.plan?.scenes.find(
    (item) => item.order === order
  );
  if (!scene) {
    throw new Error(
      'No existe Escena ' + order + '.'
    );
  }
  return scene;
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function restoreEnv(
  name: string,
  value: string | undefined
) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : String(error);
}
