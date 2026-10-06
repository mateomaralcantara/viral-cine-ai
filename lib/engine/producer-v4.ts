import { access, copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Character, FilmPlan, FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import {
  assetAbsolutePath,
  assetRelativePath,
  getProject,
  projectAssetDir,
  saveProject
} from '@/lib/storage/project-store';
import { generateImage, generateImageWithReferences } from '@/lib/providers/openai-media';
import { generateFalMusic, generateFalVideo } from '@/lib/providers/fal-media';
import {
  generateVeoVideo,
  isVeoNoChargeFailure,
  isVeoQuotaFailure
} from '@/lib/providers/veo';
import { generateGeminiOmniVideo } from '@/lib/providers/google-omni';
import { isGooglePrepayDepleted } from '@/lib/providers/fal-compat';
import {
  burnSubtitles,
  concatenate,
  copyMedia,
  createPlaceholderImage,
  createSubtitles,
  mixBackgroundMusic,
  normalizeGeneratedVideo
} from '@/lib/media/ffmpeg';
import { createSyntheticMotionVideo } from '@/lib/media/synthetic-video';
import {
  publishSceneVideo,
  removePartialSceneFiles,
  renderedAssets,
  reusableSceneAssets,
  reusableShotAssets,
  saveSceneCheckpoint,
  saveShotCheckpoint,
  temporarySceneVideoPath,
  type SceneAssets
} from '@/lib/engine/scene-checkpoints';
import {
  applyQualityReport,
  reviewSceneQuality,
  shouldPauseForQuality,
  strictSceneQualityEnabled
} from '@/lib/engine/quality-review';
import { preflightPlan } from '@/lib/engine/shot-plan';
import { estimateBudget } from '@/lib/engine/budget';
import {
  assertEstimatedBudgetAllowed,
  releaseNoChargeGenerationReservation,
  reserveShotGeneration
} from '@/lib/engine/spend-guard';
import {
  assertPaidGenerationAllowed,
  assertProductionCanQueue,
  classifyProductionError,
  hasUsableCredential,
  safeErrorMessage
} from '@/lib/engine/production-safety';
import { prepareAudioFirstVoice, applyAudioFirstLipSync } from '@/lib/engine/audio-first';
import { appendSpend, assertSpendRetrySafe, estimateOperationCost } from '@/lib/engine/spend-ledger';
import { assertPilotShotBudget, pilotModeEnabled, pilotSceneLimit, pilotShotLimit } from '@/lib/engine/pilot';
import { hasMultipleDialogueSpeakers } from '@/lib/engine/speaker-resolution';
import { renderSegmentedShotReal } from '@/lib/engine/segmented-renderer-v4';
import {
  inspectSegmentedTurnVisualSources,
  turnSourceAssetMap
} from '@/lib/engine/segmented-visual-sources-v4';
import { assertCinematicVideoTrack } from '@/lib/media/probe';

const GOOGLE_BILLING_COOLDOWN_MS = 15 * 60 * 1000;
let googleBillingBlockedUntil = 0;

export async function produceProjectV4(projectId: string) {
  let project = await getProject(projectId);
  if (!project.plan) throw new Error('El proyecto todavía no tiene un plan de escenas.');
  if (!['queued', 'planned', 'failed', 'ready'].includes(project.status)) return project;

  try {
    const projectPilot = project.pilot;
    const preflightPlanInput = projectPilot?.enabled
      ? {
          ...project.plan,
          scenes: project.plan.scenes
            .slice(0, projectPilot.maxScenes)
            .map((scene) => ({
              ...scene,
              shots: scene.shots.slice(0, projectPilot.maxShotsPerScene)
            }))
        }
      : project.plan;
    const preflight = preflightPlan(preflightPlanInput);
    if (!preflight.passed) {
      throw new Error(`Preproduccion 4.0 bloqueada: ${preflight.issues.slice(0, 8).join(' | ')}`);
    }
    assertProductionCanQueue(project);
    project.budget = estimateBudget(project.input, preflightPlanInput);
    assertEstimatedBudgetAllowed(project);
    const pilot = pilotModeEnabled(project);
    project = await persist(project, {
      status: 'producing',
      error: undefined,
      progress: progress(
        pilot ? 'pilot' : 'characters',
        2,
        pilot ? 'Piloto 4.0 iniciado: audio primero, video real y lip-sync' : 'ViralCine 4.0 preparando identidades visuales y vocales',
        0,
        requirePlan(project).scenes.length
      )
    }, `Real Cinema 4.0 iniciado en modo ${pilot ? 'piloto' : 'película completa'} (${process.env.PRODUCTION_MODE === 'real' ? 'real' : 'offline'})`);

    project = await prepareCharacters(project);
    await removePartialSceneFiles(project.id);

    const scenes = requirePlan(project).scenes;
    const sceneCount = pilot ? Math.min(pilotSceneLimit(project), scenes.length) : scenes.length;
    const clips: string[] = [];

    for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex += 1) {
      let scene = requirePlan(project).scenes[sceneIndex];

      const forceSceneRegeneration = scene.shots.some((shot) => shot.qualityForceRegenerate);
      if (!pilot && !forceSceneRegeneration) {
        const reusableScene = await reusableSceneAssets(project, scene);
        if (reusableScene) {
          Object.assign(scene, reusableScene, {
            status: 'ready' as const,
            productionStrategy: 'real-cinema-v2' as const,
            error: undefined
          });
          clips.push(assetAbsolutePath(project.id, reusableScene.videoAsset));
          project.productionLog.push(`${new Date().toISOString()} Escena ${scene.order}: checkpoint de escena reutilizado sin recomponer ni regenerar`);
          project.progress = progress(
            'real-cinema',
            scenePercent(sceneIndex + 1, 0, 1, sceneCount),
            `Escena ${scene.order} reutilizada desde checkpoint validado`,
            scene.order,
            sceneCount
          );
          project = await saveProject(project);
          continue;
        }
      }

      scene.status = 'rendering';
      scene.error = undefined;
      project = await saveProject(project);

      const fullShotCount = scene.shots.length;
      const shotCount = pilot ? Math.min(pilotShotLimit(project), fullShotCount) : fullShotCount;
      const shotClips: string[] = [];

      for (let shotIndex = 0; shotIndex < shotCount; shotIndex += 1) {
        project = await produceShotV4(project, sceneIndex, shotIndex, sceneCount);
        if (project.status === 'quality-review') return project;
        const completed = requirePlan(project).scenes[sceneIndex].shots[shotIndex];
        if (!completed.videoAsset) throw new Error(`El segmento ${completed.order} terminó sin video.`);
        shotClips.push(assetAbsolutePath(project.id, completed.videoAsset));
      }

      if (pilot) {
        clips.push(...shotClips);
        scene = requirePlan(project).scenes[sceneIndex];
        scene.status = shotCount === fullShotCount ? 'ready' : 'pending';
        project.productionLog.push(
          `${new Date().toISOString()} Piloto: escena ${scene.order}, ${shotCount}/${fullShotCount} segmentos producidos y guardados`
        );
        project = await saveProject(project);
        continue;
      }

      scene = requirePlan(project).scenes[sceneIndex];
      const sceneVideo = path.join(projectAssetDir(project.id, 'video'), `scene-${pad(scene.order)}.mp4`);
      await concatenate(shotClips, sceneVideo);
      const firstShot = scene.shots[0];
      if (!firstShot?.imageAsset || !firstShot.voiceAsset) throw new Error(`La escena ${scene.order} no tiene recursos completos.`);
      const sceneAssets = renderedAssets(
        project.id,
        scene.mode === 'animated-image' ? 'ai-video' : scene.mode,
        assetAbsolutePath(project.id, firstShot.imageAsset),
        assetAbsolutePath(project.id, firstShot.voiceAsset),
        sceneVideo
      );
      await saveSceneCheckpoint(project, scene, sceneAssets);
      Object.assign(scene, sceneAssets, {
        status: 'ready' as const,
        productionStrategy: 'real-cinema-v2' as const,
        qualityScore: aggregateQuality(scene.shots),
        qualityAttempts: Math.max(0, ...scene.shots.map((shot) => shot.qualityAttempts || 0)),
        qualityIssues: undefined,
        error: undefined
      });
      clips.push(sceneVideo);
      project.productionLog.push(`${new Date().toISOString()} Escena ${scene.order} terminada con Real Cinema 4.0`);
      project.progress = progress('real-cinema', scenePercent(sceneIndex + 1, 0, 1, sceneCount), `Escena ${scene.order} aprobada y guardada`, scene.order, sceneCount);
      project = await saveProject(project);
    }

    if (pilot) {
      const exportsDir = projectAssetDir(project.id, 'exports');
      const pilotVideo = path.join(exportsDir, 'piloto-real-cinema.mp4');
      await concatenate(clips, pilotVideo);
      project.finalVideoAsset = assetRelativePath(project.id, pilotVideo);
      project = await persist(project, {
        status: 'ready',
        progress: progress('pilot-ready', 100, 'Piloto terminado. Revisa voz, movimiento, identidad y lip-sync antes de desactivar PILOT_MODE.', sceneCount, sceneCount)
      }, 'Piloto Real Cinema 4.0 terminado; producción completa permanece bloqueada mientras PILOT_MODE=true');
      return project;
    }

    project = await persist(project, {
      status: 'composing',
      progress: progress('composition', 90, 'Uniendo escenas, voces, música y subtítulos', scenes.length, scenes.length)
    }, 'Montaje final 4.0 iniciado');

    const exportsDir = projectAssetDir(project.id, 'exports');
    const joined = path.join(exportsDir, 'joined.mp4');
    await concatenate(clips, joined);

    const subtitles = path.join(exportsDir, 'subtitles.srt');
    await createSubtitles(requirePlan(project).scenes, subtitles);
    project.subtitleAsset = assetRelativePath(project.id, subtitles);

    let audioMixed = joined;
    if (project.input.generateMusic) {
      const music = await prepareMusic(project);
      if (music) {
        const mixed = path.join(exportsDir, 'mixed.mp4');
        await mixBackgroundMusic(joined, music, mixed);
        audioMixed = mixed;
        project.musicAsset = assetRelativePath(project.id, music);
      }
    }

    const finalVideo = path.join(exportsDir, 'pelicula-final.mp4');
    if (project.input.burnSubtitles) await burnSubtitles(audioMixed, subtitles, finalVideo);
    else await copyMedia(audioMixed, finalVideo);

    project.finalVideoAsset = assetRelativePath(project.id, finalVideo);
    return persist(project, {
      status: 'ready',
      progress: progress('ready', 100, 'Película Real Cinema 4.0 lista para descargar', scenes.length, scenes.length)
    }, 'Película final 4.0 terminada');
  } catch (error) {
    const kind = classifyProductionError(error);
    project.status = kind === 'billing' ? 'paused-billing' : kind === 'safety' ? 'paused-safety' : 'failed';
    project.error = messageOf(error);
    project.progress = progress(project.status, project.progress.percent, project.error, project.progress.currentScene, project.progress.totalScenes);
    project.productionLog.push(`${new Date().toISOString()} Real Cinema 4.0 pausado (${kind}): ${project.error}`);
    await saveProject(project);
    return project;
  }
}

