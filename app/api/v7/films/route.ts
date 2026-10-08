import { createHash, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  createV7FilmDraft,
  preflightV7FilmCreation,
  V7FilmCreationInputSchema
} from '@/lib/v7/creation/film-creation';
import { summarizeV7FilmLibraryItem } from '@/lib/v7/library/library-view';
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
    films: bundles.map(summarizeV7FilmLibraryItem),
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
        film: summarizeV7FilmLibraryItem(existing),
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
      film: summarizeV7FilmLibraryItem(stored),
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
