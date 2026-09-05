import { NextResponse } from 'next/server';
import { ProjectInputSchema } from '@/lib/domain/schemas';
import { createProject, listProjects } from '@/lib/storage/project-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ ok: true, projects: await listProjects() });
  } catch (error) {
    return failure(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const input = ProjectInputSchema.parse(await request.json());
    return NextResponse.json({ ok: true, project: await createProject(input) }, { status: 201 });
  } catch (error) {
    return failure(error, 400);
  }
}

function failure(error: unknown, status: number) {
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Error desconocido' }, { status });
}