async function produceShotV4(project: FilmProject, sceneIndex: number, shotIndex: number, totalScenes: number) {
  let scene = requirePlan(project).scenes[sceneIndex];
  let shot = scene.shots[shotIndex];
  const reusable = shot.qualityForceRegenerate ? undefined : await reusableShotAssets(project, scene, shot);
  if (reusable) {
    Object.assign(shot, reusable, { status: 'ready' as const, error: undefined });
    project.productionLog.push(`${new Date().toISOString()} Escena ${scene.order}, segmento ${shot.order}: checkpoint reutilizado`);
    return saveProject(project);
  }

  if (pilotModeEnabled(project)) await assertPilotShotBudget(project, shot);
  shot.status = 'rendering';
  shot.error = undefined;
  scene.status = 'rendering';
  project.progress = progress(
    'real-cinema',
    scenePercent(sceneIndex, shotIndex, scene.shots.length, totalScenes),
    `Escena ${scene.order}, segmento ${shot.order}: voz → video → lip-sync`,
    scene.order,
    totalScenes
  );
  project = await saveProject(project);
  scene = requirePlan(project).scenes[sceneIndex];
  shot = scene.shots[shotIndex];

  try {
    const rendered = await renderShotV4(project, scene, shot);
    Object.assign(shot, rendered);
    await saveShotCheckpoint(project, scene, shot, rendered);

    if (strictSceneQualityEnabled()) {
      const estimatedUsd = estimateOperationCost('audit', 1);
      const auditAttempt = Math.max(1, shot.generationCount || 1);
      const idempotencyKey = `audit:${shot.id}:${auditAttempt}`;
      await appendSpend(project.id, {
        operation: 'audit', provider: 'openai', model: process.env.OPENAI_QUALITY_MODEL,
        state: 'submitted', estimatedUsd, sceneId: scene.id, shotId: shot.id, idempotencyKey
      });
      try {
        const reviewed = await reviewSceneQuality(project, scene, rendered, auditAttempt, shot);
        applyQualityReport(shot, reviewed.report, reviewed.reportAsset);
        await appendSpend(project.id, {
          operation: 'audit', provider: 'openai', model: process.env.OPENAI_QUALITY_MODEL,
          state: 'succeeded', estimatedUsd, sceneId: scene.id, shotId: shot.id, idempotencyKey,
          outputAsset: reviewed.reportAsset
        });
        if (shouldPauseForQuality(reviewed.report)) {
          shot.status = 'review-required';
          shot.error = `El segmento obtuvo ${reviewed.report.overallScore}/10 y requiere revisión manual.`;
          scene.status = 'review-required';
          scene.qualityScore = shot.qualityScore;
          scene.qualityAttempts = shot.qualityAttempts;
          scene.qualityIssues = shot.qualityIssues;
          scene.qualityReportAsset = shot.qualityReportAsset;
          scene.error = `Segmento ${shot.order}: ${shot.error}`;
          project.status = 'quality-review';
          project.progress = progress('quality-review', project.progress.percent, `Revisa escena ${scene.order}, segmento ${shot.order}`, scene.order, totalScenes);
          project.productionLog.push(`${new Date().toISOString()} Pausa manual por calidad en escena ${scene.order}, segmento ${shot.order}`);
          return saveProject(project);
        }
      } catch (error) {
        await appendSpend(project.id, {
          operation: 'audit', provider: 'openai', model: process.env.OPENAI_QUALITY_MODEL,
          state: 'failed-unknown', estimatedUsd, sceneId: scene.id, shotId: shot.id, idempotencyKey,
          error: messageOf(error)
        });
        throw error;
      }
    }

    shot.status = 'ready';
    shot.error = undefined;
    shot.qualityForceRegenerate = false;
    shot.pipelineVersion = hasMultipleDialogueSpeakers(shot) ? '4.1-segmented-visual-turns' : '4.0-audio-first';
    scene.status = 'rendering';
    project.productionLog.push(`${new Date().toISOString()} Escena ${scene.order}, segmento ${shot.order} terminado con Real Cinema 4.0`);
    return saveProject(project);
  } catch (error) {
    shot.status = 'failed';
    shot.error = messageOf(error);
    scene.status = 'failed';
    scene.error = `Segmento ${shot.order}: ${shot.error}`;
    project.productionLog.push(`${new Date().toISOString()} Escena ${scene.order}, segmento ${shot.order} falló: ${shot.error}`);
    throw error;
  }
}

