import { NextResponse } from 'next/server';
import { localOriginAllowed } from '@/lib/v7/security/local-studio-session';
import {
  approvedE02References,
  getApprovedE02Image,
} from '@/lib/v7/production/e02-supabase-references';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILM = 'film-dos-toques-de-bocina-v7';

const IDS = Array.from(
  { length: 7 },
  (_, i) => `E02-P${String(i + 1).padStart(2, '0')}`
);

type Context = {
  params: Promise<{ filmId: string }>;
};

export async function GET(request: Request, context: Context) {
  if (!localOriginAllowed(request)) {
    return NextResponse.json(
      { ok: false, error: 'Solo se permite acceso desde localhost.' },
      { status: 403 }
    );
  }

  const { filmId } = await context.params;

  if (filmId !== FILM) {
    return NextResponse.json(
      { ok: false, error: 'Pelicula incorrecta.' },
      { status: 404 }
    );
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('shot');

    if (id !== null) {
      if (!IDS.includes(id)) {
        return NextResponse.json(
          { ok: false, error: 'Toma desconocida.' },
          { status: 404 }
        );
      }

      const image = await getApprovedE02Image(id);

      if (!image) {
        return NextResponse.json(
          { ok: false, error: 'Imagen no disponible en Supabase.' },
          { status: 404 }
        );
      }

      return new NextResponse(new Uint8Array(image.bytes), {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'ETag': `"${image.hash}"`,
        },
      });
    }

    const board = await approvedE02References();

    return NextResponse.json({
      ok: true,
      configured: board.configured,
      approvedCount: board.approvedCount,
      requiredCount: 7,
      images: IDS.map(shotId => ({
        id: shotId,
        approved: board.shots[shotId]?.approved === true,
        ready: board.shots[shotId]?.readyForScene === true,
        sha256: board.shots[shotId]?.sha256 || null,
        url: board.shots[shotId]?.readyForScene
          ? `/api/v7/films/${encodeURIComponent(FILM)}/scene02-gallery?shot=${shotId}`
          : null,
      })),
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error
        ? error.message
        : 'No se pudieron recuperar las fotos.',
    }, { status: 503 });
  }
}