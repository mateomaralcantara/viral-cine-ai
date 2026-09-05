import { NextResponse } from 'next/server';
import { FilmPlanSchema, ProjectInputSchema } from '@/lib/domain/schemas';
import { ensurePlanShots } from '@/lib/engine/shot-plan';
import {
  deleteProject,
  getProject,
  ProjectDeletionBlockedError,
  updateProject
} from '@/lib/storage/project-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    return NextResponse.json({ ok: true, project: await getProject(projectId) });
  } catch (error) {
    return failure(error, 404);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const payload = await request.json() as { input?: unknown; plan?: unknown };
    const project = await updateProject(projectId, (current) => ({
      ...current,
      input: payload.input ? ProjectInputSchema.parse(payload.input) : current.input,
      plan: payload.plan ? ensurePlanShots(FilmPlanSchema.parse(payload.plan)) : current.plan,
      status: payload.plan ? 'planned' : current.status,
      progress: payload.plan
        ? { phase: 'planned', percent: 15, message: 'Cambios del guion guardados', updatedAt: new Date().toISOString() }
        : current.progress
    }));
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    return failure(error, 400);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    return NextResponse.json({ ok: true, deleted: await deleteProject(projectId) });
  } catch (error) {
    return failure(error, error instanceof ProjectDeletionBlockedError ? 409 : 404);
  }
}

function failure(error: unknown, status: number) {
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Error desconocido' }, { status });
}
