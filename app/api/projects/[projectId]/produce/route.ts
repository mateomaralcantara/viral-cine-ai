import { NextResponse } from 'next/server';
import { resetSceneQuality } from '@/lib/engine/quality-review';
import { assertShotGenerationAllowed } from '@/lib/engine/spend-guard';
import { saveShotCheckpoint, type SceneAssets } from '@/lib/engine/scene-checkpoints';
import type { FilmShot } from '@/lib/domain/schemas';
import { updateProject } from '@/lib/storage/project-store';
import { assertProductionCanQueue, ProductionSafetyError, safeErrorMessage } from '@/lib/engine/production-safety';

export const runtime = 'nodejs';

type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const payload = await optionalJson(request);
    const decision = payload.decision === 'approve' ? 'approve' : payload.decision === 'retry' ? 'retry' : 'start';
    const project = await updateProject(projectId, async (current) => {
      if (!current.plan) throw new Error('Primero debes generar y revisar el guion.');
      if (['producing', 'composing', 'queued'].includes(current.status)) return current;
      const reviewScene = current.plan.scenes.find((scene) => scene.status === 'review-required');
      if (reviewScene) {
        const reviewShot = reviewScene.shots.find((shot) => shot.status === 'review-required');
        if (decision === 'approve') {
          if (reviewShot) {
            const approvedAssets = shotAssets(reviewShot);
            await saveShotCheckpoint(current, reviewScene, reviewShot, approvedAssets);
            reviewShot.qualityOverrideApproved = true;
            reviewShot.qualityForceRegenerate = false;
            reviewShot.status = 'ready';
            reviewShot.error = undefined;
            reviewScene.status = 'pending';
            current.productionLog.push(
              `${new Date().toISOString()} Escena ${reviewScene.order}, toma ${reviewShot.order} aprobada manualmente por el usuario`
            );
          } else {
            reviewScene.qualityOverrideApproved = true;
            reviewScene.status = 'ready';
            current.productionLog.push(`${new Date().toISOString()} Escena ${reviewScene.order} aprobada manualmente por el usuario`);
          }
          reviewScene.error = undefined;
        } else if (decision === 'retry') {
          if (reviewShot) assertShotGenerationAllowed(current, reviewScene, reviewShot);
          await resetSceneQuality(current.id, reviewScene, reviewShot);
          current.productionLog.push(
            `${new Date().toISOString()} Reintento manual autorizado para escena ${reviewScene.order}${reviewShot ? `, toma ${reviewShot.order}` : ''}`
          );
        } else {
          throw new Error('La toma requiere que elijas aprobar el material existente o autorizar un reintento manual.');
        }
      }
      try {
        assertProductionCanQueue(current);
      } catch (error) {
        if (decision === 'approve' && error instanceof ProductionSafetyError) {
          const message = safeErrorMessage(error);
          return {
            ...current,
            status: 'paused-safety',
            error: message,
            progress: { ...current.progress, phase: 'paused-safety', message, updatedAt: new Date().toISOString() },
            productionLog: [...current.productionLog, `${new Date().toISOString()} Toma aprobada; continuación pausada por seguridad`]
          };
        }
        throw error;
      }
      return {
        ...current,
        status: 'queued',
        error: undefined,
        progress: { phase: 'queued', percent: 16, message: 'Película colocada en la cola de producción', updatedAt: new Date().toISOString() },
        productionLog: [...current.productionLog, `${new Date().toISOString()} Producción colocada en cola`]
      };
    });
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });
  }
}

async function optionalJson(request: Request): Promise<{ decision?: unknown }> {
  try {
    return await request.json() as { decision?: unknown };
  } catch {
    return {};
  }
}

function shotAssets(shot: FilmShot): SceneAssets {
  if (!shot.imageAsset || !shot.voiceAsset || !shot.videoAsset) {
    throw new Error('No se puede aprobar la toma porque sus archivos de imagen, voz o video estan incompletos.');
  }
  return {
    mode: shot.mode,
    imageAsset: shot.imageAsset,
    voiceAsset: shot.voiceAsset,
    videoAsset: shot.videoAsset
  };
}
