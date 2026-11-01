import { NextResponse } from 'next/server';
import {
  createDosToquesBundle, DOS_TOQUES_ID, getDosToquesProductionStats
} from '@/lib/v7/presets/dos-toques-de-bocina';
import {
  readV7FilmBundle, saveV7FilmBundle, v7FilmBundleExists
} from '@/lib/v7/storage/film-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Local-studio preproduction import only.
 * This route does NOT call image/audio/video providers or launch any render.
 * It is deliberately disabled in public production until the full auth system
 * and durable transactional storage are integrated.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({
      ok: false,
      error: 'La importación de guiones está bloqueada en el despliegue público hasta autenticar administradores.'
    }, { status: 403 });
  }

  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ ok: false, error: 'Origen no autorizado.' }, { status: 403 });
  }

  try {
    // Fixed movie ID: repeated presses never create a second independent film.
    const alreadyExists = await v7FilmBundleExists(DOS_TOQUES_ID);
    const bundle = alreadyExists
      ? await readV7FilmBundle(DOS_TOQUES_ID)
      : await saveV7FilmBundle(createDosToquesBundle());
    // NEVER overwrite pre-existing work: scenes, voices and future takes survive.
    return NextResponse.json({
      ok: true,
      film: {
        id: bundle.film.id, title: bundle.film.title,
        durationMinutes: bundle.film.durationMinutes,
        budgetUsd: bundle.film.budgetUsd
      },
      idempotentReplay: alreadyExists,
      productionStats: getDosToquesProductionStats(),
      storyTreatmentApproved: true,
      screenplayRenderApproved: false,
      externalApiCalls: 0,
      paidGenerations: 0,
      nextUrl: '/v7/films/' + encodeURIComponent(bundle.film.id) + '?tab=scenes'
    }, { status: alreadyExists ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ ok: false,
      error: error instanceof Error ? error.message : String(error) },
      { status: 400 });
  }
}
