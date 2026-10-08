import { NextResponse } from 'next/server';
import { getProject } from '@/lib/storage/project-store';
import { adaptLegacyProjectToV7 } from '@/lib/v7/compat/legacy-project-adapter';
import { saveV7FilmBundle } from '@/lib/v7/storage/film-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ projectId: string }> };

function summarize(bundle: ReturnType<typeof adaptLegacyProjectToV7>) {
  const sequences = bundle.film.acts.flatMap((act) => act.sequences);
  const scenes = sequences.flatMap((sequence) => sequence.scenes);
  const shots = scenes.flatMap((scene) => scene.shots);
  const takes = shots.flatMap((shot) => shot.takes);
  return {
    filmId: bundle.film.id,
    legacyProjectId: bundle.film.legacyProjectId,
    title: bundle.film.title,
    durationMinutes: bundle.film.durationMinutes,
    acts: bundle.film.acts.length,
    sequences: sequences.length,
    scenes: scenes.length,
    shots: shots.length,
    takes: takes.length,
    selectedTakes: shots.filter((shot) => Boolean(shot.selectedTakeId)).length,
    characters: bundle.film.characters.length,
    voiceProfiles: bundle.voiceProfiles.length,
    assets: bundle.assets.length,
    budgetUsd: bundle.film.budgetUsd,
    source: 'viralcine-6-adapter',
    externalApis: false,
    estimatedApiCostUsd: 0
  };
}

export async function GET(_request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const project = await getProject(projectId);
    const bundle = adaptLegacyProjectToV7(project);
    return NextResponse.json({ ok: true, summary: summarize(bundle) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const payload = await request.json().catch(() => ({})) as { action?: unknown };
    if (payload.action !== 'materialize-local') {
      return NextResponse.json(
        { ok: false, error: 'Acción V7 inválida.' },
        { status: 400 }
      );
    }
    const project = await getProject(projectId);
    const bundle = adaptLegacyProjectToV7(project);
    const stored = await saveV7FilmBundle(bundle);
    return NextResponse.json({
      ok: true,
      summary: summarize(bundle),
      savedAt: stored.savedAt,
      storage: '.data/v7/films/' + stored.film.id + '/bundle.json',
      externalApis: false,
      apiCostUsd: 0
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
