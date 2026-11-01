import { NextResponse } from 'next/server';
import { readV7FilmBundle } from '@/lib/v7/storage/film-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ filmId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { filmId } = await context.params;
    const bundle = await readV7FilmBundle(filmId);
    return NextResponse.json({
      ok: true,
      bundle,
      externalApis: false,
      apiCostUsd: 0
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 404 }
    );
  }
}
