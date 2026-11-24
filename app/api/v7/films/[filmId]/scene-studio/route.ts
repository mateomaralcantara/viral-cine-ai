import { NextResponse } from 'next/server';
import { localAdminAuthorized, localOriginAllowed } from '@/lib/v7/security/local-studio-session';
import {
  resumeSceneShot, resumeWholeScene, sceneLabels, savePromptRevision, sceneStudioBoard, submitSceneShot, submitWholeScene
} from '@/lib/v7/production/scene-veo-engine';
import { createReadStream } from 'node:fs';
import { v7FilmRoot } from '@/lib/v7/storage/film-store';
import path from 'node:path';
import { listShotVersions, makeStillShot, removeStillShot, restoreShotVersion, shotVersionFile, useVeoVideo } from '@/lib/v7/production/author-photos';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import {
  applyPreflight, approveScene, greenStatus, rebuildScene, HARNESS_JOBS, harnessJob, latestAvance, latestEpisode, scenePreflight, setMasterInfo, shotAuthorAction, startHarnessJob, type HarnessJobKind
} from '@/lib/v7/production/studio-harness';

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
    const labels = await sceneLabels(filmId);
    const scene = new URL(request.url).searchParams.get('scene') || labels.studioLabels[0];
    if (!scene) return fail(404, 'La película no tiene escenas para el estudio.');
    const params = new URL(request.url).searchParams;
    // Análisis inicial (gratis) y estado del harness en marcha.
    if (params.get('preflight') === '1') return NextResponse.json({ ok: true, preflight: await scenePreflight(filmId, scene), providerCalls: 0 }, { headers: noStore });
    if (params.get('job') === '1') return NextResponse.json({ ok: true, job: await harnessJob(filmId, scene), providerCalls: 0 }, { headers: noStore });
    // Ver en el estudio: el último avance de la escena (MP4, con avance/retroceso) y el plano maestro del salón.
    if (params.get('avance') === 'info') {
      const file = await latestAvance(filmId, scene);
      return NextResponse.json({ ok: true, avance: file ? { name: file.split(/[\\/]/).pop(), updatedAt: (await stat(file)).mtime.toISOString() } : null }, { headers: noStore });
    }
    // Versiones anteriores de una toma: la lista y cada video, para verlas y volver a una.
    const versionsOf = params.get('versiones') ?? '';
    if (/^E\d{2}-P\d{2}$/.test(versionsOf)) {
      const id = params.get('id');
      if (id) return serveFile(request, await shotVersionFile(filmId, versionsOf, id), 'video/mp4');
      return NextResponse.json({ ok: true, versiones: await listShotVersions(filmId, versionsOf) }, { headers: noStore });
    }
    // La toma hecha con el material del autor (fotos y videos, sin Veo), para verla.
    const own = params.get('tomaAutor') ?? '';
    if (/^E\d{2}-P\d{2}$/.test(own)) {
      const file = path.join(v7FilmRoot(filmId), own.toLowerCase(), own + '-plano-fijo.mp4');
      if (!(await stat(file).catch(() => null))) return fail(404, own + ' no tiene material tuyo.');
      return serveFile(request, file, 'video/mp4', params.get('descargar') === '1');
    }
    if (params.get('avance') === '1') {
      const file = await latestAvance(filmId, scene);
      if (!file) return fail(404, 'Todavía no hay avance de ' + scene + '. Pulsa «Montar el avance».');
      return serveFile(request, file, 'video/mp4', params.get('descargar') === '1');
    }
    // Escenas en verde: el estudio pregunta cada pocos segundos; las verdes se montan solas (gratis).
    if (params.get('estado') === '1') return NextResponse.json({ ok: true, estado: await greenStatus(filmId, { autoMount: true }) }, { headers: noStore });
    if (params.get('episodio') === '1') {
      const file = await latestEpisode(filmId);
      if (!file) return fail(404, 'Todavía no hay episodio completo montado.');
      // Variantes para descargar: con subtítulos grabados, o los subtítulos sueltos (español / inglés).
      const tipo = params.get('tipo');
      const variant = tipo === 'subtitulada' ? file.replace(/\.mp4$/, '-subtitulada.mp4')
        : tipo === 'srt' ? file.replace(/\.mp4$/, '.srt') : tipo === 'en.srt' ? file.replace(/\.mp4$/, '.en.srt') : file;
      if (!(await stat(variant).catch(() => null))) return fail(404, 'Ese archivo no existe para el último episodio montado.');
      return serveFile(request, variant, variant.endsWith('.srt') ? 'application/x-subrip' : 'video/mp4', params.get('descargar') === '1');
    }
    if (params.get('decorado') === 'info') return NextResponse.json({ ok: true, decorado: await setMasterInfo(filmId).then((d) => d && { ...d, file: undefined }) }, { headers: noStore });
    if (params.get('decorado') === '1') {
      const d = await setMasterInfo(filmId);
      if (!d?.existe) return fail(404, 'Aún no hay plano maestro del salón.');
      return serveFile(request, d.file, 'image/jpeg');
    }
    const board = await sceneStudioBoard(filmId, scene);
    return NextResponse.json({ ok: true, board: { ...board, sceneLabels: labels.studioLabels }, providerCalls: 0 }, { headers: noStore });
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
    const scene = typeof body.scene === 'string' ? body.scene : '';
    if (body.action === 'submit-scene') {
      if (typeof body.authorization !== 'string') return fail(400, 'Falta la autorización de la escena.');
      return NextResponse.json({ ok: true, result: await submitWholeScene(filmId, scene, body.authorization) }, { headers: noStore });
    }
    if (body.action === 'preflight-apply') {
      return NextResponse.json({ ok: true, result: await applyPreflight(filmId, scene), providerCalls: 0 }, { headers: noStore });
    }
    if (body.action === 'harness') {
      const kind = HARNESS_JOBS.find((k) => k === body.kind) as HarnessJobKind | undefined;
      if (!kind) return fail(400, 'Trabajo desconocido.');
      const shots = Array.isArray(body.shots) ? body.shots.filter((x): x is string => typeof x === 'string').slice(0, 30) : [];
      return NextResponse.json({ ok: true, job: await startHarnessJob(filmId, scene, kind, { budgetUsd: Number(body.budgetUsd), shots }) }, { headers: noStore });
    }
    if (body.action === 'usar-veo') {
      return NextResponse.json({ ok: true, result: await useVeoVideo(filmId, shotId) }, { headers: noStore });
    }
    if (body.action === 'restaurar-version') {
      if (typeof body.versionId !== 'string') return fail(400, 'Falta la versión.');
      return NextResponse.json({ ok: true, result: await restoreShotVersion(filmId, shotId, body.versionId) }, { headers: noStore });
    }
    if (body.action === 'plano-fijo') {
      return NextResponse.json({ ok: true, result: await makeStillShot(filmId, shotId) }, { headers: noStore });
    }
    if (body.action === 'quitar-plano-fijo') {
      return NextResponse.json({ ok: true, result: await removeStillShot(filmId, shotId) }, { headers: noStore });
    }
    if (body.action === 'rehacer-montaje') {
      return NextResponse.json({ ok: true, result: await rebuildScene(filmId, scene) }, { headers: noStore });
    }
    if (body.action === 'approve-scene') {
      return NextResponse.json({ ok: true, result: await approveScene(filmId, scene) }, { headers: noStore });
    }
    if (body.action === 'shot-author') {
      const what = ['fijar', 'soltar', 'quitar', 'devolver'].find((x) => x === body.what) as 'fijar' | 'soltar' | 'quitar' | 'devolver' | undefined;
      if (!what) return fail(400, 'Acción de toma desconocida.');
      return NextResponse.json({ ok: true, result: await shotAuthorAction(filmId, shotId, what) }, { headers: noStore });
    }
    if (body.action === 'resume-scene') {
      return NextResponse.json({ ok: true, result: await resumeWholeScene(filmId, scene) }, { headers: noStore });
    }
    if (body.action === 'resume') {
      return NextResponse.json({ ok: true, result: await resumeSceneShot(filmId, shotId), newGenerationRequests: 0 }, { headers: noStore });
    }
    if (body.action === 'submit') {
      if (typeof body.revisionId !== 'string' || typeof body.authorization !== 'string') return fail(400, 'Falta la versión o la autorización.');
      const result = await submitSceneShot(filmId, shotId, { revisionId: body.revisionId, authorization: body.authorization, redo: body.redo === true });
      return NextResponse.json({ ok: true, result }, { headers: noStore });
    }
    return fail(400, 'Acción no permitida.');
  } catch (error) {
    return fail(409, error);
  }
}

/** Sirve un archivo local con soporte de rangos (para poder avanzar y retroceder en el video). */
async function serveFile(request: Request, file: string, type: string, download = false) {
  const size = (await stat(file)).size;
  // Descargar al PC: el navegador guarda el archivo con su nombre real en vez de abrirlo.
  const disposition: Record<string, string> = download ? { 'Content-Disposition': `attachment; filename="${file.split(/[\\/]/).pop()!.replace(/[^\w.-]/g, '_')}"` } : {};
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') || '');
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    if (!(start >= 0 && start <= end && end < size)) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { ...noStore, ...disposition, 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` } });
  }
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, { headers: { ...noStore, ...disposition, 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(size) } });
}
