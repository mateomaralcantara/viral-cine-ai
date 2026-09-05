import { access, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Character, FilmPlan, FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import {
  assetAbsolutePath,
  assetRelativePath,
  getProject,
  projectAssetDir,
  saveProject
} from '@/lib/storage/project-store';
import { generateImage, generateImageWithReferences, generateSpeech } from '@/lib/providers/openai-media';
import { generateFalAvatar, generateFalMusic, generateFalVideo } from '@/lib/providers/fal-media';
import { generateVeoVideo } from '@/lib/providers/veo';
import { generateGeminiOmniVideo } from '@/lib/providers/google-omni';
import { isGooglePrepayDepleted } from '@/lib/providers/fal-compat';
import {
  burnSubtitles,
  concatenate,
  copyMedia,
  createPlaceholderImage,
  createSilenceAudio,
  createSubtitles,
  mixBackgroundMusic,
  normalizeGeneratedVideo,
  renderAnimatedImage
} from '@/lib/media/ffmpeg';
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
  latestSceneQualityReportAsset,
  readLatestSceneQualityReport,
  reviewSceneQuality,
  sceneQualityMaxAttempts,
  shouldPauseForQuality,
  strictSceneQualityEnabled
} from '@/lib/engine/quality-review';
import { preflightPlan } from '@/lib/engine/shot-plan';
import { estimateBudget } from '@/lib/engine/budget';
import { assertEstimatedBudgetAllowed, reserveShotGeneration } from '@/lib/engine/spend-guard';
import {
  assertProductionCanQueue,
  classifyProductionError,
  hasUsableCredential,
  safeErrorMessage
} from '@/lib/engine/production-safety';

const GOOGLE_BILLING_COOLDOWN_MS = 15 * 60 * 1000;
let googleBillingBlockedUntil = 0;

export async function produceProject(projectId: string) {
  let project = await getProject(projectId);
  if (!project.plan) throw new Error('El proyecto todavía no tiene un plan de escenas.');
  if (!['queued', 'planned', 'failed'].includes(project.status)) return project;

  try {
    const preflight = preflightPlan(project.plan);
    if (!preflight.passed) {
      throw new Error(
        `Preproduccion bloqueada antes de consumir video: ${preflight.issues.slice(0, 8).join(' | ')}`
      );
    }
    assertProductionCanQueue(project);
    project.budget = estimateBudget(project.input, project.plan);
    assertEstimatedBudgetAllowed(project);
    project = await persist(project, {
      status: 'producing',
      error: undefined,
      progress: progress('characters', 2, 'Preflight 10/10; preparando identidades visuales', 0, requirePlan(project).scenes.length)
    }, `Preproduccion aprobada ${preflight.score}/10; producción ${process.env.PRODUCTION_MODE === 'real' ? 'real' : 'offline'} iniciada`);

    project = await prepareCharacters(project);
    await removePartialSceneFiles(project.id);
    const clips: string[] = [];

    for (let sceneIndex = 0; sceneIndex < requirePlan(project).scenes.length; sceneIndex += 1) {
      let scene = requirePlan(project).scenes[sceneIndex];
      const totalScenes = requirePlan(project).scenes.length;

      if (scene.productionStrategy === 'video-shots-v1') {
        const reusable = await reusableSceneAssets(project, scene);
        if (reusable) {
          Object.assign(scene, reusable);
          project = await acceptScene(project, scene, reusable.videoAsset, clips, sceneIndex, totalScenes, 'recuperada desde checkpoint de video');
          continue;
        }
      }

      scene.status = 'rendering';
      scene.error = undefined;
      project.progress = progress(
        'shots',
        scenePercent(sceneIndex, 0, 1, totalScenes),
        `Produciendo escena ${scene.order}: ${scene.title}`,
        scene.order,
        totalScenes
      );
      project = await saveProject(project);

      const shotClips: string[] = [];
      const shotCount = requirePlan(project).scenes[sceneIndex].shots.length;
      for (let shotIndex = 0; shotIndex < shotCount; shotIndex += 1) {
        project = await produceShot(project, sceneIndex, shotIndex, totalScenes);
        if (project.status === 'quality-review') return project;
        const completedShot = requirePlan(project).scenes[sceneIndex].shots[shotIndex];
        if (!completedShot.videoAsset) throw new Error(`El plano ${completedShot.order} terminó sin video.`);
        shotClips.push(assetAbsolutePath(project.id, completedShot.videoAsset));
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
        productionStrategy: 'video-shots-v1' as const,
        qualityScore: aggregateQuality(scene.shots),
        qualityAttempts: Math.max(0, ...scene.shots.map((shot) => shot.qualityAttempts || 0)),
        qualityIssues: undefined,
        error: undefined
      });
      clips.push(sceneVideo);
      project.productionLog.push(
        `${new Date().toISOString()} Escena ${scene.order} terminada con ${scene.shots.length} planos de video real${scene.qualityScore !== undefined ? `, calidad ${scene.qualityScore}/10` : ''}`
      );
      project.progress = progress(
        'shots',
        scenePercent(sceneIndex + 1, 0, 1, totalScenes),
        `Escena ${scene.order} aprobada y guardada`,
        scene.order,
        totalScenes
      );
      project = await saveProject(project);
    }

    project = await persist(project, {
      status: 'composing',
      progress: progress('composition', 90, 'Uniendo escenas, voz, música y subtítulos', requirePlan(project).scenes.length, requirePlan(project).scenes.length)
    }, 'Montaje final iniciado');

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
    project = await persist(project, {
      status: 'ready',
      progress: progress('ready', 100, 'Película completamente en video lista para descargar', requirePlan(project).scenes.length, requirePlan(project).scenes.length)
    }, 'Película final terminada');
    return project;
  } catch (error) {
    const kind = classifyProductionError(error);
    project.status = kind === 'billing' ? 'paused-billing' : kind === 'safety' ? 'paused-safety' : 'failed';
    project.error = messageOf(error);
    const phase = project.status;
    project.progress = progress(phase, project.progress.percent, project.error, project.progress.currentScene, project.progress.totalScenes);
    project.productionLog.push(`${new Date().toISOString()} Producción pausada (${kind}): ${project.error}`);
    await saveProject(project);
    return project;
  }
}

