import { NextResponse } from 'next/server';
import { localAdminAuthorized, localOriginAllowed } from '@/lib/v7/security/local-studio-session';
import { countMarkedShots, normalizeBreakdown, requestBreakdown, slugKey } from '@/lib/v7/creation/script-breakdown';
import { estimateFilmBudget } from '@/lib/v7/creation/budget-estimate';
import { buildShortFilmBundle, shortFilmStats } from '@/lib/v7/presets/short-film-builder';
import { saveV7FilmBundle, v7FilmBundleExists } from '@/lib/v7/storage/film-store';
import { googleClient, videoPlatform } from '@/lib/v7/production/scene-veo-engine';
import { readSheet, writeSheet } from '@/lib/v7/production/character-identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const noStore = { 'Cache-Control': 'private, no-store' };
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers: noStore });

/**
 * DESGLOSE DEL GUION: crea una película lista para el estudio a partir del guion pegado.
 * Solo en el estudio local (necesita las claves de Google y guarda en el disco del estudio).
 */
export async function POST(request: Request) {
  if (!localOriginAllowed(request) || !localAdminAuthorized(request)) {
    return fail(403, 'El desglose del guion funciona en el estudio local (tu PC). En la web publicada se activará cuando el almacenamiento esté en la nube.');
  }
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return fail(400, 'JSON inválido.'); }
  const title = String(body.title ?? '').trim();
  const story = String(body.story ?? '').trim();
  const minutes = Math.max(1, Math.min(180, Number(body.durationMinutes) || 15));
  const genre = String(body.genre ?? 'Drama').trim() || 'Drama';
  const quality = ['cine', 'premium', 'maxima'].includes(String(body.quality)) ? String(body.quality) : 'cine';
  if (title.length < 2) return fail(400, 'Falta el título.');
  if (story.length < 400) return fail(400, 'Pega el guion completo (con escenas y diálogos) para poder desglosarlo.');
  if (story.length > 200000) return fail(413, 'El guion es demasiado largo para un solo desglose.');

  const slug = slugKey(title);
  let filmId = `film-${slug}-v7`;
  for (let n = 2; await v7FilmBundleExists(filmId); n++) filmId = `film-${slug}-${n}-v7`;
  try {
    const platform = videoPlatform();
    const ai = googleClient(platform, platform === 'vertex' ? (process.env.V7_QA_LOCATION?.trim() || 'global') : undefined);
    const { raw, model } = await requestBreakdown(ai, { title, story, minutes, genre });
    const spec = normalizeBreakdown(raw, { filmId, title, genre, serie: slug, quality });
    await saveV7FilmBundle(buildShortFilmBundle(spec));
    // Fichas de los personajes con imagen: el autor sube su foto y aprueba el retrato en PERSONAJES · IDENTIDAD.
    let order = 1;
    for (const c of spec.characters.filter((x) => !/sin imagen/i.test(x.appearance))) {
      if (!(await readSheet(slug, c.key))) {
        await writeSheet(slug, { key: c.key, nombre: c.name, descripcion: c.appearance, vestuarios: {}, voz: null, notas: c.role, aprobado: null, orden: order });
      }
      order++;
    }
    const stats = shortFilmStats(spec);
    const marked = countMarkedShots(story);
    const aviso = marked > 0 && stats.shots < marked
      ? `Tu guion marca ${marked} planos y el desglose creó ${stats.shots} tomas: revisa cada escena y añade los que falten con «+ Añadir toma».` : '';
    return NextResponse.json({
      ok: true, filmId, model, stats, aviso,
      personajes: spec.characters.filter((x) => !/sin imagen/i.test(x.appearance)).map((c) => c.name),
      presupuesto: estimateFilmBudget({ seconds: stats.totalSeconds, shots: stats.shots, quality: quality as 'cine' }),
      nextUrl: '/v7/films/' + encodeURIComponent(filmId) + '?tab=studio'
    }, { headers: noStore });
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : String(e));
  }
}