async function renderShotV4(project: FilmProject, scene: FilmScene, shot: FilmShot): Promise<SceneAssets> {
  if (!project.plan) throw new Error('Plan ausente');
  if (hasMultipleDialogueSpeakers(shot) && process.env.PRODUCTION_MODE === 'real') {
    return renderMixedShotV4(project, scene, shot);
  }
  const activeCharacterIds = shot.characterIds.length ? shot.characterIds : scene.characterIds;
  const characters = activeCharacterIds
    .map((id) => project.plan?.characters.find((character) => character.id === id))
    .filter((character): character is Character => Boolean(character));
  const speaker = shot.speakerId && shot.speakerId !== 'narrator'
    ? project.plan.characters.find((character) => character.id === shot.speakerId)
    : undefined;
  const lead = speaker || characters[0] || project.plan.characters[0];
  if (!lead?.referenceAsset) throw new Error('El segmento no tiene un personaje con referencia visual.');

  const key = `scene-${pad(scene.order)}-shot-${padShot(shot.order)}`;
  const preparedVoice = await prepareAudioFirstVoice(project, scene, shot, key);
  const voicePath = preparedVoice.voicePath;
  shot.voiceAsset = assetRelativePath(project.id, voicePath);
  if (preparedVoice.alignmentPath) shot.alignmentAsset = assetRelativePath(project.id, preparedVoice.alignmentPath);

  const imagePath = path.join(projectAssetDir(project.id, 'images'), `${key}.png`);
  const rawBasePath = path.join(projectAssetDir(project.id, 'video'), `${key}-base-raw.mp4`);
  const normalizedBasePath = path.join(projectAssetDir(project.id, 'video'), `${key}-base.mp4`);
  const lipSyncRawPath = path.join(projectAssetDir(project.id, 'video'), `${key}-lipsync-raw.mp4`);
  const normalizedPath = path.join(projectAssetDir(project.id, 'video'), `${key}.mp4`);

  if (shot.qualityForceRegenerate) {
    const archiveDir = path.join(projectAssetDir(project.id, 'video'), 'rejected');
    await mkdir(archiveDir, { recursive: true });

    if (await fileExists(normalizedPath)) {
      const archivePath = path.join(
        archiveDir,
        `${key}-attempt-${Math.max(1, shot.generationCount || 1)}.mp4`
      );
      await copyFile(normalizedPath, archivePath);
      project.productionLog.push(
        `${new Date().toISOString()} Intento rechazado archivado: ${assetRelativePath(project.id, archivePath)}`
      );
    }

    await Promise.all([
      rm(imagePath, { force: true }),
      rm(rawBasePath, { force: true }),
      rm(normalizedBasePath, { force: true }),
      rm(lipSyncRawPath, { force: true }),
      rm(normalizedPath, { force: true })
    ]);

    shot.imageAsset = undefined;
    shot.baseVideoAsset = undefined;
    shot.lipSyncAsset = undefined;
    shot.videoAsset = undefined;
  }

  await prepareShotReferenceFrame(project, scene, shot, characters, imagePath);
  shot.imageAsset = assetRelativePath(project.id, imagePath);
  if (!(await fileExists(normalizedBasePath))) {
    if (process.env.PRODUCTION_MODE === 'real') {
      if (!(shot.lastGenerationState === 'succeeded' && await fileExists(rawBasePath))) {
        const result = await generateBaseVideo(project, scene, shot, [imagePath, ...characters.map((character) => assetAbsolutePath(project.id, character.referenceAsset!))], rawBasePath);
        shot.lastProvider = result.provider;
      }
      await normalizeGeneratedVideo(rawBasePath, voicePath, shot.durationSeconds, normalizedBasePath, project.input.aspectRatio);
    } else {
      await createSyntheticMotionVideo(shot.durationSeconds, rawBasePath, project.input.aspectRatio);
      await normalizeGeneratedVideo(rawBasePath, voicePath, shot.durationSeconds, normalizedBasePath, project.input.aspectRatio);
      shot.lastProvider = 'offline-synthetic-video';
      shot.lastGenerationState = 'succeeded';
    }
  }
  shot.baseVideoAsset = assetRelativePath(project.id, normalizedBasePath);

  let sourceForFinal = normalizedBasePath;
  if (shot.spokenText.trim()) {
    if (!(await fileExists(lipSyncRawPath))) await applyAudioFirstLipSync(project, scene, shot, normalizedBasePath, voicePath, lipSyncRawPath);
    sourceForFinal = lipSyncRawPath;
    shot.lipSyncAsset = assetRelativePath(project.id, lipSyncRawPath);
  }

  const partialPath = temporarySceneVideoPath(normalizedPath);
  try {
    await normalizeGeneratedVideo(sourceForFinal, voicePath, shot.durationSeconds, partialPath, project.input.aspectRatio);
    await publishSceneVideo(partialPath, normalizedPath, shot.durationSeconds, {
      requireAudibleAudio: Boolean(shot.spokenText.trim()),
      requireMotion: true
    });
  } finally {
    await rm(partialPath, { force: true });
  }
  shot.videoAsset = assetRelativePath(project.id, normalizedPath);
  shot.pipelineVersion = '4.0-audio-first';
  return renderedAssets(project.id, shot.mode, imagePath, voicePath, normalizedPath);
}