async function produceShot(project: FilmProject, sceneIndex: number, shotIndex: number, totalScenes: number) {
  let scene = requirePlan(project).scenes[sceneIndex];
  let shot = scene.shots[shotIndex];
  const strictQuality = strictSceneQualityEnabled();
  let correctionPrompt = '';
  let firstAttempt = 1;
  const reusable = shot.qualityForceRegenerate ? undefined : await reusableShotAssets(project, scene, shot);

  if (reusable) {
    Object.assign(shot, reusable);
    if (!strictQuality || shot.qualityOverrideApproved) {
      return acceptShot(project, sceneIndex, shotIndex, reusable, shot.qualityOverrideApproved ? 'aprobado manualmente' : 'recuperado desde checkpoint');
    }

    let report = await readLatestSceneQualityReport(project.id, scene, reusable, shot);
    let reportAsset = latestSceneQualityReportAsset(project.id, scene.order, shot.order);
    if (!report) {
      project.progress = progress(
        'quality',
        scenePercent(sceneIndex, shotIndex, scene.shots.length, totalScenes),
        `Auditando escena ${scene.order}, plano ${shot.order}`,
        scene.order,
        totalScenes
      );
      project = await saveProject(project);
      scene = requirePlan(project).scenes[sceneIndex];
      shot = scene.shots[shotIndex];
      const reviewed = await reviewSceneQuality(project, scene, reusable, 0, shot);
      report = reviewed.report;
      reportAsset = reviewed.reportAsset;
      project.productionLog.push(`${new Date().toISOString()} Escena ${scene.order}, plano ${shot.order} auditado: ${report.overallScore}/10`);
    }
    scene = requirePlan(project).scenes[sceneIndex];
    shot = scene.shots[shotIndex];
    applyQualityReport(shot, report, reportAsset);
    mirrorShotQuality(scene, shot);
    project = await saveProject(project);

    if (!shouldPauseForQuality(report)) {
      const reason = report.passed
        ? `aprobado con ${report.overallScore}/10`
        : `aceptado automáticamente con ${report.overallScore}/10; no contiene fallos críticos`;
      return acceptShot(project, sceneIndex, shotIndex, reusable, reason);
    }
    correctionPrompt = report.correctionPrompt;
    firstAttempt = Math.max(1, report.attempt + 1);
    if (firstAttempt > sceneQualityMaxAttempts()) {
      return pauseForQualityReview(project, sceneIndex, shotIndex, report.overallScore);
    }
  }

  try {
    for (let attempt = firstAttempt; attempt <= sceneQualityMaxAttempts(); attempt += 1) {
      scene = requirePlan(project).scenes[sceneIndex];
      shot = scene.shots[shotIndex];
      shot.status = 'rendering';
      shot.error = undefined;
      scene.status = 'rendering';
      project.progress = progress(
        strictQuality ? 'quality-production' : 'shots',
        scenePercent(sceneIndex, shotIndex, scene.shots.length, totalScenes),
        `Escena ${scene.order}, plano ${shot.order}: intento ${attempt} de ${sceneQualityMaxAttempts()}`,
        scene.order,
        totalScenes
      );
      project = await saveProject(project);
      scene = requirePlan(project).scenes[sceneIndex];
      shot = scene.shots[shotIndex];

      const rendered = await renderShot(project, scene, shot, correctionPrompt);
      Object.assign(shot, rendered);
      await saveShotCheckpoint(project, scene, shot, rendered);
      project.progress = progress(
        strictQuality ? 'quality' : 'shots',
        scenePercent(sceneIndex, shotIndex + 0.5, scene.shots.length, totalScenes),
        `Video de escena ${scene.order}, plano ${shot.order} generado; validando calidad`,
        scene.order,
        totalScenes
      );
      project = await saveProject(project);
      scene = requirePlan(project).scenes[sceneIndex];
      shot = scene.shots[shotIndex];

      let acceptanceReason = `terminado (${shot.mode})`;
      if (strictQuality) {
        const reviewed = await reviewSceneQuality(project, scene, rendered, attempt, shot);
        applyQualityReport(shot, reviewed.report, reviewed.reportAsset);
        mirrorShotQuality(scene, shot);
        project.productionLog.push(`${new Date().toISOString()} Escena ${scene.order}, plano ${shot.order}, intento ${attempt}: ${reviewed.report.overallScore}/10`);
        project = await saveProject(project);
        if (!reviewed.report.passed) {
          if (shouldPauseForQuality(reviewed.report) && attempt >= sceneQualityMaxAttempts()) {
            return pauseForQualityReview(project, sceneIndex, shotIndex, reviewed.report.overallScore);
          }
          if (shouldPauseForQuality(reviewed.report)) {
            correctionPrompt = reviewed.report.correctionPrompt;
            continue;
          }
          acceptanceReason = `aceptado automáticamente con ${reviewed.report.overallScore}/10; no contiene fallos críticos`;
        } else {
          acceptanceReason = `aprobado con ${reviewed.report.overallScore}/10`;
        }
        scene = requirePlan(project).scenes[sceneIndex];
        shot = scene.shots[shotIndex];
      }

      return acceptShot(project, sceneIndex, shotIndex, rendered, acceptanceReason);
    }
    return pauseForQualityReview(project, sceneIndex, shotIndex, shot.qualityScore || 0);
  } catch (error) {
    scene = requirePlan(project).scenes[sceneIndex];
    shot = scene.shots[shotIndex];
    const kind = classifyProductionError(error);
    shot.status = kind === 'technical' ? 'failed' : 'pending';
    shot.error = messageOf(error);
    scene.status = kind === 'technical' ? 'failed' : 'pending';
    scene.error = `Plano ${shot.order}: ${shot.error}`;
    project.productionLog.push(`${new Date().toISOString()} Escena ${scene.order}, plano ${shot.order} falló: ${shot.error}`);
    throw error;
  }
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
    const real = process.env.PRODUCTION_MODE === 'real' && hasUsableCredential('OPENAI_API_KEY');
    const destination = path.join(projectAssetDir(project.id, 'images'), `character-${character.id}.png`);
    if (real) {
      await generateImage(
        `${character.imagePrompt} ${character.appearance}. Wardrobe: ${character.wardrobe}. Clean character reference, neutral background, front-facing, no text, no logo.`,
        destination
      );
    } else {
      await createPlaceholderImage(character.name, character.appearance, destination, project.input);
    }
    character.referenceAsset = assetRelativePath(project.id, destination);
    project.productionLog.push(`${new Date().toISOString()} Referencia creada para ${character.name}`);
    project = await saveProject(project);
  }
  return project;
}

