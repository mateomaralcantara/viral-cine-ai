import { NextResponse } from 'next/server';
import { cinemaAction, getCinemaBoard, assertCinemaWriteAccess } from '@/lib/v7/production/cinema-core-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ filmId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { filmId } = await context.params;
    const board = await getCinemaBoard(filmId);
    return NextResponse.json({ ok: true, board, callsMade: 0 }, {
      headers: { 'Cache-Control': 'private, no-store' }
    });
  } catch (error) {
    return NextResponse.json({
      ok: false, error: error instanceof Error ? error.message : String(error)
    }, { status: 404 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    assertCinemaWriteAccess(request);
    const { filmId } = await context.params;
    const payload = await request.json() as {
      action: 'submit' | 'resume';
      shotId: string;
      referenceSha256?: string;
      approvedEstimateUsd?: number;
      confirm?: boolean;
    };
    const result = await cinemaAction(filmId, payload);
    return NextResponse.json({ ok: true, result }, {
      headers: { 'Cache-Control': 'private, no-store' }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('UNAUTHORIZED') ? 401 :
      message.includes('ORIGIN_BLOCKED') ? 403 :
      message.includes('BUSY') ? 409 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
