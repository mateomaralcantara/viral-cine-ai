import { getCinemaReference } from '@/lib/v7/production/cinema-core-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ filmId: string; shotId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { filmId, shotId } = await context.params;
    const buffer = await getCinemaReference(filmId, shotId);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': shotId === 'LS02' || shotId === 'LS05' ? 'image/png' : 'image/jpeg',
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch {
    return new Response('Referencia no disponible', { status: 404 });
  }
}