export type MixedShotVisualSourceInspection = {
  selectedAsset?: string;
  selectedPath?: string;
  selectedKind?: 'repaired' | 'base' | 'video';
  referenceImageAsset?: string;
  needsGeneration: boolean;
  rejected: Array<{ asset: string; reason: string }>;
};

export async function inspectMixedShotVisualSource(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot
): Promise<MixedShotVisualSourceInspection> {
  const paths = mixedShotSourcePaths(project, scene, shot);
  const repairedAsset = assetRelativePath(project.id, paths.videoPath);
  const rejected: MixedShotVisualSourceInspection['rejected'] = [];
  const candidates = [
    { kind: 'repaired' as const, asset: repairedAsset },
    shot.baseVideoAsset ? { kind: 'base' as const, asset: shot.baseVideoAsset } : undefined,
    shot.videoAsset ? { kind: 'video' as const, asset: shot.videoAsset } : undefined
  ].filter((value): value is { kind: 'repaired' | 'base' | 'video'; asset: string } => Boolean(value));

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.asset)) continue;
    seen.add(candidate.asset);
    const absolute = assetAbsolutePath(project.id, candidate.asset);
    try {
      await access(absolute);
      await assertCinematicVideoTrack(absolute, shot.durationSeconds);
      return {
        selectedAsset: candidate.asset,
        selectedPath: absolute,
        selectedKind: candidate.kind,
        referenceImageAsset: await fileExists(paths.referenceImagePath)
          ? assetRelativePath(project.id, paths.referenceImagePath)
          : undefined,
        needsGeneration: false,
        rejected
      };
    } catch (error) {
      rejected.push({ asset: candidate.asset, reason: messageOf(error) });
    }
  }

  return {
    needsGeneration: true,
    referenceImageAsset: await fileExists(paths.referenceImagePath)
      ? assetRelativePath(project.id, paths.referenceImagePath)
      : undefined,
    rejected
  };
}

