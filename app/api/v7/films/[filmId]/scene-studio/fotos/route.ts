import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { localAdminAuthorized, localOriginAllowed } from '@/lib/v7/security/local-studio-session';
import { uploadScenePhotos, hasAuthorPhoto } from '@/lib/v7/production/author-photos';
import { shotReferencePath } from '@/lib/v7/production/scene-veo-engine';
import { v7FilmRoot } from '@/lib/v7/storage/film-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ filmId: string }> };
const noStore = { 'Cache-Control': 'private, no-store' };
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers: noStore });
const SHOT = /^E\d{2}-P\d{2}$/;
const MAX_FILES = 40;
const MAX_BYTES = 15 * 1024 * 1024;

/** Foto de partida de una toma (la del autor o la de continuidad), para verla en el estudio. */
export async function GET(request: Request, context: Context) {
  if (!localOriginAllowed(request)) return fail(403, 'Solo estudio local.');
  const { filmId } = await context.params;
  const shot = new URL(request.url).searchParams.get('shot') ?? '';
  if (!SHOT.test(shot)) return fail(400, 'Toma inválida.');
  const file = shotReferencePath(filmId, shot);
  if (!(await stat(file).catch(() => null))) return fail(404, 'Esta toma no tiene foto de partida.');
  const author = await hasAuthorPhoto(path.join(v7FilmRoot(filmId), shot.toLowerCase()));
  return new Response(new Uint8Array(await readFile(file)), { headers: { ...noStore, 'Content-Type': 'image/jpeg', 'X-Foto-Del-Autor': author ? '1' : '0' } });
}

/** Subir fotos: a una toma (shotId) o a toda la escena (se reparten entre sus tomas libres). Gratis. */
export async function POST(request: Request, context: Context) {
  if (!localOriginAllowed(request) || !localAdminAuthorized(request)) return fail(403, 'Abre ViralCine desde 127.0.0.1 para subir fotos.');
  const { filmId } = await context.params;
  let form: FormData;
  try { form = await request.formData(); } catch { return fail(400, 'Envía las fotos como formulario.'); }
  const scene = String(form.get('scene') ?? '');
  const shotId = String(form.get('shotId') ?? '');
  if (!/^E\d{2}$/.test(scene)) return fail(400, 'Escena inválida.');
  if (shotId && (!SHOT.test(shotId) || !shotId.startsWith(scene + '-'))) return fail(400, 'Toma inválida.');
  const entries = form.getAll('fotos').filter((f): f is File => typeof f === 'object' && 'arrayBuffer' in f);
  if (!entries.length) return fail(400, 'No llegó ninguna foto.');
  if (entries.length > MAX_FILES) return fail(413, `Máximo ${MAX_FILES} fotos por subida.`);
  const files: Array<{ name: string; data: Buffer }> = [];
  for (const f of entries) {
    if (f.size > MAX_BYTES) return fail(413, `«${f.name}» pesa más de 15 MB.`);
    if (f.type && !/^image\/(jpeg|png|webp)$/.test(f.type)) return fail(415, `«${f.name}» no es JPG, PNG ni WEBP.`);
    files.push({ name: f.name || 'foto.jpg', data: Buffer.from(await f.arrayBuffer()) });
  }
  try {
    return NextResponse.json({ ok: true, ...(await uploadScenePhotos(filmId, scene, files, shotId || undefined)) }, { headers: noStore });
  } catch (e) { return fail(409, e instanceof Error ? e.message : String(e)); }
}
