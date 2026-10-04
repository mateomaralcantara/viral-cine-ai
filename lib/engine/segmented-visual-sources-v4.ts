import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import { assetAbsolutePath, assetRelativePath, projectAssetDir } from '@/lib/storage/project-store';
import { buildSegmentedVisualPlan, type SegmentedVisualTurnPlan } from '@/lib/engine/segmented-visual-plan-v4';
import { buildSingleVeoFallbackPrompt } from '@/lib/engine/single-visual-plan-v4';
import { appendSpend, assertSpendRetrySafe, estimateOperationCost } from '@/lib/engine/spend-ledger';
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

export type SegmentedTurnVisualSourceStatus = {
  index: number;
  speakerId: string;
  speakerLabel: string;
  role: SegmentedVisualTurnPlan['role'];
  slotDurationSeconds: number;
  providerDurationSeconds: number;
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
  estimatedReferenceUsd: number;
  estimatedVideoUsd: number;
};

export type SegmentedTurnVisualInspection = {
  planVersion: '4.1-per-turn-visual';
  allReferencesReady: boolean;
  allVideosReady: boolean;
  estimatedMissingReferencesUsd: number;
  estimatedMissingVideosUsd: number;
  turns: SegmentedTurnVisualSourceStatus[];
};

export async function inspectSegmentedTurnVisualSources(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot
): Promise<SegmentedTurnVisualInspection> {
  const plan = buildSegmentedVisualPlan(project, scene, shot);
  const turns: SegmentedTurnVisualSourceStatus[] = [];

  for (const turn of plan.turns) {
    const paths = visualTurnPaths(project, scene, shot, turn.index);
    const referenceReady = await fileExists(paths.referencePath);
    let videoReady = false;
    let rejectedReason: string | undefined;

    if (await fileExists(paths.videoPath)) {
      try {
        await assertCinematicVideoTrack(paths.videoPath, turn.slotDurationSeconds);
        videoReady = true;
      } catch (error) {
        rejectedReason = safeErrorMessage(error);
      }
    }

    turns.push({
      index: turn.index,
      speakerId: turn.speakerId,
      speakerLabel: turn.speakerLabel,
      role: turn.role,
      slotDurationSeconds: turn.slotDurationSeconds,
      providerDurationSeconds: turn.providerDurationSeconds,
      referenceAsset: assetRelativePath(project.id, paths.referencePath),
      referencePath: paths.referencePath,
      referenceReady,
      videoAsset: assetRelativePath(project.id, paths.videoPath),
      videoPath: paths.videoPath,
      videoReady,
      rejectedReason,
      prompt: turn.prompt,
      videoPrompt: turn.videoPrompt,
      negativePrompt: turn.negativePrompt,
      estimatedReferenceUsd: referenceReady ? 0 : estimateOperationCost('image', 1),
      estimatedVideoUsd: videoReady || localVideoOnly() ? 0 : estimateOperationCost('video', turn.providerDurationSeconds)
    });
  }

  return {
    planVersion: '4.1-per-turn-visual',
    allReferencesReady: turns.every((turn) => turn.referenceReady),
    allVideosReady: turns.every((turn) => turn.videoReady),
    estimatedMissingReferencesUsd: roundMoney(turns.reduce((sum, turn) => sum + turn.estimatedReferenceUsd, 0)),
    estimatedMissingVideosUsd: roundMoney(turns.reduce((sum, turn) => sum + turn.estimatedVideoUsd, 0)),
    turns
  };
}

export async function generateSegmentedTurnReferencesReal(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot
) {
  assertPaidGenerationAllowed('generar referencias visuales por turno');
  if (!hasUsableCredential('OPENAI_API_KEY')) {
    throw new Error('Falta OPENAI_API_KEY para generar referencias visuales por turno.');
  }
  if (!project.plan) throw new Error('Plan ausente.');

  const plan = buildSegmentedVisualPlan(project, scene, shot);
  const before = await inspectSegmentedTurnVisualSources(project, scene, shot);

  for (const turn of plan.turns) {
    const status = before.turns.find((item) => item.index === turn.index)!;
    if (status.referenceReady) continue;

    const paths = visualTurnPaths(project, scene, shot, turn.index);
    await mkdir(path.dirname(paths.referencePath), { recursive: true });

    const references = turn.referenceCharacterIds
      .map((id) => project.plan?.characters.find((character) => character.id === id))
      .filter((character): character is NonNullable<typeof character> => Boolean(character?.referenceAsset))
      .map((character) => assetAbsolutePath(project.id, character.referenceAsset!));

    const idempotencyKey = 'visual-turn-image:' + shot.id + ':' + turn.index + ':v3-safe';
    const estimatedUsd = estimateOperationCost('image', 1);
    await assertSpendRetrySafe(project.id, idempotencyKey, 'referencia visual por turno ' + turn.index);
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
        turn.prompt + ' Negative constraints: ' + turn.negativePrompt
      );
      console.log(
        'OpenAI reference prompt turn ' + turn.index + ': PROVIDER-SAFE'
      );
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

      const previousTurnPaths = before.turns
        .filter((item) => item.index < turn.index && item.referenceReady)
        .sort((a, b) => b.index - a.index)
        .map((item) => item.referencePath);

      console.warn(
        'OpenAI Images no pudo entregar la referencia del turno ' +
        turn.index +
        '; usando fallback visual local/de continuidad y continuando.'
      );

      const fallback = await createImageReferenceFallback({
        project,
        scene,
        shot,
        destinationPath: paths.referencePath,
        preferredPaths: previousTurnPaths
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
          'turn=' + turn.index +
          ' fallback=' + fallback.mode +
          (fallback.sourcePath ? ' source=' + fallback.sourcePath : '')
      });
    }
  }

  return inspectSegmentedTurnVisualSources(project, scene, shot);
}

