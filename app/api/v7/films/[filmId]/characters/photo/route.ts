import { NextResponse } from 'next/server';
import { localAdminAuthorized, localOriginAllowed } from '@/lib/v7/security/local-studio-session';
import { filmSerie } from '@/lib/v7/production/character-studio';
import { assertKey, MAX_PHOTO_BYTES, savePhoto } from '@/lib/v7/production/character-identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ filmId: string }> };
const noStore = { 'Cache-Control': 'private, no-store' };

/** Subir una foto de un personaje (multipart: key + file). Gratis, no llama a ningún proveedor. */
export async function POST(request: Request, context: Context) {
  if (!localOriginAllowed(request) || !localAdminAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Abre ViralCine desde 127.0.0.1 para habilitar la sesión local.' }, { status: 403, headers: noStore });
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_PHOTO_BYTES + 64 * 1024) {
    return NextResponse.json({ ok: false, error: 'La foto pesa más de 8 MB.' }, { status: 413, headers: noStore });
  }
  try {
    const { filmId } = await context.params;
    const form = await request.formData();
    const key = assertKey(String(form.get('key') ?? ''), 'personaje');
    const file = form.get('file');
    if (!(file instanceof File)) throw new Error('Falta la foto.');
    const { serie } = await filmSerie(filmId);
    const name = await savePhoto(serie, key, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ ok: true, name }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : String(error)).slice(0, 400) }, { status: 409, headers: noStore });
  }
}
