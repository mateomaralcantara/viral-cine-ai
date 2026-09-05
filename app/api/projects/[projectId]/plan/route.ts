import { NextResponse } from 'next/server';
import { estimateBudget } from '@/lib/engine/budget';
import { generateFilmPlan } from '@/lib/engine/planner';
import { getProject, saveProject } from '@/lib/storage/project-store';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Context = { params: Promise<{ projectId: string }> };

export async function POST(_request: Request, context: Context) {
  const { projectId } = await context.params;
  let project;
  try {
    project = await getProject(projectId);
    project.status = 'planning';
    project.error = undefined;
    project.progress = { phase: 'planning', percent: 5, message: 'La dirección creativa está escribiendo la película', updatedAt: new Date().toISOString() };
    project.productionLog.push(`${new Date().toISOString()} Planificación iniciada`);
    project = await saveProject(project);

    const plan = await generateFilmPlan(project.input);
    project.plan = plan;
    project.budget = estimateBudget(project.input, plan);
    project.status = 'planned';
    project.progress = { phase: 'planned', percent: 15, message: 'Guion, personajes y escenas listos para revisión', updatedAt: new Date().toISOString() };
    project.productionLog.push(`${new Date().toISOString()} Plan creado con ${plan.scenes.length} escenas`);
    project = await saveProject(project);
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    if (project) {
      project.status = 'failed';
      project.error = error instanceof Error ? error.message : 'No se pudo crear el plan';
      project.progress = { phase: 'failed', percent: 5, message: project.error, updatedAt: new Date().toISOString() };
      await saveProject(project);
    }
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Error desconocido' }, { status: 400 });
  }
}