async function renderShot(project: FilmProject, scene: FilmScene, shot: FilmShot, correctionPrompt = ''): Promise<SceneAssets> {
  if (!project.plan) throw new Error('Plan ausente');
  const activeCharacterIds = shot.characterIds.length ? shot.characterIds : scene.characterIds;
  const characters = activeCharacterIds
    .map((id) => project.plan?.characters.find((character) => character.id === id))
    .filter((character): character is Character => Boolean(character));
  const lead = characters[0] || project.plan.characters[0];
  if (!lead?.referenceAsset) throw new Error('El plano no tiene un personaje con referencia visual.');

  const key = `scene-${pad(scene.order)}-shot-${padShot(shot.order)}`;
  const voicePath = path.join(projectAssetDir(project.id, 'audio'), `${key}.mp3`);
  const voiceExists = await fileExists(voicePath);
  if (!voiceExists) {
    if (process.env.PRODUCTION_MODE === 'real' && hasUsableCredential('OPENAI_API_KEY') && shot.spokenText.trim()) {
      await generateSpeech(shot.spokenText, lead.voiceInstructions, voicePath);
    } else {
      await createSilenceAudio(shot.durationSeconds, voicePath);
    }
  }

  const imagePath = path.join(projectAssetDir(project.id, 'images'), `${key}.png`);
  const characterReferences = characters
    .map((character) => character.referenceAsset)
    .filter((asset): asset is string => Boolean(asset))
    .map((asset) => assetAbsolutePath(project.id, asset));
  const continuity = characters
    .map((character) => `${character.name}: ${character.appearance}; wardrobe: ${character.wardrobe}`)
    .join(' | ');
  const imageExists = !correctionPrompt && await fileExists(imagePath);
  if (!imageExists && process.env.PRODUCTION_MODE === 'real' && hasUsableCredential('OPENAI_API_KEY')) {
    await generateImageWithReferences(
      characterReferences,
      `${shot.visualPrompt} Continuity bible: ${continuity}. Camera: ${shot.camera}. ${project.plan.creativeDirection}. ${correctionPrompt ? `Mandatory corrections: ${correctionPrompt}.` : ''} First frame for a real moving video. No text, no subtitles, no logos.`,
      imagePath
    );
  } else if (!imageExists) {
    await createPlaceholderImage(shot.title, shot.visualPrompt, imagePath, project.input);
  }

  const normalizedPath = path.join(projectAssetDir(project.id, 'video'), `${key}.mp4`);
  const partialPath = temporarySceneVideoPath(normalizedPath);
  try {
    if (process.env.PRODUCTION_MODE === 'real') {
      const rawVideo = path.join(projectAssetDir(project.id, 'video'), `${key}-raw.mp4`);
      if (!(shot.lastGenerationState === 'succeeded' && await fileExists(rawVideo))) {
        const result = await generateRealVideo(
          project,
          scene,
          shot,
          [imagePath, ...characterReferences],
          assetAbsolutePath(project.id, lead.referenceAsset),
          voicePath,
          rawVideo,
          correctionPrompt
        );
        shot.lastProvider = result.provider;
      } else {
        project.productionLog.push(
          `${new Date().toISOString()} Escena ${scene.order}, plano ${shot.order}: resultado pagado recuperado desde disco`
        );
      }
      await normalizeGeneratedVideo(rawVideo, voicePath, shot.durationSeconds, partialPath, project.input.aspectRatio);
    } else {
      await renderAnimatedImage(imagePath, voicePath, shot.durationSeconds, partialPath, project.input.aspectRatio);
    }
    await publishSceneVideo(partialPath, normalizedPath, shot.durationSeconds, {
      requireAudibleAudio: process.env.PRODUCTION_MODE === 'real' && Boolean(shot.spokenText.trim()),
      requireMotion: process.env.PRODUCTION_MODE === 'real'
    });
  } finally {
    await rm(partialPath, { force: true });
  }
  return renderedAssets(project.id, shot.mode, imagePath, voicePath, normalizedPath);
}

