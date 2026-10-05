import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import { assetAbsolutePath, assetRelativePath, projectAssetDir } from '@/lib/storage/project-store';
import { buildSingleVisualPlan, buildSingleVeoFallbackPrompt } from '@/lib/engine/single-visual-plan-v4';
import { appendSpend, assertSpendRetrySafe, estimateOperationCost, latestSpendForKey } from '@/lib/engine/spend-ledger';
import { assertPaidGenerationAllowed, hasUsableCredential, safeErrorMessage } from '@/lib/engine/production-safety';
import { generateImageWithReferences } from '@/lib/providers/openai-media';
import { buildProviderSafeImagePrompt } from '@/lib/engine/openai-image-safety-v4';
import {
  createImageReferenceFallback,
  isImageProviderFallbackEligible
} from '@/lib/engine/image-reference-fallback-v4';
import { generateVeoVideo, isVeoNoChargeFailure, isVeoQuotaFailure } from '@/lib/providers/veo';
import { assertCinematicVideoTrack } from '@/lib/media/probe';
import { renderCinematicStillVideo } from '@/lib/media/ffmpeg';

export type SingleVisualInspection = {
  planVersion: '4.1-single-visual';
  referenceAsset: string;
  referencePath: string;
  referenceReady: boolean;
  videoAsset: string;
  videoPath: string;
  videoReady: boolean;
  rejectedReason?: string;
  prompt: string;
  videoPrompt: string;
  negativePrompt: string;
  providerDurationSeconds: number;
  estimatedReferenceUsd: number;
  estimatedVideoUsd: number;
};

export async function inspectSingleVisualSource(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot
): Promise<SingleVisualInspection> {
  const plan = buildSingleVisualPlan(project, scene, shot);
  const paths = singleVisualPaths(project, scene, shot);
  const referenceReady = await fileExists(paths.referencePath);
  let videoReady = false;
  let rejectedReason: string | undefined;

  if (await fileExists(paths.videoPath)) {
    try {
      await assertCinematicVideoTrack(paths.videoPath, shot.durationSeconds);
      videoReady = true;
    } catch (error) {
      rejectedReason = safeErrorMessage(error);
    }
  }

  return {
    planVersion: plan.version,
    referenceAsset: assetRelativePath(project.id, paths.referencePath),
    referencePath: paths.referencePath,
    referenceReady,
    videoAsset: assetRelativePath(project.id, paths.videoPath),
    videoPath: paths.videoPath,
    videoReady,
    rejectedReason,
    prompt: plan.prompt,
    videoPrompt: plan.videoPrompt,
    negativePrompt: plan.negativePrompt,
    providerDurationSeconds: plan.providerDurationSeconds,
    estimatedReferenceUsd: referenceReady ? 0 : estimateOperationCost('image', 1),
    estimatedVideoUsd: videoReady || localVideoOnly() ? 0 : estimateOperationCost('video', plan.providerDurationSeconds)
  };
}

