import { NextResponse } from 'next/server';
import { localOriginAllowed } from '@/lib/v7/security/local-studio-session';
import { approvedE02References } from '@/lib/v7/production/e02-supabase-references';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = {
  params: Promise<{ filmId: string }>;
};

export async function GET(request: Request, context: Context) {
  if (!localOriginAllowed(request)) {
    return NextResponse.json(
      { ok:false, error:'Acceso local requerido.' },
      { status:403 }
    );
  }

  const { filmId } = await context.params;

  if (filmId !== 'film-dos-toques-de-bocina-v7') {
    return NextResponse.json(
      { ok:false, error:'Pelicula desconocida.' },
      { status:404 }
    );
  }

  try {
    const board = await approvedE02References();

    return NextResponse.json(board, {
      headers:{'Cache-Control':'private, no-store'}
    });
  } catch (error) {
    return NextResponse.json({
      ok:false,
      error:error instanceof Error
        ? error.message
        : 'Error al consultar Supabase'
    }, {status:503});
  }
}

// No alterar las siete referencias aprobadas.
export async function POST() {
  return NextResponse.json({
    ok:false,
    error:'Las fotografias ya estan guardadas y aprobadas.'
  }, {status:405});
}