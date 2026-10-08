import { createHash, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  createV7FilmDraft,
  preflightV7FilmCreation,
  V7FilmCreationInputSchema
} from '@/lib/v7/creation/film-creation';
import {
  listV7FilmBundles,
  readV7FilmBundle,
  saveV7FilmBundle,
  v7FilmBundleExists
} from '@/lib/v7/storage/film-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const bundles = await listV7FilmBundles();
  return NextResponse.json({
    ok: true,
    films: bundles.map((bundle) => summarize(bundle)),
    externalApis: false,
    apiCostUsd: 0
  });
}

export async function POST(request: Request) {
  try {
    const raw = await request.json() as Record<string, unknown>;
    const requestId =
      typeof raw.requestId === 'string' && raw.requestId.trim().length >= 8
        ? raw.requestId.trim()
        : randomUUID();

    const input = {
      title: raw.title,
      story: raw.story,
      durationMinutes: raw.durationMinutes,
      genre: raw.genre,
      aspectRatio: raw.aspectRatio,
      language: raw.language,
      budgetUsd: raw.budgetUsd,
      quality: raw.quality
    };

    const preflight = preflightV7FilmCreation(input);
    if (!preflight.passed) {
      return NextResponse.json({ ok: false, preflight }, { status: 400 });
    }

    const filmId = stableFilmId(requestId);
    if (await v7FilmBundleExists(filmId)) {
      const existing = await readV7FilmBundle(filmId);
      return NextResponse.json({
        ok: true,
        idempotentReplay: true,
        preflight,
        film: summarize(existing),
        workflow: existing.workflow,
        externalApis: false,
        apiCostUsd: 0
      });
    }

    const parsed = V7FilmCreationInputSchema.parse(preflight.normalized);
    const draft = createV7FilmDraft(parsed, new Date().toISOString(), filmId);
    const stored = await saveV7FilmBundle({
      film: draft.film,
      assets: [],
      voiceProfiles: [],
      creationInput: draft.creationInput,
      workflow: draft.workflow
    });

    return NextResponse.json({
      ok: true,
      idempotentReplay: false,
      preflight,
      film: summarize(stored),
      workflow: stored.workflow,
      externalApis: false,
      apiCostUsd: 0
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}

function stableFilmId(requestId: string) {
  return 'film-' + createHash('sha256').update(requestId).digest('hex').slice(0, 24);
}

function summarize(bundle: Awaited<ReturnType<typeof readV7FilmBundle>>) {
  const sequences = bundle.film.acts.flatMap((act) => act.sequences);
  const scenes = sequences.flatMap((sequence) => sequence.scenes);
  const shots = scenes.flatMap((scene) => scene.shots);
  const takes = shots.flatMap((shot) => shot.takes);
  const nextStage = bundle.workflow?.stages.find((stage) =>
    stage.status === 'ready' || stage.status === 'in-progress'
  );

  return {
    id: bundle.film.id,
    title: bundle.film.title,
    story: bundle.film.premise,
    durationMinutes: bundle.film.durationMinutes,
    genre: bundle.film.genre,
    aspectRatio: bundle.film.aspectRatio,
    language: bundle.film.language,
    budgetUsd: bundle.film.budgetUsd,
    quality: bundle.creationInput?.quality ?? bundle.film.metadata.qualityPreset ?? 'cine',
    acts: bundle.film.acts.length,
    sequences: sequences.length,
    scenes: scenes.length,
    shots: shots.length,
    takes: takes.length,
    characters: bundle.film.characters.length,
    legacyProjectId: bundle.film.legacyProjectId,
    nextStage: nextStage?.id ?? null,
    nextStageLabel: nextStage?.label ?? null,
    updatedAt: bundle.film.updatedAt,
    savedAt: bundle.savedAt
  };
}