export async function generateSingleReferenceReal(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot
) {
  assertPaidGenerationAllowed('generar referencia visual única');
  if (!hasUsableCredential('OPENAI_API_KEY')) {
    throw new Error('Falta OPENAI_API_KEY para generar la referencia visual única.');
  }
  if (!project.plan) throw new Error('Plan ausente.');

  const plan = buildSingleVisualPlan(project, scene, shot);
  const before = await inspectSingleVisualSource(project, scene, shot);
  if (before.referenceReady) return before;

  const paths = singleVisualPaths(project, scene, shot);
  await mkdir(path.dirname(paths.referencePath), { recursive: true });

  const references = plan.referenceCharacterIds
    .map((id) => project.plan?.characters.find((character) => character.id === id))
    .filter((character): character is NonNullable<typeof character> => Boolean(character?.referenceAsset))
    .map((character) => assetAbsolutePath(project.id, character.referenceAsset!));

  const idempotencyKey = 'single-visual-image:' + shot.id + ':v4-safe';
  const estimatedUsd = estimateOperationCost('image', 1);

  const previousSpend = await latestSpendForKey(project.id, idempotencyKey);
  if (
    previousSpend?.operation === 'image' &&
    previousSpend.provider.toLowerCase() === 'openai' &&
    previousSpend.state === 'failed-unknown'
  ) {
    console.warn(
      'Referencia OpenAI previa quedó failed-unknown; no se repetirá el cobro. ' +
      'Se usará fallback visual local/de continuidad.'
    );
    const fallback = await createImageReferenceFallback({
      project,
      scene,
      shot,
      destinationPath: paths.referencePath
    });
    await appendSpend(project.id, {
      operation: 'image',
      provider: 'local-continuity',
      model: 'reference-fallback-v1-recovery',
      state: 'reconciled',
      estimatedUsd: 0,
      actualUsd: 0,
      sceneId: scene.id,
      shotId: shot.id,
      idempotencyKey: 'local-fallback:' + idempotencyKey,
      outputAsset: assetRelativePath(project.id, paths.referencePath),
      error:
        'recovered-from=' + previousSpend.state +
        ' fallback=' + fallback.mode +
        (fallback.sourcePath ? ' source=' + fallback.sourcePath : '')
    });
    return inspectSingleVisualSource(project, scene, shot);
  }

  await assertSpendRetrySafe(project.id, idempotencyKey, 'referencia visual única');

  await appendSpend(project.id, {
    operation: 'image',
    provider: 'openai',
    model: process.env.OPENAI_IMAGE_MODEL,
    state: 'submitted',
    estimatedUsd,
    sceneId: scene.id,
    shotId: shot.id,
    idempotencyKey
  });

  try {
    const providerPrompt = buildProviderSafeImagePrompt(
      plan.prompt + ' Negative constraints: ' + plan.negativePrompt
    );
    console.log('OpenAI reference prompt: PROVIDER-SAFE');
    await generateImageWithReferences(
      references,
      providerPrompt,
      paths.referencePath
    );
    await appendSpend(project.id, {
      operation: 'image',
      provider: 'openai',
      model: process.env.OPENAI_IMAGE_MODEL,
      state: 'succeeded',
      estimatedUsd,
      sceneId: scene.id,
      shotId: shot.id,
      idempotencyKey,
      outputAsset: assetRelativePath(project.id, paths.referencePath)
    });
  } catch (error) {
    const authRejected = isOpenAIAuthRejected(error);
    const fallbackEligible =
      !authRejected && isImageProviderFallbackEligible(error);

    await appendSpend(project.id, {
      operation: 'image',
      provider: 'openai',
      model: process.env.OPENAI_IMAGE_MODEL,
      state: authRejected ? 'failed-no-charge' : 'failed-unknown',
      estimatedUsd,
      actualUsd: authRejected ? 0 : undefined,
      sceneId: scene.id,
      shotId: shot.id,
      idempotencyKey,
      error: safeErrorMessage(error)
    });

    if (!fallbackEligible) throw error;

    console.warn(
      'OpenAI Images no pudo entregar la referencia; usando fallback visual local/de continuidad y continuando la toma.'
    );

    const fallback = await createImageReferenceFallback({
      project,
      scene,
      shot,
      destinationPath: paths.referencePath
    });

    await appendSpend(project.id, {
      operation: 'image',
      provider: 'local-continuity',
      model: 'reference-fallback-v1',
      state: 'reconciled',
      estimatedUsd: 0,
      actualUsd: 0,
      sceneId: scene.id,
      shotId: shot.id,
      idempotencyKey,
      outputAsset: assetRelativePath(project.id, paths.referencePath),
      error:
        'fallback=' + fallback.mode +
        (fallback.sourcePath ? ' source=' + fallback.sourcePath : '')
    });
  }

  return inspectSingleVisualSource(project, scene, shot);
}

