import { NextResponse } from 'next/server';
import {
  armPilotShotOne,
  getPilotShotOne,
  getPilotShotOnePreflight,
  preparePilotShotOneRetry
} from '@/lib/engine/pilot-shot-one-v5';
import {
  getProject,
  updateProject
} from '@/lib/storage/project-store';
import { estimatePilotShotSpend } from '@/lib/engine/pilot';
import {
  appendSpend,
  latestSpendForKey,
  reservedMovieSpend
} from '@/lib/engine/spend-ledger';
import { releaseNoChargeGenerationReservation } from '@/lib/engine/spend-guard';
import { safeErrorMessage } from '@/lib/engine/production-safety';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const project = await getProject(projectId);

    return NextResponse.json({
      ok: true,
      preflight: getPilotShotOnePreflight(project),
      armed:
        project.pilot?.enabled === true &&
        project.pilot.maxScenes === 1 &&
        project.pilot.maxShotsPerScene === 1
    });
  } catch (error) {
    return failure(error, 400);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const body = await optionalJson(request);
    const action =
      body.action === 'arm'
        ? 'arm'
        : body.action === 'prepare-retry'
          ? 'prepare-retry'
          : body.action === 'resume-safe-failover'
            ? 'resume-safe-failover'
            : body.action === 'resume-veo-lite'
              ? 'resume-veo-lite'
              : 'preflight';

    if (action === 'preflight') {
      const project = await getProject(projectId);
      return NextResponse.json({
        ok: true,
        project,
        preflight: getPilotShotOnePreflight(project),
        armed:
          project.pilot?.enabled === true &&
          project.pilot.maxScenes === 1 &&
          project.pilot.maxShotsPerScene === 1
      });
    }

    if (action === 'resume-veo-lite') {
      if (body.confirmFalNoCredit !== true) {
        throw new Error(
          'Confirma explícitamente que Fal no tenía crédito antes de reconciliar el intento como no-cobrable.'
        );
      }

      const key = 'video:pilot-15d-01:2';
      let latest = await latestSpendForKey(projectId, key);

      if (!latest) {
        throw new Error(
          'No existe un registro de gasto del segundo intento para reconciliar.'
        );
      }

      if (
        latest.state === 'failed-unknown' &&
        /fal/i.test(latest.provider) &&
        /(credit|saldo|balance|billing|payment|insufficient|403)/i.test(
          latest.error || ''
        )
      ) {
        latest = await appendSpend(projectId, {
          operation: latest.operation,
          provider: latest.provider,
          model: latest.model,
          state: 'failed-no-charge',
          estimatedUsd: latest.estimatedUsd,
          actualUsd: 0,
          sceneId: latest.sceneId,
          shotId: latest.shotId,
          characterId: latest.characterId,
          idempotencyKey: latest.idempotencyKey,
          providerRequestId: latest.providerRequestId,
          error:
            '[manual-reconcile-fal-no-credit] ' +
            (latest.error || 'Fal sin crédito confirmado por el usuario.')
        });
      }

      if (latest.state !== 'failed-no-charge') {
        throw new Error(
          `No es seguro continuar: el intento Fal permanece en estado ${latest.state}. No se autoriza otro cobro.`
        );
      }

      const project = await updateProject(projectId, (current) => {
        const { scene, shot } = getPilotShotOne(current);

        if ((shot.generationCount || 0) >= 2) {
          releaseNoChargeGenerationReservation(
            shot,
            latest?.estimatedUsd || 0
          );
        }

        if ((shot.generationCount || 0) !== 1) {
          throw new Error(
            `Reanudación Veo Lite bloqueada: la Toma 1 registra ${shot.generationCount || 0} generaciones después de reconciliar Fal; se esperaba 1.`
          );
        }

        if (!shot.motionSpec) {
          throw new Error('La Toma 1 perdió su especificación Real Motion.');
        }

        shot.motionSpec = {
          ...shot.motionSpec,
          preferredProviders: ['veo']
        };
        shot.videoModelOverride = 'veo-3.1-lite-generate-preview';
        shot.qualityForceRegenerate = false;
        shot.safeFailoverResume = true;
        shot.lastGenerationState = undefined;
        shot.error = undefined;
        shot.status = 'pending';

        scene.error = undefined;
        scene.status = 'pending';

        current.error = undefined;
        current.status = 'queued';
        current.progress = {
          ...current.progress,
          phase: 'queued',
          message:
            'Reanudando E1/T1 con Veo 3.1 Lite usando el frame V2 existente; Fal sin crédito fue reconciliado sin cobro.',
          updatedAt: new Date().toISOString()
        };
        current.productionLog = [
          ...current.productionLog,
          `${new Date().toISOString()} E1/T1 reanudada con Veo 3.1 Lite (720p): frame V2 reutilizado, Fal sin crédito reconciliado como no-cobrable y Fal deshabilitado para esta prueba.`
        ];

        return current;
      });

      return NextResponse.json({
        ok: true,
        project,
        resumed: true,
        provider: 'veo',
        model: 'veo-3.1-lite-generate-preview',
        estimatedVideoUsd: 0.30
      });
    }

    if (action === 'resume-safe-failover') {
      const latest = await latestSpendForKey(
        projectId,
        'video:pilot-15d-01:2'
      );

      if (!latest || latest.state !== 'failed-no-charge') {
        throw new Error(
          'No existe un fallo Veo confirmado como no-cobrable para reanudar el segundo intento.'
        );
      }

      const project = await updateProject(projectId, (current) => {
        const { scene, shot } = getPilotShotOne(current);

        if ((shot.generationCount || 0) !== 1) {
          throw new Error(
            `Reanudación bloqueada: la Toma 1 registra ${shot.generationCount || 0} generaciones reservadas; se esperaba 1 tras liberar el intento Veo sin cobro.`
          );
        }

        if (!shot.motionSpec) {
          throw new Error('La Toma 1 perdió su especificación Real Motion.');
        }

        shot.motionSpec = {
          ...shot.motionSpec,
          preferredProviders: ['fal-video', 'veo']
        };

        // El frame V2 ya fue generado antes del fallo no-cobrable de Veo.
        // Lo conservamos para no pagar otra imagen ni perder consistencia.
        shot.qualityForceRegenerate = false;
        shot.safeFailoverResume = true;
        shot.lastGenerationState = undefined;
        shot.error = undefined;
        shot.status = 'pending';

        scene.error = undefined;
        scene.status = 'pending';

        current.error = undefined;
        current.status = 'queued';
        current.progress = {
          ...current.progress,
          phase: 'queued',
          message:
            'Reanudando E1/T1 con Fal usando el frame V2 ya aprobado; Veo falló sin cobro.',
          updatedAt: new Date().toISOString()
        };
        current.productionLog = [
          ...current.productionLog,
          `${new Date().toISOString()} E1/T1 reanudada tras fallo Veo no-cobrable: se conserva frame V2 y se continúa con Fal sin crear un tercer intento.`
        ];

        return current;
      });

      return NextResponse.json({
        ok: true,
        project,
        resumed: true,
        provider: 'fal-video'
      });
    }

    if (action === 'prepare-retry') {
      let retryBudget = {
        currentReservedUsd: 0,
        nextEstimatedUsd: 0,
        hardCapUsd: 0
      };

      const project = await updateProject(projectId, async (current) => {
        const { shot } = getPilotShotOne(current);
        const currentReservedUsd = await reservedMovieSpend(current.id);
        const nextEstimatedUsd = estimatePilotShotSpend(shot);
        const hardCapUsd = Math.min(
          10,
          Math.max(
            0.1,
            Math.ceil(
              (currentReservedUsd + nextEstimatedUsd + 0.05) * 100
            ) / 100
          )
        );

        retryBudget = {
          currentReservedUsd,
          nextEstimatedUsd,
          hardCapUsd
        };

        preparePilotShotOneRetry(current, hardCapUsd);
        return current;
      });

      return NextResponse.json({
        ok: true,
        project,
        preparedRetry: true,
        retryBudget
      });
    }

    let preflight;
    const project = await updateProject(projectId, (current) => {
      if (
        ['planning', 'queued', 'producing', 'composing'].includes(
          current.status
        )
      ) {
        throw new Error(
          'No se puede armar la Toma 1 mientras el proyecto está produciendo.'
        );
      }

      preflight = armPilotShotOne(current);
      return current;
    });

    return NextResponse.json({
      ok: true,
      project,
      preflight,
      armed: true
    });
  } catch (error) {
    return failure(error, 400);
  }
}

async function optionalJson(
  request: Request
): Promise<{ action?: unknown; confirmFalNoCredit?: unknown }> {
  try {
    return await request.json() as {
      action?: unknown;
      confirmFalNoCredit?: unknown;
    };
  } catch {
    return {};
  }
}

function failure(error: unknown, status: number) {
  return NextResponse.json(
    { ok: false, error: safeErrorMessage(error) },
    { status }
  );
}