export async function ensureMixedShotVisualSourceReal(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot
): Promise<MixedShotVisualSourceInspection> {
  const current = await inspectMixedShotVisualSource(project, scene, shot);
  if (!current.needsGeneration && current.selectedAsset && current.selectedPath) return current;

  if (process.env.PRODUCTION_MODE !== 'real') {
    throw new Error(
      'La toma multihablante no tiene una fuente visual cinematográfica válida y el modo actual no permite regenerarla.'
    );
  }
  assertPaidGenerationAllowed('generar video base real para toma multihablante');

  if (!project.plan) throw new Error('Plan ausente');
  const activeCharacterIds = shot.characterIds.length ? shot.characterIds : scene.characterIds;
  const characters = activeCharacterIds
    .map((id) => project.plan?.characters.find((character) => character.id === id))
    .filter((character): character is Character => Boolean(character));

  if (!hasUsableCredential('OPENAI_API_KEY')) {
    throw new Error(
      'La fuente visual requiere regeneración y falta OPENAI_API_KEY para crear un fotograma de referencia real. ' +
      'No se usará un placeholder en producción.'
    );
  }

  const paths = mixedShotSourcePaths(project, scene, shot);
  await Promise.all([
    mkdir(path.dirname(paths.referenceImagePath), { recursive: true }),
    mkdir(path.dirname(paths.videoPath), { recursive: true })
  ]);

  if (!(await fileExists(paths.referenceImagePath))) {
    await prepareShotReferenceFrame(project, scene, shot, characters, paths.referenceImagePath);
  }

  if (await fileExists(paths.videoPath)) {
    try {
      await assertCinematicVideoTrack(paths.videoPath, shot.durationSeconds);
      return {
        selectedAsset: assetRelativePath(project.id, paths.videoPath),
        selectedPath: paths.videoPath,
        selectedKind: 'repaired',
        referenceImageAsset: assetRelativePath(project.id, paths.referenceImagePath),
        needsGeneration: false,
        rejected: current.rejected
      };
    } catch (error) {
      throw new Error(
        'Existe un video base reparado pero no supera la validación visual. ' +
        'No se sobrescribirá automáticamente: ' + messageOf(error)
      );
    }
  }

  const referencePaths = [
    paths.referenceImagePath,
    ...characters
      .map((character) => character.referenceAsset)
      .filter((asset): asset is string => Boolean(asset))
      .map((asset) => assetAbsolutePath(project.id, asset))
  ];

  await generateBaseVideo(project, scene, shot, referencePaths, paths.videoPath);
  await assertCinematicVideoTrack(paths.videoPath, shot.durationSeconds);

  return {
    selectedAsset: assetRelativePath(project.id, paths.videoPath),
    selectedPath: paths.videoPath,
    selectedKind: 'repaired',
    referenceImageAsset: assetRelativePath(project.id, paths.referenceImagePath),
    needsGeneration: false,
    rejected: current.rejected
  };
}

function mixedShotSourcePaths(project: FilmProject, scene: FilmScene, shot: FilmShot) {
  const folder = `scene-${pad(scene.order)}-shot-${padShot(shot.order)}-${shot.id}`;
  return {
    referenceImagePath: path.join(
      projectAssetDir(project.id, 'images'),
      'segmented-v4-source',
      folder,
      'reference.png'
    ),
    videoPath: path.join(
      projectAssetDir(project.id, 'video'),
      'segmented-v4-source',
      folder,
      'base-real.mp4'
    )
  };
}

async function renderMixedShotV4(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot
): Promise<SceneAssets> {
  if (!project.plan) throw new Error('Plan ausente');

  // 4.1: mixed dialogue no longer reuses one crowded base video for every speaker.
  // Each temporal turn must have its own manually reviewable visual source.
  const visualTurns = await inspectSegmentedTurnVisualSources(project, scene, shot);
  if (!visualTurns.allVideosReady) {
    const pending = visualTurns.turns
      .filter((turn) => !turn.videoReady)
      .map((turn) => turn.index + ':' + turn.speakerLabel)
      .join(', ');
    throw new Error(
      'Toma multihablante bloqueada: faltan fuentes visuales 4.1 por turno (' + pending + '). ' +
      'Ejecuta primero npm run visual:turns -- preview <projectId> <shotId>, ' +
      'genera/revisa referencias y luego videos con autorización explícita.'
    );
  }

  const turnSources = turnSourceAssetMap(visualTurns);
  const firstTurn = visualTurns.turns[0];
  const firstVideoAsset = firstTurn?.videoAsset;
  const imageAsset =
    visualTurns.turns.find((turn) => turn.referenceReady)?.referenceAsset ||
    shot.imageAsset;

  if (!firstVideoAsset || !imageAsset) {
    throw new Error('La toma multihablante no tiene fuentes visuales 4.1 completas.');
  }

  const renderShot: FilmShot = {
    ...shot,
    baseVideoAsset: firstVideoAsset,
    videoAsset: firstVideoAsset
  };
  const result = await renderSegmentedShotReal(
    project,
    scene,
    renderShot,
    { turnSourceAssets: turnSources }
  );

  shot.baseVideoAsset = firstVideoAsset;
  shot.imageAsset = imageAsset;
  shot.voiceAsset = result.masterAudioAsset;
  shot.lipSyncAsset = result.lipSyncTurns > 0 ? result.outputAsset : undefined;
  shot.videoAsset = result.outputAsset;
  shot.lastProvider = result.lipSyncTurns > 0
    ? 'segmented-visual-turns-elevenlabs-fal'
    : 'segmented-visual-turns-elevenlabs';
  shot.lastGenerationState = 'succeeded';
  shot.pipelineVersion = '4.1-segmented-visual-turns';

  return {
    mode: shot.mode,
    imageAsset,
    voiceAsset: result.masterAudioAsset,
    videoAsset: result.outputAsset
  };
}

