import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COOKIE = 'v8e02_owner';
const ENDPOINT =
  'https://wrxeerltoapvybhaxlmu.supabase.co/functions/v1/viralcine-v8-console-api';

const ACTIONS = new Set([
  'info', 'setup', 'login', 'logout',
  'status', 'save-key', 'balance', 'launch', 'pause'
]);

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json(
      { error: 'Origen no autorizado.' },
      { status: 403 }
    );
  }

  try {
    const raw = await request.text();

    if (raw.length > 6000) {
      return NextResponse.json(
        { error: 'Solicitud demasiado grande.' },
        { status: 413 }
      );
    }

    const body = JSON.parse(raw) as Record<string, unknown>;
    const action = body?.action;

    if (typeof action !== 'string' || !ACTIONS.has(action)) {
      return NextResponse.json(
        { error: 'Accion no permitida.' },
        { status: 400 }
      );
    }

    const upstream = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-v8-owner-session': request.cookies.get(COOKIE)?.value || ''
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(25000)
    });

    const result = await upstream.json() as Record<string, unknown>;

    const session = result.ownerSession;
    delete result.ownerSession;

    const response = NextResponse.json(result, {
      status: upstream.status,
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff'
      }
    });

    if (
      upstream.ok &&
      (action === 'setup' || action === 'login') &&
      typeof session === 'string' &&
      session.length >= 48
    ) {
      response.cookies.set(COOKIE, session, {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        path: '/api/v8/scene2',
        maxAge: 48 * 3600
      });
    }

    if (action === 'logout') {
      response.cookies.set(COOKIE, '', {
        path: '/api/v8/scene2',
        maxAge: 0
      });
    }

    return response;
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error
        ? error.message
        : 'No se pudo conectar con Supabase.'
    }, { status: 503 });
  }
}