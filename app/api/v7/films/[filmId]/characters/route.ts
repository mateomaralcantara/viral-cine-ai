import { NextResponse } from 'next/server';
import { localAdminAuthorized, localOriginAllowed } from '@/lib/v7/security/local-studio-session';
import {
  approveMaster, charactersBoard, createCharacter, elevenVoices, generateMaster, importFromScript, updateCharacter
} from '@/lib/v7/production/character-studio';
import { filmSerie } from '@/lib/v7/production/character-studio';
import { removePhoto } from '@/lib/v7/production/character-identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Context = { params: Promise<{ filmId: string }> };
const noStore = { 'Cache-Control': 'private, no-store' };
const fail = (status: number, error: unknown) =>
  NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : String(error)).slice(0, 600) }, { status, headers: noStore });
const ok = (data: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...data }, { headers: noStore });

export async function GET(request: Request, context: Context) {
  if (!localOriginAllowed(request)) return fail(403, 'Solo estudio local.');
  try {
    const { filmId } = await context.params;
    if (new URL(request.url).searchParams.get('voices') === '1') return ok({ voices: await elevenVoices() });
    return ok({ board: await charactersBoard(filmId) });
  } catch (error) { return fail(404, error); }
}

export async function POST(request: Request, context: Context) {
  if (!localOriginAllowed(request) || !localAdminAuthorized(request)) return fail(403, 'Abre ViralCine desde 127.0.0.1 para habilitar la sesión local.');
  if (Number(request.headers.get('content-length') || 0) > 32000) return fail(413, 'Solicitud demasiado grande.');
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return fail(400, 'JSON inválido.'); }
  const { filmId } = await context.params;
  const key = typeof body.key === 'string' ? body.key : '';
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  try {
    switch (body.action) {
      case 'create': return ok({ key: await createCharacter(filmId, str(body.nombre), str(body.descripcion)) });
      case 'update':
        await updateCharacter(filmId, key, {
          nombre: typeof body.nombre === 'string' ? body.nombre : undefined,
          descripcion: typeof body.descripcion === 'string' ? body.descripcion : undefined,
          notas: typeof body.notas === 'string' ? body.notas : undefined,
          voz: body.voz === null ? null : (body.voz && typeof body.voz === 'object' ? body.voz as { voiceId: string; nombre: string } : undefined)
        });
        return ok();
      case 'import': return ok({ created: await importFromScript(filmId) });
      case 'generate-master': return ok({ result: await generateMaster(filmId, key, str(body.confirmation)) });
      case 'approve': await approveMaster(filmId, key); return ok();
      case 'remove-photo': { const { serie } = await filmSerie(filmId); await removePhoto(serie, key, str(body.name)); return ok(); }
      default: return fail(400, 'Acción no permitida.');
    }
  } catch (error) { return fail(409, error); }
}