async function prepareShotReferenceFrame(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot,
  characters: Character[],
  imagePath: string
) {
  if (await fileExists(imagePath)) return imagePath;
  const realMotionBible = project.plan?.realMotion?.characterBible || [];
  const referenceAssets = characters.flatMap((character) => {
    const bible = realMotionBible.find(
      (entry) => entry.characterId === character.id
    );
    const stateId = shot.characterStateIds?.[character.id];
    const state = bible?.states.find((item) => item.id === stateId);

    return [
      character.referenceAsset,
      bible?.masterReferenceAsset,
      bible?.bodyReferenceAsset,
      state?.referenceAsset
    ].filter((asset): asset is string => Boolean(asset));
  });
  const characterReferences = [...new Set(referenceAssets)]
    .map((asset) => assetAbsolutePath(project.id, asset));

  const continuity = characters
    .map((character) => {
      const bible = realMotionBible.find(
        (entry) => entry.characterId === character.id
      );
      const stateId = shot.characterStateIds?.[character.id];
      const state = bible?.states.find((item) => item.id === stateId);

      if (!bible) {
        return `${character.name}: ${character.appearance}; wardrobe: ${character.wardrobe}`;
      }

      return [
        `${character.name}: ${bible.identityLock}`,
        state ? `Estado obligatorio: ${state.label}.` : '',
        state ? `Apariencia: ${state.appearance}.` : '',
        state ? `Vestuario: ${state.wardrobe}.` : '',
        state ? `Condición física: ${state.physicalCondition}.` : '',
        state ? `Actuación: ${state.performanceNotes}.` : ''
      ].filter(Boolean).join(' ');
    })
    .join(' | ');

  if (process.env.PRODUCTION_MODE === 'real' && hasUsableCredential('OPENAI_API_KEY')) {
    const estimatedUsd = estimateOperationCost('image', 1);
    const imageAttempt = Math.max(1, (shot.generationCount || 0) + 1);
    const idempotencyKey = `image:${shot.id}:${imageAttempt}`;
    await assertSpendRetrySafe(project.id, idempotencyKey, 'imagen de referencia OpenAI');
    await appendSpend(project.id, {
      operation: 'image', provider: 'openai', model: process.env.OPENAI_IMAGE_MODEL,
      state: 'submitted', estimatedUsd, sceneId: scene.id, shotId: shot.id, idempotencyKey
    });
    try {
      await generateImageWithReferences(
        characterReferences,
        `${shot.visualPrompt} Continuity bible: ${continuity}. Camera: ${shot.camera}. ${project.plan?.creativeDirection || ''}. Reference frame only; final output must be moving video. No text, subtitles or logos.`,
        imagePath
      );
      await appendSpend(project.id, {
        operation: 'image', provider: 'openai', model: process.env.OPENAI_IMAGE_MODEL,
        state: 'succeeded', estimatedUsd, sceneId: scene.id, shotId: shot.id, idempotencyKey,
        outputAsset: imagePath
      });
    } catch (error) {
      const authRejected = isOpenAIAuthRejected(error);
      await appendSpend(project.id, {
        operation: 'image', provider: 'openai', model: process.env.OPENAI_IMAGE_MODEL,
        state: authRejected ? 'failed-no-charge' : 'failed-unknown',
        estimatedUsd, actualUsd: authRejected ? 0 : undefined,
        sceneId: scene.id, shotId: shot.id, idempotencyKey,
        error: messageOf(error)
      });
      throw error;
    }
  } else {
    await createPlaceholderImage(shot.title, shot.visualPrompt, imagePath, project.input);
  }
  return imagePath;
}

