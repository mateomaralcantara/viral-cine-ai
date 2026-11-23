import { NextResponse } from 'next/server';
import { FilmPlanSchema } from '@/lib/domain/schemas';
import {
  FIFTEEN_DAYS_INPUT_V5,
  buildFifteenDaysPilotPlanV5
} from '@/lib/production-presets/fifteen-days-pilot-v5';
import {
  createProject,
  listProjects,
  saveProject
} from '@/lib/storage/project-store';
import { safeErrorMessage } from '@/lib/engine/production-safety';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const existing = (await listProjects()).find(
      (project) =>
        project.input.title.trim().toLocaleUpperCase() === '15 DÍAS' &&
        project.plan?.realMotion?.version === '5.0-real-motion-v1'
    );

    if (existing) {
      return NextResponse.json({
        ok: true,
        project: existing,
        reused: true
      });
    }

    const created = await createProject(FIFTEEN_DAYS_INPUT_V5);
    const now = new Date().toISOString();
    const plan = FilmPlanSchema.parse(buildFifteenDaysPilotPlanV5());

    const project = await saveProject({
      ...created,
      status: 'planned',
      plan,
      progress: {
        phase: 'v5-pilot-ready',
        percent: 8,
        message:
          'ViralCine 5.0: Character Bible, Emotional Score y piloto Real Motion de 8 tomas listos para preflight.',
        totalScenes: plan.scenes.length,
        currentScene: 1,
        updatedAt: now
      },
      productionLog: [
        ...created.productionLog,
        now + ' Preset 15 DÍAS Real Motion 5.0 instalado',
        now + ' Character Bible: 5/5 personajes',
        now + ' Piloto Real Motion: 8 tomas preparadas',
        now + ' FINAL_MODE: still-motion prohibido'
      ]
    });

    return NextResponse.json({
      ok: true,
      project,
      reused: false
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: safeErrorMessage(error) },
      { status: 400 }
    );
  }
}
