import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { NextResponse } from 'next/server';
import { readV7FilmBundle, v7FilmRoot } from '@/lib/v7/storage/film-store';
import { estimateVeoUsd } from '@/lib/v7/production/cinema-core-policy';
import { DOS_TOQUES_FIRST_SHOT_BUDGET, maySubmitFirstShot } from '@/lib/v7/production/dos-toques-p01-budget';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILM_ID = 'film-dos-toques-de-bocina-v7';
const REFERENCE = 'e01-p01/referencia-aprobada.png';
const MAX_BYTES = 8 * 1024 * 1024;
type Context = { params: Promise<{ filmId: string }> };

function localRequest(request: Request) {
  if (process.env.NODE_ENV !== 'development') return false;
  const url = new URL(request.url);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return false;
  const origin = request.headers.get('origin');
  return !origin || origin === url.origin;
}

async function resolveContext(context: Context) {
  const { filmId } = await context.params;
  if (filmId !== FILM_ID) throw new Error('Película distinta: operación bloqueada');
  const bundle = await readV7FilmBundle(FILM_ID);
  if (bundle.film.id !== FILM_ID) throw new Error('Registro de película incompatible');
  const shot = bundle.film.acts
    .flatMap(act => act.sequences.flatMap(sequence => sequence.scenes))
    .flatMap(scene => scene.shots)
    .find(item => item.id === FILM_ID + '-scene-01-shot-01');
  if (!shot || !Number.isFinite(shot.durationSeconds) ||
      shot.durationSeconds < 6 || shot.durationSeconds > 8) {
    throw new Error('Toma E01-P01 de V7 ausente o duración fuera de rango');
  }
  return { bundle, sourceShotSeconds: shot.durationSeconds,
    imageFile: path.join(v7FilmRoot(FILM_ID), REFERENCE) };
}

function positiveNumber(value: string | undefined, max: number) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 && n <= max ? n : null;
}

export async function GET(request: Request, context: Context) {
  if (!localRequest(request)) return NextResponse.json({ ok: false }, { status: 403 });
  try {
    const { bundle, sourceShotSeconds, imageFile } = await resolveContext(context);
    let referenceReady = false;
    try { const file = await stat(imageFile); referenceReady = file.isFile() && file.size > 10000; }
    catch { /* Not yet imported */ }

    const rate = positiveNumber(process.env.V7_VEO_USD_PER_SECOND, 10);
    const localCap = positiveNumber(process.env.V7_CINEMA_MAX_USD, 1000000);
    // A user-approved allowance for this exact shot is separate from the film-wide budget.
    // Never raise bundle.film.budgetUsd, which could authorize unrelated shots.
    const configuredCap = Math.min(DOS_TOQUES_FIRST_SHOT_BUDGET.maxTotalUsd, localCap ?? 0);
    const quote = estimateVeoUsd(8, DOS_TOQUES_FIRST_SHOT_BUDGET.providerRateUsdPerSecond);
    const tariffMatchesPublished = rate === DOS_TOQUES_FIRST_SHOT_BUDGET.providerRateUsdPerSecond;
    const paidSystemEnabled =
      process.env.V7_DOS_TOQUES_P01_PAID_ENABLED === 'true' &&
      process.env.PRODUCTION_MODE === 'real' &&
      process.env.V7_CINEMA_PAID_ENABLED !== 'true' &&
      process.env.ALLOW_EXTERNAL_API_CALLS !== 'true' &&
      process.env.ALLOW_PAID_GENERATION !== 'true';
    const blockers: string[] = [];
    if (!referenceReady) blockers.push('Falta la referencia inicial 16:9 validada.');
    if (!tariffMatchesPublished) blockers.push('Configura la tarifa verificada de US$0.10/s de Veo 3.1 Fast 720p.');
    if (configuredCap <= 0) blockers.push('El límite local de esta toma aún no está configurado (V7_CINEMA_MAX_USD).');
    else if (quote !== null && quote > configuredCap)
      blockers.push('El costo calculado supera el presupuesto configurado.');
    const policyAllow = maySubmitFirstShot({
      shotId: 'E01-P01',
      model: DOS_TOQUES_FIRST_SHOT_BUDGET.model,
      rateUsdPerSecond: tariffMatchesPublished ? rate : null,
      providerSubmissions: 0,
      referenceReady,
      alreadyReserved: false,
      localCapUsd: configuredCap
    });
    if (!policyAllow) blockers.push('El permiso específico de US$2 todavía no supera todas las comprobaciones.');
    if (!paidSystemEnabled) blockers.push('Generación pagada desactivada por seguridad.');
    blockers.push('Falta revisar el fotograma y confirmar la disponibilidad de credenciales en tu servidor local.');
    return NextResponse.json({
      ok: true,
      filmId: FILM_ID,
      shotId: 'E01-P01',
      providerSeconds: 8,
      filmShotSeconds: sourceShotSeconds,
      trimToFilmSeconds: sourceShotSeconds,
      animaticSegmentSeconds: 8,
      trimRequired: Math.abs(sourceShotSeconds - 8) > 0.01,
      referenceReady,
      filmBudgetUsd: bundle.film.budgetUsd,
      scopedApprovalUsd: DOS_TOQUES_FIRST_SHOT_BUDGET.maxTotalUsd,
      approvedProviderCalls: DOS_TOQUES_FIRST_SHOT_BUDGET.maxProviderSubmissions,
      approvedAutomaticRetries: DOS_TOQUES_FIRST_SHOT_BUDGET.automaticRetries,
      creatorApprovalRecorded: true,
      approvedModel: DOS_TOQUES_FIRST_SHOT_BUDGET.model,
      approvedResolution: DOS_TOQUES_FIRST_SHOT_BUDGET.resolution,
      tariffSource: 'https://ai.google.dev/gemini-api/docs/pricing',
      verifiedRateConfigured: tariffMatchesPublished,
      estimatedVideoUsd: quote,
      localBudgetCapUsd: configuredCap,
      paidSystemEnabled,
      readyForPaidSubmission: false,
      providerCallsMade: 0,
      blockers
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ ok: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 404 });
  }
}