async function generateRealVideo(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot,
  referencePaths: string[],
  leadReferencePath: string,
  voicePath: string,
  outputPath: string,
  correctionPrompt = ''
): Promise<{ outputPath: string; provider: string }> {
  const provider = (process.env.VIDEO_PROVIDER || 'auto').toLowerCase();
  const prompt = `${shot.visualPrompt} Camera: ${shot.camera}. Duration exactly ${shot.durationSeconds} seconds. ${correctionPrompt}`.trim();
  const falAvatarEligible = shouldUseFalAvatar(scene, shot);
  const attempts: Array<{ name: string; family: 'google' | 'fal'; enabled: boolean; run: () => Promise<unknown> }> = [
    {
      name: 'Gemini Omni',
      family: 'google',
      enabled: hasUsableCredential('GEMINI_API_KEY') && (provider === 'auto' || provider === 'omni'),
      run: () => generateGeminiOmniVideo(referencePaths, prompt, project.input, outputPath)
    },
    {
      name: 'Veo',
      family: 'google',
      enabled: hasUsableCredential('GEMINI_API_KEY') && (provider === 'auto' || provider === 'veo'),
      run: () => generateVeoVideo(referencePaths[0], prompt, project.input, outputPath, shot.durationSeconds)
    },
    {
      name: 'Fal.ai video general',
      family: 'fal',
      enabled: hasUsableCredential('FAL_KEY') && (provider === 'auto' || provider === 'fal'),
      run: () => generateFalVideo(referencePaths[0], prompt, outputPath, shot.durationSeconds)
    },
    {
      name: 'Fal.ai avatar individual',
      family: 'fal',
      enabled: hasUsableCredential('FAL_KEY') &&
        (provider === 'auto' || provider === 'fal') &&
        falAvatarEligible &&
        process.env.ALLOW_FAL_AVATAR_FALLBACK !== 'false',
      run: () => generateFalAvatar(leadReferencePath, voicePath, prompt, outputPath)
    }
  ];
  const errors: string[] = [];
  const allowFallback = process.env.ALLOW_PAID_PROVIDER_FALLBACK === 'true';
  for (const attempt of attempts) {
    if (!attempt.enabled) continue;
    if (attempt.family === 'google' && Date.now() < googleBillingBlockedUntil) {
      errors.push(`${attempt.name}: omitido temporalmente porque la cuenta de Google no tiene créditos prepagados`);
      continue;
    }
    let submitted = false;
    try {
      const reservation = reserveShotGeneration(project, scene, shot);
      shot.lastProvider = attempt.name;
      shot.lastGenerationState = 'reserved';
      project.productionLog.push(
        `${new Date().toISOString()} Gasto reservado para escena ${scene.order}, plano ${shot.order}: ` +
        `generación ${reservation.generationNumber}, US$${reservation.reservedUsd.toFixed(2)}, ` +
        `acumulado US$${reservation.movieReservedUsd.toFixed(2)}, proveedor ${attempt.name}`
      );
      await saveProject(project);
      submitted = true;
      await attempt.run();
      shot.lastGenerationState = 'succeeded';
      project.productionLog.push(
        `${new Date().toISOString()} Escena ${scene.order}, plano ${shot.order}: video recibido de ${attempt.name}`
      );
      await saveProject(project);
      return { outputPath, provider: attempt.name };
    } catch (error) {
      const message = messageOf(error);
      errors.push(`${attempt.name}: ${message}`);
      if (submitted) {
        shot.lastGenerationState = 'failed-unknown';
        project.productionLog.push(
          `${new Date().toISOString()} Escena ${scene.order}, plano ${shot.order}: ${attempt.name} falló; no se reintentará automáticamente: ${message}`
        );
        await saveProject(project);
      }
      if (attempt.family === 'google' && isGooglePrepayDepleted(message)) {
        googleBillingBlockedUntil = Date.now() + GOOGLE_BILLING_COOLDOWN_MS;
      }
      const kind = classifyProductionError(error);
      if (kind !== 'technical' || !allowFallback) throw error;
    }
  }
  const configured = attempts.some((attempt) => attempt.enabled);
  if (!configured) throw new Error('Modo video real sin proveedor: configura GEMINI_API_KEY o FAL_KEY. No se usará una galería como respaldo.');
  throw new Error(`Todos los proveedores de video fallaron. ${errors.join(' | ')}`);
}

