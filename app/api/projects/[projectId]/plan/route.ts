import { NextResponse } from 'next/server';
import { estimateBudget } from '@/lib/engine/budget';
import { generateFilmPlan } from '@/lib/engine/planner';
import { appendSpend, estimateOperationCost } from '@/lib/engine/spend-ledger';
import { saveProject, updateProject } from '@/lib/storage/project-store';
import { assertPaidGenerationAllowed, classifyProductionError, safeErrorMessage } from '@/lib/engine/production-safety';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Context = { params: Promise<{ projectId: string }> };

export async function POST(_request: Request, context: Context) {
  const { projectId } = await context.params;
  let project;
  const realPlanning = process.env.PRODUCTION_MODE === 'real';
  const estimatedUsd = estimateOperationCost('script', 1);
  const idempotencyKey = `script:${projectId}:plan`;
  let scriptSubmitted = false;
  try {
    project = await updateProject(projectId, (current) => {
      if (current.status === 'planning') throw new Error('La planificación ya está en curso.');
      current.status = 'planning';
      current.error = undefined;
      current.progress = { phase: 'planning', percent: 5, message: 'La dirección creativa está escribiendo la película', updatedAt: new Date().toISOString() };
      current.productionLog.push(`${new Date().toISOString()} Planificación iniciada`);
      return current;
    });

    if (realPlanning) {
      assertPaidGenerationAllowed('generar guion y plan cinematográfico con OpenAI', 'OPENAI_API_KEY');
      await appendSpend(projectId, {
        operation: 'script',
        provider: 'openai',
        model: process.env.OPENAI_SCRIPT_MODEL || 'gpt-5.6-terra',
        state: 'reserved',
        estimatedUsd,
        idempotencyKey
      });
      await appendSpend(projectId, {
        operation: 'script',
        provider: 'openai',
        model: process.env.OPENAI_SCRIPT_MODEL || 'gpt-5.6-terra',
        state: 'submitted',
        estimatedUsd,
        idempotencyKey
      });
      scriptSubmitted = true;
    }

    const plan = await generateFilmPlan(project.input);
    if (scriptSubmitted) {
      await appendSpend(projectId, {
        operation: 'script',
        provider: 'openai',
        model: process.env.OPENAI_SCRIPT_MODEL || 'gpt-5.6-terra',
        state: 'succeeded',
        estimatedUsd,
        idempotencyKey
      });
    }
    project.plan = plan;
    project.budget = estimateBudget(project.input, plan);
    project.status = 'planned';
    project.progress = { phase: 'planned', percent: 15, message: 'Guion, personajes y escenas listos para revisión', updatedAt: new Date().toISOString() };
    project.productionLog.push(`${new Date().toISOString()} Plan creado con ${plan.scenes.length} escenas`);
    project = await saveProject(project);
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    if (scriptSubmitted) {
      await appendSpend(projectId, {
        operation: 'script',
        provider: 'openai',
        model: process.env.OPENAI_SCRIPT_MODEL || 'gpt-5.6-terra',
        state: 'failed-unknown',
        estimatedUsd,
        idempotencyKey,
        error: safeErrorMessage(error)
      }).catch(() => undefined);
    }
    if (project) {
      const kind = classifyProductionError(error);
      project.status = kind === 'billing' ? 'paused-billing' : kind === 'safety' ? 'paused-safety' : 'failed';
      project.error = safeErrorMessage(error);
      project.progress = { phase: project.status, percent: 5, message: project.error, updatedAt: new Date().toISOString() };
      await saveProject(project);
    }
    return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });
  }
}