export async function POST(request: Request, context: Context) {
  // Import only: no access to any paid generation service.
  if (!localRequest(request)) return NextResponse.json({
    ok: false, error: 'Importación permitida solo en el estudio local.'
  }, { status: 403 });
  let temp: string | undefined;
  try {
    const { imageFile } = await resolveContext(context);
    const data = await request.formData();
    const image = data.get('reference');
    if (!(image instanceof File) || image.size < 10000 ||
        image.size > MAX_BYTES || !/\.png$/i.test(image.name)) {
      return NextResponse.json({ ok: false,
        error: 'Selecciona un fotograma PNG de 16:9, entre 10 KB y 8 MB.' }, { status: 400 });
    }
    const bytes = Buffer.from(await image.arrayBuffer());
    const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (!bytes.subarray(0, 8).equals(header)) {
      throw new Error('El archivo debe ser un PNG auténtico.');
    }
    const metadata = await sharp(bytes, { limitInputPixels: 16777216 }).metadata();
    if (!metadata.width || !metadata.height ||
        metadata.width < 1280 || metadata.height < 720 ||
        Math.abs(metadata.width / metadata.height - 16 / 9) > 0.012 ||
        metadata.width > 4096 || metadata.height > 2304) {
      throw new Error('Se requiere referencia de 1280x720 o mayor, 16:9, máximo 4096x2304.');
    }
    await mkdir(path.dirname(imageFile), { recursive: true });
    temp = path.join(path.dirname(imageFile), '.' + randomUUID() + '.png');
    await writeFile(temp, bytes, { flag: 'wx' });
    await link(temp, imageFile);
    await unlink(temp);
    temp = undefined;
    return NextResponse.json({
      ok: true,
      status: 'fotograma-importado-pendiente-de-aprobacion-editorial',
      externalApiCalls: 0,
      referenceStored: true,
      videoGenerated: false
    }, { status: 201 });
  } catch (error) {
    const duplicate = (error as NodeJS.ErrnoException).code === 'EEXIST';
    return NextResponse.json({ ok: false, error: duplicate
      ? 'Ya existe una referencia para E01-P01; no se sobrescribirá.'
      : error instanceof Error ? error.message : String(error)
    }, { status: duplicate ? 409 : 400 });
  } finally {
    if (temp) await unlink(temp).catch(() => undefined);
  }
}