export function shouldUseFalAvatar(scene: FilmScene, shot: FilmShot) {
  if (shot.mode !== 'avatar-video') return false;
  if (process.env.FAL_AVATAR_ONLY_SINGLE_SUBJECT === 'false') return true;
  const activeCharacterIds = shot.characterIds.length ? shot.characterIds : scene.characterIds;
  if (activeCharacterIds.length !== 1) return false;

  const description = `${shot.title} ${shot.visualPrompt} ${shot.camera}`.toLowerCase();
  const closeUp = /(primer plano|plano medio|close.?up|medium close|portrait|bust|head.?and.?shoulders)/i.test(description);
  const multipleSubjects = /(multitud|crowd|grupo|group|soldados|soldiers|personas|people|dos personajes|two characters)/i.test(description);
  return closeUp && !multipleSubjects;
}

async function prepareMusic(project: FilmProject) {
  if (!project.plan || process.env.PRODUCTION_MODE !== 'real' || !hasUsableCredential('FAL_KEY')) return undefined;
  const output = path.join(projectAssetDir(project.id, 'audio'), 'soundtrack.mp3');
  try {
    await generateFalMusic(project.plan.musicPrompt, Math.min(180, project.input.durationMinutes * 60), output);
    return output;
  } catch (error) {
    project.productionLog.push(`${new Date().toISOString()} Música omitida: ${messageOf(error)}`);
    await saveProject(project);
    return undefined;
  }
}

