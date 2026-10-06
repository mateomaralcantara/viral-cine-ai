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
  latestSpendForKey,
  reservedMovieSpend
} from '@/lib/engine/spend-ledger';
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

async function optionalJson(request: Request): Promise<{ action?: unknown }> {
  try {
    return await request.json() as { action?: unknown };
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
