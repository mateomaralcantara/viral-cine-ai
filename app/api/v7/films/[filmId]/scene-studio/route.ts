import { NextResponse } from 'next/server';
import { localAdminAuthorized, localOriginAllowed } from '@/lib/v7/security/local-studio-session';
import {
  resumeSceneShot, savePromptRevision, sceneStudioBoard, submitSceneShot
} from '@/lib/v7/production/scene-veo-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ filmId: string }> };
const noStore = { 'Cache-Control': 'private, no-store' };

function fail(status: number, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ ok: false, error: message.slice(0, 600) }, { status, headers: noStore });
}

export async function GET(request: Request, context: Context) {
  if (!localOriginAllowed(request)) return fail(403, 'Solo estudio local.');
  try {
    const { filmId } = await context.params;
    const scene = new URL(request.url).searchParams.get('scene') || 'E03';
    return NextResponse.json({ ok: true, board: await sceneStudioBoard(filmId, scene), providerCalls: 0 }, { headers: noStore });
  } catch (error) {
    return fail(404, error);
  }
}

export async function POST(request: Request, context: Context) {
  if (!localOriginAllowed(request) || !localAdminAuthorized(request)) {
    return fail(403, 'Abre ViralCine desde 127.0.0.1 para habilitar la sesión local.');
  }
  if (Number(request.headers.get('content-length') || 0) > 16000) return fail(413, 'Solicitud demasiado grande.');
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return fail(400, 'JSON inválido.'); }
  const { filmId } = await context.params;
  const shotId = typeof body.shotId === 'string' ? body.shotId : '';
  try {
    if (body.action === 'save-prompt') {
      if (typeof body.promptText !== 'string') return fail(400, 'Falta el prompt.');
      const revision = await savePromptRevision(filmId, shotId, body.promptText);
      return NextResponse.json({ ok: true, revisionId: revision.revisionId, providerCalls: 0 }, { headers: noStore });
    }
    if (body.action === 'resume') {
      return NextResponse.json({ ok: true, result: await resumeSceneShot(filmId, shotId), newGenerationRequests: 0 }, { headers: noStore });
    }
    if (body.action === 'submit') {
      if (typeof body.revisionId !== 'string' || typeof body.authorization !== 'string') return fail(400, 'Falta la versión o la autorización.');
      const result = await submitSceneShot(filmId, shotId, { revisionId: body.revisionId, authorization: body.authorization });
      return NextResponse.json({ ok: true, result }, { headers: noStore });
    }
    return fail(400, 'Acción no permitida.');
  } catch (error) {
    return fail(409, error);
  }
}