async function acceptShot(
  project: FilmProject,
  sceneIndex: number,
  shotIndex: number,
  assets: SceneAssets,
  reason: string
) {
  const scene = requirePlan(project).scenes[sceneIndex];
  const shot = scene.shots[shotIndex];
  Object.assign(shot, assets, { status: 'ready' as const, error: undefined, qualityForceRegenerate: false });
  project.productionLog.push(`${new Date().toISOString()} Escena ${scene.order}, plano ${shot.order} ${reason}`);
  project.progress = progress(
    'shots',
    scenePercent(sceneIndex, shotIndex + 1, scene.shots.length, requirePlan(project).scenes.length),
    `Escena ${scene.order}, plano ${shot.order} guardado; continuando automáticamente`,
    scene.order,
    requirePlan(project).scenes.length
  );
  return saveProject(project);
}

async function acceptScene(
  project: FilmProject,
  scene: FilmScene,
  videoAsset: string,
  clips: string[],
  index: number,
  totalScenes: number,
  reason: string
) {
  scene.status = 'ready';
  scene.error = undefined;
  clips.push(assetAbsolutePath(project.id, videoAsset));
  project.productionLog.push(`${new Date().toISOString()} Escena ${scene.order} ${reason}`);
  project.progress = progress('shots', scenePercent(index + 1, 0, 1, totalScenes), `Escena ${index + 1} aprobada y guardada`, index + 1, totalScenes);
  return saveProject(project);
}

async function pauseForQualityReview(project: FilmProject, sceneIndex: number, shotIndex: number, score: number) {
  const scene = requirePlan(project).scenes[sceneIndex];
  const shot = scene.shots[shotIndex];
  shot.status = 'review-required';
  shot.qualityOverrideApproved = false;
  shot.error = `El plano obtuvo ${score}/10 y agotó los intentos automáticos.`;
  scene.status = 'review-required';
  scene.qualityScore = score;
  scene.qualityAttempts = shot.qualityAttempts;
  scene.qualityIssues = shot.qualityIssues;
  scene.qualityReportAsset = shot.qualityReportAsset;
  scene.error = `Plano ${shot.order}: ${shot.error}`;
  project.status = 'quality-review';
  project.error = undefined;
  project.progress = progress('quality-review', project.progress.percent, `Revisa la escena ${scene.order}, plano ${shot.order}: ${shot.title}`, scene.order, requirePlan(project).scenes.length);
  project.productionLog.push(`${new Date().toISOString()} Producción pausada por calidad en escena ${scene.order}, plano ${shot.order}`);
  return saveProject(project);
}

function mirrorShotQuality(scene: FilmScene, shot: FilmShot) {
  scene.qualityScore = shot.qualityScore;
  scene.qualityAttempts = shot.qualityAttempts;
  scene.qualityIssues = shot.qualityIssues;
  scene.qualityReportAsset = shot.qualityReportAsset;
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
