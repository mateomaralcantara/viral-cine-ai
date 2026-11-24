import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { localAdminAuthorized, localOriginAllowed } from '@/lib/v7/security/local-studio-session';
import { countMarkedShots, normalizeBreakdown, requestFullBreakdown, slugKey } from '@/lib/v7/creation/script-breakdown';
import { estimateFilmBudget } from '@/lib/v7/creation/budget-estimate';
import { buildShortFilmBundle, shortFilmStats, type ShortFilmSpec } from '@/lib/v7/presets/short-film-builder';
import { saveV7FilmBundle, v7DataRoot, v7FilmBundleExists } from '@/lib/v7/storage/film-store';
import { googleClient, videoPlatform } from '@/lib/v7/production/scene-veo-engine';
import { readSheet, writeSheet } from '@/lib/v7/production/character-identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 800;
const noStore = { 'Cache-Control': 'private, no-store' };
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers: noStore });
const draftPath = (id: string) => path.join(v7DataRoot(), 'desgloses', id + '.json');

type Draft = { spec: ShortFilmSpec; title: string; slug: string; quality: string; marked: number; createdAt: string };

/** Vista de revisión: escena por escena, cuántas tomas y cuáles, con su frase. */
function preview(spec: ShortFilmSpec, marked: number) {
  const stats = shortFilmStats(spec);
  return {
    stats, marked,
    aviso: marked > 0 && stats.shots < marked ? `Tu guion marca ${marked} planos y el desglose propone ${stats.shots} tomas. Revisa las escenas antes de crear.` : '',
    personajes: spec.characters.filter((x) => !/sin imagen/i.test(x.appearance)).map((c) => c.name),
    escenas: spec.scenes.map((s, i) => ({
      label: 'E' + String(i + 1).padStart(2, '0'), titulo: s.title, segundos: s.beats.reduce((n, b) => n + (b.seconds ?? 8), 0),
      tomas: s.beats.map((b, j) => ({ label: 'P' + String(j + 1).padStart(2, '0'), titulo: b.title, segundos: b.seconds ?? 8, enCamara: b.onCamera === true, quien: b.voice, frase: b.line }))
    })),
    presupuesto: estimateFilmBudget({ seconds: stats.totalSeconds, shots: stats.shots })
  };
}

/**
 * DESGLOSE DEL GUION EN DOS PASOS:
 *  mode=propuesta: la IA desglosa el guion completo (por partes si es largo) y se guarda un BORRADOR; no se crea nada.
 *  mode=crear:     con el visto bueno del autor, el borrador se convierte en la película.
 * Solo en el estudio local (claves de Google y disco del estudio).
 */
export async function POST(request: Request) {
  if (!localOriginAllowed(request) || !localAdminAuthorized(request)) {
    return fail(403, 'El desglose del guion funciona en el estudio local (tu PC). En la web publicada se activará cuando el almacenamiento esté en la nube.');
  }
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return fail(400, 'JSON inválido.'); }

  if (body.mode === 'crear') {
    const id = String(body.draftId ?? '');
    if (!/^[a-f0-9-]{36}$/.test(id)) return fail(400, 'Borrador inválido.');
    let draft: Draft;
    try { draft = JSON.parse(await readFile(draftPath(id), 'utf8')) as Draft; } catch { return fail(404, 'El borrador ya no existe: vuelve a desglosar.'); }
    let filmId = `film-${draft.slug}-v7`;
    for (let n = 2; await v7FilmBundleExists(filmId); n++) filmId = `film-${draft.slug}-${n}-v7`;
    const spec = { ...draft.spec, id: filmId };
    await saveV7FilmBundle(buildShortFilmBundle(spec));
    // Fichas de los personajes con imagen (la serie se comparte: los retratos ya aprobados se conservan).
    let order = 1;
    for (const c of spec.characters.filter((x) => !/sin imagen/i.test(x.appearance))) {
      if (!(await readSheet(draft.slug, c.key))) await writeSheet(draft.slug, { key: c.key, nombre: c.name, descripcion: c.appearance, vestuarios: {}, voz: null, notas: c.role, aprobado: null, orden: order });
      order++;
    }
    return NextResponse.json({ ok: true, filmId, nextUrl: '/v7/films/' + encodeURIComponent(filmId) + '?tab=studio' }, { headers: noStore });
  }

  const title = String(body.title ?? '').trim();
  const story = String(body.story ?? '').trim();
  const minutes = Math.max(1, Math.min(180, Number(body.durationMinutes) || 15));
  const genre = String(body.genre ?? 'Drama').trim() || 'Drama';
  const quality = ['cine', 'premium', 'maxima'].includes(String(body.quality)) ? String(body.quality) : 'cine';
  if (title.length < 2) return fail(400, 'Falta el título.');
  if (story.length < 400) return fail(400, 'Pega el guion completo (con escenas y diálogos) para poder desglosarlo.');
  if (story.length > 400000) return fail(413, 'El guion es demasiado largo para un solo desglose.');
  const slug = slugKey(title);
  try {
    const platform = videoPlatform();
    const ai = googleClient(platform, platform === 'vertex' ? (process.env.V7_QA_LOCATION?.trim() || 'global') : undefined);
    const { raw, model, parts } = await requestFullBreakdown(ai, { title, story, minutes, genre });
    const spec = normalizeBreakdown(raw, { filmId: `film-${slug}-v7`, title, genre, serie: slug, quality });
    const marked = countMarkedShots(story);
    const draftId = randomUUID();
    await mkdir(path.dirname(draftPath(draftId)), { recursive: true });
    await writeFile(draftPath(draftId), JSON.stringify({ spec, title, slug, quality, marked, createdAt: new Date().toISOString() } satisfies Draft) + '\n');
    return NextResponse.json({ ok: true, draftId, model, partes: parts, ...preview(spec, marked) }, { headers: noStore });
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : String(e));
  }
}