export async function generateSegmentedTurnVideosReal(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot
) {
  assertPaidGenerationAllowed('generar videos visuales por turno');

  const plan = buildSegmentedVisualPlan(project, scene, shot);
  const before = await inspectSegmentedTurnVisualSources(project, scene, shot);
  if (!before.allReferencesReady) {
    throw new Error('Videos por turno bloqueados: primero deben aprobarse/generarse todas las referencias visuales.');
  }

  for (const turn of plan.turns) {
    const status = before.turns.find((item) => item.index === turn.index)!;
    if (status.videoReady) continue;
    if (await fileExists(status.videoPath)) {
      throw new Error(
        'Existe un video por turno rechazado y no se sobrescribirá automáticamente: ' + status.videoAsset +
        (status.rejectedReason ? ' | ' + status.rejectedReason : '')
      );
    }

    await mkdir(path.dirname(status.videoPath), { recursive: true });
    const idempotencyKey = 'visual-turn-video:' + shot.id + ':' + turn.index + ':v3';

    if (localVideoOnly()) {
      console.warn(
        'VIRALCINE_LOCAL_VIDEO_ONLY=1: turno ' + turn.index +
        ' usa video cinematográfico local de costo US$0.'
      );
      await renderCinematicStillVideo(
        status.referencePath,
        turn.slotDurationSeconds,
        status.videoPath,
        project.input.aspectRatio
      );
      await assertCinematicVideoTrack(status.videoPath, turn.slotDurationSeconds);
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
        outputAsset: status.videoAsset
      });
      continue;
    }

    if (!hasUsableCredential('GEMINI_API_KEY')) {
      throw new Error('Falta GEMINI_API_KEY para generar los videos por turno con Veo.');
    }

    const estimatedUsd = estimateOperationCost('video', turn.providerDurationSeconds);
    const attempts = [
      { label: 'primary', prompt: turn.videoPrompt },
      { label: 'safe-fallback', prompt: buildSingleVeoFallbackPrompt() }
    ];

    let lastError: unknown;

    for (let attempt = 0; attempt < attempts.length; attempt += 1) {
      const current = attempts[attempt];

      await assertSpendRetrySafe(
        project.id,
        idempotencyKey,
        'video visual por turno ' + turn.index + ' (' + current.label + ')'
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
          status.referencePath,
          current.prompt,
          project.input,
          status.videoPath,
          turn.slotDurationSeconds
        );
        await assertCinematicVideoTrack(status.videoPath, turn.slotDurationSeconds);
        await appendSpend(project.id, {
          operation: 'video',
          provider: 'Veo',
          model: process.env.GEMINI_VIDEO_MODEL,
          state: 'succeeded',
          estimatedUsd,
          sceneId: scene.id,
          shotId: shot.id,
          idempotencyKey,
          outputAsset: status.videoAsset
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
            'Veo respondió RESOURCE_EXHAUSTED/429 en el turno ' +
            turn.index +
            ' antes de generar video; usando fallback cinematográfico local de costo US$0.'
          );
          await renderCinematicStillVideo(
            status.referencePath,
            turn.slotDurationSeconds,
            status.videoPath,
            project.input.aspectRatio
          );
          await assertCinematicVideoTrack(status.videoPath, turn.slotDurationSeconds);
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
            outputAsset: status.videoAsset
          });
          lastError = undefined;
          break;
        }

        if (attempt === attempts.length - 1) {
          console.warn(
            'Veo volvió a terminar sin video y sin cobro en el turno ' +
            turn.index +
            '; usando fallback cinematográfico local de costo US$0.'
          );
          await renderCinematicStillVideo(
            status.referencePath,
            turn.slotDurationSeconds,
            status.videoPath,
            project.input.aspectRatio
          );
          await assertCinematicVideoTrack(status.videoPath, turn.slotDurationSeconds);
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
            outputAsset: status.videoAsset
          });
          lastError = undefined;
          break;
        }

        console.warn(
          'Veo no devolvió video y reportó no-charge; reintentando el turno ' +
          turn.index + ' una vez con motion prompt seguro.'
        );
      }
    }

    if (lastError) throw lastError;
  }

  return inspectSegmentedTurnVisualSources(project, scene, shot);
}

export function turnSourceAssetMap(inspection: SegmentedTurnVisualInspection) {
  if (!inspection.allVideosReady) {
    throw new Error('No todas las fuentes visuales por turno están listas.');
  }
  return Object.fromEntries(inspection.turns.map((turn) => [turn.index, turn.videoAsset]));
}

function visualTurnPaths(project: FilmProject, scene: FilmScene, shot: FilmShot, turnIndex: number) {
  const folder =
    'scene-' + pad(scene.order) + '-shot-' + pad(shot.order) + '-' + shot.id +
    '/turn-' + pad(turnIndex);
  return {
    referencePath: path.join(
      projectAssetDir(project.id, 'images'),
      'segmented-v4-turn-sources',
      folder,
      'reference.png'
    ),
    videoPath: path.join(
      projectAssetDir(project.id, 'video'),
      'segmented-v4-turn-sources',
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

function roundMoney(value: number) {
  return Math.round(value * 10000) / 10000;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}


function localVideoOnly() {
  return /^(?:1|true|yes|on)$/i.test(
    String(process.env.VIRALCINE_LOCAL_VIDEO_ONLY || '').trim()
  );
}