async function generateBaseVideo(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot,
  referencePaths: string[],
  outputPath: string
): Promise<{ outputPath: string; provider: string }> {
  const provider = (process.env.VIDEO_PROVIDER || 'auto').toLowerCase();
  const prompt = `${shot.visualPrompt} Camera: ${shot.camera}. Duration exactly ${shot.durationSeconds} seconds. Generate natural motion only; do not generate dialogue or subtitles.`.trim();
  type VideoAttempt = {
    id: 'omni' | 'veo' | 'fal-video';
    name: string;
    family: 'google' | 'fal';
    enabled: boolean;
    model?: string;
    run: () => Promise<unknown>;
  };

  const hasShotRouting = Boolean(shot.motionSpec?.preferredProviders?.length);

  const allAttempts: VideoAttempt[] = [
    {
      id: 'omni',
      name: 'Gemini Omni',
      family: 'google',
      model: process.env.GEMINI_OMNI_VIDEO_MODEL,
      enabled:
        hasUsableCredential('GEMINI_API_KEY') &&
        !hasShotRouting &&
        (provider === 'auto' || provider === 'omni'),
      run: () =>
        generateGeminiOmniVideo(
          referencePaths,
          prompt,
          project.input,
          outputPath
        )
    },
    {
      id: 'veo',
      name: 'Veo',
      family: 'google',
      model: process.env.GEMINI_VIDEO_MODEL,
      enabled:
        hasUsableCredential('GEMINI_API_KEY') &&
        (
          hasShotRouting ||
          provider === 'auto' ||
          provider === 'veo'
        ),
      run: () =>
        generateVeoVideo(
          referencePaths[0],
          prompt,
          project.input,
          outputPath,
          shot.durationSeconds
        )
    },
    {
      id: 'fal-video',
      name: 'Fal.ai video general',
      family: 'fal',
      model: process.env.FAL_VIDEO_MODEL,
      enabled:
        hasUsableCredential('FAL_KEY') &&
        (
          hasShotRouting ||
          provider === 'auto' ||
          provider === 'fal'
        ),
      run: () =>
        generateFalVideo(
          referencePaths[0],
          prompt,
          outputPath,
          shot.durationSeconds
        )
    }
  ];

  const preferredProviders =
    shot.motionSpec?.preferredProviders?.filter(
      (providerId) =>
        providerId === 'veo' || providerId === 'fal-video'
    ) || [];

  const attempts =
    preferredProviders.length > 0
      ? preferredProviders.flatMap((providerId) =>
          allAttempts.filter((attempt) => attempt.id === providerId)
        )
      : allAttempts;
  const errors: string[] = [];
  const allowFallback = process.env.ALLOW_PAID_PROVIDER_FALLBACK === 'true';

  for (const attempt of attempts) {
    if (!attempt.enabled) continue;
    if (attempt.family === 'google' && Date.now() < googleBillingBlockedUntil) {
      errors.push(`${attempt.name}: omitido temporalmente por bloqueo de facturación Google`);
      continue;
    }
    let submitted = false;
    let idempotencyKey = '';
    let reservedUsd = estimateOperationCost('video', shot.durationSeconds);
    try {
      const reservation = reserveShotGeneration(project, scene, shot);
      reservedUsd = reservation.reservedUsd;
      idempotencyKey = `video:${shot.id}:${reservation.generationNumber}`;
      shot.lastProvider = attempt.name;
      shot.lastGenerationState = 'reserved';
      await appendSpend(project.id, {
        operation: 'video', provider: attempt.name, model: attempt.model,
        state: 'reserved', estimatedUsd: reservedUsd, sceneId: scene.id, shotId: shot.id, idempotencyKey
      });
      await saveProject(project);
      await appendSpend(project.id, {
        operation: 'video', provider: attempt.name, model: attempt.model,
        state: 'submitted', estimatedUsd: reservedUsd, sceneId: scene.id, shotId: shot.id, idempotencyKey
      });
      submitted = true;
      await attempt.run();
      shot.lastGenerationState = 'succeeded';
      await appendSpend(project.id, {
        operation: 'video', provider: attempt.name, model: attempt.model,
        state: 'succeeded', estimatedUsd: reservedUsd, sceneId: scene.id, shotId: shot.id, idempotencyKey,
        outputAsset: outputPath
      });
      await saveProject(project);
      return { outputPath, provider: attempt.name };
    } catch (error) {
      const message = messageOf(error);
      errors.push(`${attempt.name}: ${message}`);

      const safeNoCharge =
        attempt.id === 'veo' &&
        (isVeoQuotaFailure(error) || isVeoNoChargeFailure(error));

      if (submitted) {
        if (safeNoCharge) {
          releaseNoChargeGenerationReservation(shot, reservedUsd);
          await appendSpend(project.id, {
            operation: 'video',
            provider: attempt.name,
            model: attempt.model,
            state: 'failed-no-charge',
            estimatedUsd: reservedUsd,
            actualUsd: 0,
            sceneId: scene.id,
            shotId: shot.id,
            idempotencyKey:
              idempotencyKey || `video:${shot.id}:unknown`,
            error: message
          });
        } else {
          shot.lastGenerationState = 'failed-unknown';
          await appendSpend(project.id, {
            operation: 'video',
            provider: attempt.name,
            model: attempt.model,
            state: 'failed-unknown',
            estimatedUsd: reservedUsd,
            sceneId: scene.id,
            shotId: shot.id,
            idempotencyKey:
              idempotencyKey || `video:${shot.id}:unknown`,
            error: message
          });
        }
        await saveProject(project);
      }

      if (attempt.family === 'google' && isGooglePrepayDepleted(message)) {
        googleBillingBlockedUntil = Date.now() + GOOGLE_BILLING_COOLDOWN_MS;
      }

      // Un fallo Veo confirmado como no-cobrable puede pasar al siguiente
      // proveedor de la ruta sin duplicar gasto. Cualquier estado de cobro
      // desconocido sigue deteniendo la toma.
      if (safeNoCharge) continue;

      const kind = classifyProductionError(error);
      if (kind !== 'technical' || !allowFallback) throw error;
    }
  }

  if (!attempts.some((attempt) => attempt.enabled)) {
    throw new Error('Real Cinema 4.0 sin proveedor de video: configura GEMINI_API_KEY o FAL_KEY. No existe fallback a fotografía animada.');
  }
  throw new Error(`Todos los proveedores de video base fallaron. ${errors.join(' | ')}`);
}

