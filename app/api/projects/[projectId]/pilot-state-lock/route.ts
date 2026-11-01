import { NextResponse } from 'next/server';
import {
  applyFifteenDaysPilotStateLocks,
  getPilotStateLockStatus
} from '@/lib/engine/pilot-state-lock-v5';
import { safeErrorMessage } from '@/lib/engine/production-safety';
import { getProject, updateProject } from '@/lib/storage/project-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const project = await getProject(projectId);
    return NextResponse.json({
      ok: true,
      stateLock: getPilotStateLockStatus(project)
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

      if (['planning', 'queued', 'producing', 'composing'].includes(current.status)) {
        throw new Error('State Lock está bloqueado mientras el proyecto produce.');
      }

      applied = applyFifteenDaysPilotStateLocks(current);

      current.productionLog = [
        ...current.productionLog,
        `${new Date().toISOString()} Pilot State Lock: ${applied} tomas asociadas a su estado visual correcto.`
      ];

      return current;
    });

    return NextResponse.json({
      ok: true,
      applied,
      project,
      stateLock: getPilotStateLockStatus(project)
    });
  } catch (error) {
    return failure(error, 400);
  }
}

function failure(error: unknown, status: number) {
  return NextResponse.json(
    { ok: false, error: safeErrorMessage(error) },
    { status }
  );
}