export async function generateSingleVideoReal(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot
) {
  assertPaidGenerationAllowed('generar video visual único');

  const plan = buildSingleVisualPlan(project, scene, shot);
  const before = await inspectSingleVisualSource(project, scene, shot);

  if (!before.referenceReady) {
    throw new Error('Video bloqueado: primero debes generar y revisar la referencia visual.');
  }
  if (before.videoReady) return before;
  if (await fileExists(before.videoPath)) {
    throw new Error(
      'Existe un video único rechazado y no se sobrescribirá automáticamente: ' +
      before.videoAsset +
      (before.rejectedReason ? ' | ' + before.rejectedReason : '')
    );
  }

  await mkdir(path.dirname(before.videoPath), { recursive: true });

  const idempotencyKey = 'single-visual-video:' + shot.id + ':v5';

  if (localVideoOnly()) {
    console.warn(
      'VIRALCINE_LOCAL_VIDEO_ONLY=1: omitiendo Veo y creando video cinematográfico local de costo US$0.'
    );
    await renderCinematicStillVideo(
      before.referencePath,
      shot.durationSeconds,
      before.videoPath,
      project.input.aspectRatio
    );
    await assertCinematicVideoTrack(before.videoPath, shot.durationSeconds);
    await appendSpend(project.id, {
      operation: 'video',
      provider: 'local-ffmpeg',
      model: 'cinematic-still-motion-v1-finish-mode',
      state: 'reconciled',
      estimatedUsd: 0,
      actualUsd: 0,
      sceneId: scene.id,
      shotId: shot.id,
      idempotencyKey,
      outputAsset: before.videoAsset
    });
    return inspectSingleVisualSource(project, scene, shot);
  }

  if (!hasUsableCredential('GEMINI_API_KEY')) {
    throw new Error('Falta GEMINI_API_KEY para generar el video con Veo.');
  }
  const estimatedUsd = estimateOperationCost('video', plan.providerDurationSeconds);
  await assertSpendRetrySafe(project.id, idempotencyKey, 'video visual único');

  const attempts = [
    { label: 'primary', prompt: plan.videoPrompt },
    { label: 'safe-fallback', prompt: buildSingleVeoFallbackPrompt() }
  ];

  let lastError: unknown;

  for (let attempt = 0; attempt < attempts.length; attempt += 1) {
    const current = attempts[attempt];

    await assertSpendRetrySafe(
      project.id,
      idempotencyKey,
      'video visual único (' + current.label + ')'
    );

    await appendSpend(project.id, {
      operation: 'video',
      provider: 'Veo',
      model: process.env.GEMINI_VIDEO_MODEL,
      state: 'submitted',
      estimatedUsd,
      sceneId: scene.id,
      shotId: shot.id,
      idempotencyKey
    });

    try {
      await generateVeoVideo(
        before.referencePath,
        current.prompt,
        project.input,
        before.videoPath,
        shot.durationSeconds
      );
      await assertCinematicVideoTrack(before.videoPath, shot.durationSeconds);
      await appendSpend(project.id, {
        operation: 'video',
        provider: 'Veo',
        model: process.env.GEMINI_VIDEO_MODEL,
        state: 'succeeded',
        estimatedUsd,
        sceneId: scene.id,
        shotId: shot.id,
        idempotencyKey,
        outputAsset: before.videoAsset
      });
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      const quotaFailure = isVeoQuotaFailure(error);
      const noCharge = isVeoNoChargeFailure(error) || quotaFailure;
      await appendSpend(project.id, {
        operation: 'video',
        provider: 'Veo',
        model: process.env.GEMINI_VIDEO_MODEL,
        state: noCharge ? 'failed-no-charge' : 'failed-unknown',
        estimatedUsd,
        actualUsd: noCharge ? 0 : undefined,
        sceneId: scene.id,
        shotId: shot.id,
        idempotencyKey,
        error:
          '[' + current.label + '] ' +
          safeErrorMessage(error)
      });

      if (!noCharge) {
        throw error;
      }

      if (quotaFailure) {
        console.warn(
          'Veo respondió RESOURCE_EXHAUSTED/429 antes de generar video; usando fallback cinematográfico local de costo US$0.'
        );
        await renderCinematicStillVideo(
          before.referencePath,
          shot.durationSeconds,
          before.videoPath,
          project.input.aspectRatio
        );
        await assertCinematicVideoTrack(before.videoPath, shot.durationSeconds);
        await appendSpend(project.id, {
          operation: 'video',
          provider: 'local-ffmpeg',
          model: 'cinematic-still-motion-v1-quota-fallback',
          state: 'reconciled',
          estimatedUsd: 0,
          actualUsd: 0,
          sceneId: scene.id,
          shotId: shot.id,
          idempotencyKey,
          outputAsset: before.videoAsset
        });
        lastError = undefined;
        break;
      }

      if (attempt === attempts.length - 1) {
        console.warn(
          'Veo volvió a terminar sin video y sin cobro; usando fallback cinematográfico local de costo US$0.'
        );
        await renderCinematicStillVideo(
          before.referencePath,
          shot.durationSeconds,
          before.videoPath,
          project.input.aspectRatio
        );
        await assertCinematicVideoTrack(before.videoPath, shot.durationSeconds);
        await appendSpend(project.id, {
          operation: 'video',
          provider: 'local-ffmpeg',
          model: 'cinematic-still-motion-v1',
          state: 'reconciled',
          estimatedUsd: 0,
          actualUsd: 0,
          sceneId: scene.id,
          shotId: shot.id,
          idempotencyKey,
          outputAsset: before.videoAsset
        });
        lastError = undefined;
        break;
      }

      console.warn(
        'Veo no devolvió video y reportó no-charge; reintentando una vez con motion prompt seguro.'
      );
    }
  }

  if (lastError) throw lastError;

  return inspectSingleVisualSource(project, scene, shot);
}

function singleVisualPaths(project: FilmProject, scene: FilmScene, shot: FilmShot) {
  const folder =
    'scene-' + pad(scene.order) + '-shot-' + pad(shot.order) + '-' + shot.id;
  return {
    referencePath: path.join(
      projectAssetDir(project.id, 'images'),
      'single-v4-sources',
      folder,
      'reference.png'
    ),
    videoPath: path.join(
      projectAssetDir(project.id, 'video'),
      'single-v4-sources',
      folder,
      'base-real.mp4'
    )
  };
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
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
  return status === 401 || code === 'invalid_api_key' || (type === 'invalid_request_error' && code === 'invalid_api_key');
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}


function localVideoOnly() {
  return /^(?:1|true|yes|on)$/i.test(
    String(process.env.VIRALCINE_LOCAL_VIDEO_ONLY || '').trim()
  );
}