async function prepareCharacters(project: FilmProject) {
  if (!project.plan) return project;
  for (let index = 0; index < requirePlan(project).characters.length; index += 1) {
    const character = requirePlan(project).characters[index];
    if (character.referenceAsset) {
      try {
        await access(assetAbsolutePath(project.id, character.referenceAsset));
        continue;
      } catch {
        character.referenceAsset = undefined;
      }
    }

    const destination = path.join(projectAssetDir(project.id, 'images'), `character-${character.id}.png`);
    if (process.env.PRODUCTION_MODE === 'real' && hasUsableCredential('OPENAI_API_KEY')) {
      const estimatedUsd = estimateOperationCost('image', 1);
      const idempotencyKey = `character-image:${character.id}`;
      await assertSpendRetrySafe(project.id, idempotencyKey, 'imagen de personaje OpenAI');
      await appendSpend(project.id, {
        operation: 'image', provider: 'openai', model: process.env.OPENAI_IMAGE_MODEL,
        state: 'submitted', estimatedUsd, characterId: character.id, idempotencyKey
      });
      try {
        await generateImage(
          `${character.imagePrompt} ${character.appearance}. Wardrobe: ${character.wardrobe}. Clean character reference, neutral background, front-facing, no text, no logo.`,
          destination
        );
        await appendSpend(project.id, {
          operation: 'image', provider: 'openai', model: process.env.OPENAI_IMAGE_MODEL,
          state: 'succeeded', estimatedUsd, characterId: character.id, idempotencyKey, outputAsset: destination
        });
      } catch (error) {
        const authRejected = isOpenAIAuthRejected(error);
        await appendSpend(project.id, {
          operation: 'image', provider: 'openai', model: process.env.OPENAI_IMAGE_MODEL,
          state: authRejected ? 'failed-no-charge' : 'failed-unknown',
          estimatedUsd, actualUsd: authRejected ? 0 : undefined,
          characterId: character.id, idempotencyKey, error: messageOf(error)
        });
        throw error;
      }
    } else {
      await createPlaceholderImage(character.name, character.appearance, destination, project.input);
    }
    character.referenceAsset = assetRelativePath(project.id, destination);
    project.productionLog.push(`${new Date().toISOString()} Referencia visual preparada para ${character.name}`);
    project = await saveProject(project);
  }
  return project;
}

async function prepareMusic(project: FilmProject) {
  if (!project.plan || process.env.PRODUCTION_MODE !== 'real' || !hasUsableCredential('FAL_KEY')) return undefined;
  const output = path.join(projectAssetDir(project.id, 'audio'), 'soundtrack.mp3');
  if (await fileExists(output)) return output;
  const seconds = Math.min(180, project.input.durationMinutes * 60);
  const estimatedUsd = estimateOperationCost('music', seconds);
  const idempotencyKey = `music:${project.id}`;
  await appendSpend(project.id, {
    operation: 'music', provider: 'fal', model: process.env.FAL_MUSIC_MODEL,
    state: 'submitted', estimatedUsd, idempotencyKey
  });
  try {
    await generateFalMusic(project.plan.musicPrompt, seconds, output);
    await appendSpend(project.id, {
      operation: 'music', provider: 'fal', model: process.env.FAL_MUSIC_MODEL,
      state: 'succeeded', estimatedUsd, idempotencyKey, outputAsset: output
    });
    return output;
  } catch (error) {
    await appendSpend(project.id, {
      operation: 'music', provider: 'fal', model: process.env.FAL_MUSIC_MODEL,
      state: 'failed-unknown', estimatedUsd, idempotencyKey, error: messageOf(error)
    });
    project.productionLog.push(`${new Date().toISOString()} Música omitida: ${messageOf(error)}`);
    await saveProject(project);
    return undefined;
  }
}

async function persist(project: FilmProject, changes: Partial<FilmProject>, logMessage?: string) {
  Object.assign(project, changes);
  if (logMessage) project.productionLog.push(`${new Date().toISOString()} ${logMessage}`);
  return saveProject(project);
}

function progress(phase: string, percent: number, message: string, currentScene?: number, totalScenes?: number) {
  return { phase, percent, message, currentScene, totalScenes, updatedAt: new Date().toISOString() };
}

function scenePercent(sceneIndex: number, shotIndex: number, shotCount: number, totalScenes: number) {
  const sceneFraction = sceneIndex + shotIndex / Math.max(1, shotCount);
  return Math.min(87, 5 + Math.round((sceneFraction / Math.max(1, totalScenes)) * 82));
}

function aggregateQuality(shots: FilmShot[]) {
  const scores = shots.map((shot) => shot.qualityScore).filter((score): score is number => score !== undefined);
  if (!scores.length) return undefined;
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100;
}

function isOpenAIAuthRejected(error: unknown) {
  const candidate = error as {
    status?: number;
    code?: string;
    error?: { code?: string; type?: string };
  };
  const status = candidate?.status;
  const code = candidate?.code || candidate?.error?.code;
  const type = candidate?.error?.type;
  return status === 401 || code === 'invalid_api_key' || type === 'invalid_request_error' && code === 'invalid_api_key';
}

const pad = (value: number) => String(value).padStart(3, '0');
const padShot = (value: number) => String(value).padStart(2, '0');
const messageOf = safeErrorMessage;
async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
function requirePlan(project: FilmProject): FilmPlan {
  if (!project.plan) throw new Error('El proyecto no tiene plan de producción.');
  return project.plan;
}
