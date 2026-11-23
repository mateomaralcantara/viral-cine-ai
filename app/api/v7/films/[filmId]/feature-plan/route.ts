import { NextResponse } from 'next/server';
import { readV7FilmBundle } from '@/lib/v7/storage/film-store';
import { makeFeatureFilmPlan } from '@/lib/v7/feature-film/level-two-planner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ filmId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { filmId } = await context.params;
    const bundle = await readV7FilmBundle(filmId);
    const params = new URL(request.url).searchParams;
    const requested = params.get('minutes') ?? '15';
    if (!/^(4|10|15|30|60|90)$/.test(requested)) {
      return NextResponse.json({
        ok: false, error: 'Duración no admitida: 4, 10, 15, 30, 60 o 90 minutos.'
      }, { status: 400 });
    }

    // Tariff is server-configured; no API request is sent to Google.
    const value = Number(process.env.V7_VEO_USD_PER_SECOND || 0);
    const rate = Number.isFinite(value) && value > 0 && value <= 10 ? value : null;
    const plan = makeFeatureFilmPlan({ minutes: Number(requested), videoRateUsdPerSecond: rate });

    return NextResponse.json({
      ok: true,
      currentFilm: {
        id: bundle.film.id,
        title: bundle.film.title,
        currentDurationMinutes: bundle.film.durationMinutes,
        migratedFromV6: Boolean(bundle.film.legacyProjectId),
        existingSceneCount: bundle.film.acts.flatMap((a) => a.sequences.flatMap((s) => s.scenes)).length
      },
      plan,
      warning: 'Es una propuesta estructural, no un guion terminado ni una autorización de gasto.',
      externalApiCalls: 0,
      paidGenerationEnabled: false
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 404 });
  }
}
