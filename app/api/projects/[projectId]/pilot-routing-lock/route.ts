import { NextResponse } from 'next/server';
import {
  applyFifteenDaysPilotRoutingLocks,
  getPilotRoutingLockStatus
} from '@/lib/engine/pilot-routing-lock-v5';
import {
  estimatedGenerationCost,
  totalReservedSpend
} from '@/lib/engine/spend-guard';
import { safeErrorMessage } from '@/lib/engine/production-safety';
import {
  getProject,
  updateProject
} from '@/lib/storage/project-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const project = await getProject(projectId);

    return NextResponse.json({
      ok: true,
      routing: routingPreflight(project)
    });
  } catch (error) {
    return failure(error, 404);
  }
}

export async function POST(_request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    let applied = 0;

    const project = await updateProject(projectId, (current) => {
      if (!current.plan?.realMotion) {
        throw new Error('Este proyecto no tiene Real Motion 5.0.');
      }

      if (
        ['planning', 'queued', 'producing', 'composing'].includes(
          current.status
        )
      ) {
        throw new Error(
          'Routing Lock está bloqueado mientras el proyecto produce.'
        );
      }

      applied = applyFifteenDaysPilotRoutingLocks(current);

      current.productionLog = [
        ...current.productionLog,
        `${new Date().toISOString()} Pilot Routing Lock: ${applied} tomas con proveedor primario y fallback definidos.`
      ];

      return current;
    });

    return NextResponse.json({
      ok: true,
      applied,
      project,
      routing: routingPreflight(project)
    });
  } catch (error) {
    return failure(error, 400);
  }
}

function routingPreflight(project: Awaited<ReturnType<typeof getProject>>) {
  const status = getPilotRoutingLockStatus(project);
  const pilotIds = new Set(
    project.plan?.realMotion?.pilotShotIds || []
  );

  const rows =
    project.plan?.scenes.flatMap((scene) =>
      scene.shots
        .filter((shot) => pilotIds.has(shot.id))
        .map((shot) => {
          const routingShot = status.shots.find(
            (item) => item.shotId === shot.id
          );
          const estimatedUsd = estimatedGenerationCost(shot, scene);

          return {
            shotId: shot.id,
            shotTitle: shot.title,
            durationSeconds: shot.durationSeconds,
            expectedProviders:
              routingShot?.expectedProviders || [],
            currentProviders:
              routingShot?.currentProviders || [],
            ready: routingShot?.ready || false,
            estimatedUsd
          };
        })
    ) || [];

  const estimatedPilotUsd = round(
    rows.reduce((sum, row) => sum + row.estimatedUsd, 0)
  );

  const reservedMovieUsd = round(totalReservedSpend(project));
  const movieLimitUsd = project.input.budgetUsd;

  return {
    ...status,
    rows,
    estimatedPilotUsd,
    reservedMovieUsd,
    movieLimitUsd,
    estimatedAfterPilotUsd: round(
      reservedMovieUsd + estimatedPilotUsd
    ),
    withinMovieLimit:
      reservedMovieUsd + estimatedPilotUsd <=
      movieLimitUsd + 0.001
  };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function failure(error: unknown, status: number) {
  return NextResponse.json(
    { ok: false, error: safeErrorMessage(error) },
    { status }
  );
}
