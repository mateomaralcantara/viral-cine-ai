import { NextResponse } from 'next/server';
import {
  armPilotShotOne,
  getPilotShotOnePreflight
} from '@/lib/engine/pilot-shot-one-v5';
import {
  getProject,
  updateProject
} from '@/lib/storage/project-store';
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
    const action = body.action === 'arm' ? 'arm' : 'preflight';

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
