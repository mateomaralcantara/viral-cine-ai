/**
 * REHACER solo las tomas que el autor señala (p. ej. la mesa distinta o un personaje duplicado).
 *
 *   npm run rehacer -- episodio2 --tomas E01-P05,E01-P09                plan y coste (gratis)
 *   npm run rehacer -- episodio2 --tomas E01-P05,E01-P09 --hasta 4      las rehace
 *
 * Para cada toma: la suelta (el video actual se archiva, no se borra), crea una foto de continuidad
 * NUEVA (retrato oficial + plano maestro del decorado + toma aprobada anterior) y la envía a Veo.
 * Después: npm run vigilar -- <película> --escena E01 --hasta 3  (revisa, pasa la puerta y fija).
 * Nunca toca otra toma.
 */
import nextEnv from '@next/env';
import path from 'node:path';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { readV7FilmBundle, v7FilmRoot } from '../lib/v7/storage/film-store';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';
import { estimateShotUsd, latestPromptRevision, readShotRecord, redoAuthorizationPhrase, submitSceneShot, veoSceneRate } from '../lib/v7/production/scene-veo-engine';
import { isLocked, unlockShot } from '../lib/v7/production/shot-lock';
import { makeContinuity, planContinuity } from '../lib/v7/production/continuity-runner';

(process.env as Record<string, string>).NODE_ENV ??= 'development';
nextEnv.loadEnvConfig(process.cwd(), true);
const args = process.argv.slice(2);
const key = args.find((a) => FILM_KEYS[a]) ?? '';
const filmId = FILM_KEYS[key];
const option = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const labels = (option('--tomas') ?? '').toUpperCase().split(',').map((x) => x.trim()).filter(Boolean);
if (!filmId || !labels.length) { console.log('Uso: npm run rehacer -- episodio2 --tomas E01-P05,E01-P09 [--hasta 4]'); process.exit(1); }
const budget = Math.max(0, Number(option('--hasta') ?? 0) || 0);

async function main() {
  const { film } = await readV7FilmBundle(filmId);
  const all = indexedScenes(film).flatMap((s) => s.shots);
  const rate = veoSceneRate();
  if (!rate) throw new Error('Falta la tarifa de Veo (V7_VEO_USD_PER_SECOND).');
  const plan = labels.map((label) => {
    const entry = all.find((x) => x.label === label);
    if (!entry) throw new Error('No existe la toma ' + label);
    return { label, usd: estimateShotUsd(entry.shot.durationSeconds, rate) };
  });
  const total = plan.reduce((n, p) => n + p.usd, 0);
  console.log(`REHACER ${labels.join(', ')} · foto de continuidad nueva (~US$${(labels.length * 0.04).toFixed(2)}) + Veo ~US$${total.toFixed(2)}`);
  if (!budget) { console.log('\nNO SE HIZO NADA (esto era el plan). Para rehacerlas añade --hasta ' + Math.ceil(total)); return; }
  if (total > budget + 1e-9) throw new Error(`Cuesta ~US$${total.toFixed(2)} y el tope es US$${budget.toFixed(2)}. Sube --hasta o pide menos tomas.`);

  for (const label of labels) {
    const rec = await readShotRecord(filmId, label).catch(() => null);
    if (!rec || rec.status !== 'review-required') { console.log(`  ${label}: no tiene un video terminado (estado ${rec?.status ?? 'sin generar'}); usa el estudio o pulir.`); continue; }
    const dir = path.join(v7FilmRoot(filmId), label.toLowerCase());
    if (await isLocked(dir)) { await unlockShot(dir); console.log(`  ${label}: soltada (lo pide el autor).`); }
  }
  const cont = await planContinuity(filmId, { shots: labels, repeat: true });
  if (!cont.set) console.log('  AVISO: sin plano maestro del decorado (npm run decorado -- ' + key + ' --generar y --aprobar). La mesa podría volver a cambiar.');
  const made = await makeContinuity(filmId, cont.serie, cont.jobs);
  if (made.failed.length) console.log('  Sin foto nueva (se mantiene la anterior): ' + made.failed.map((f) => f.label).join(', '));

  for (const { label, usd } of plan) {
    const rec = await readShotRecord(filmId, label).catch(() => null);
    if (!rec || rec.status !== 'review-required') continue;
    const revision = await latestPromptRevision(filmId, label);
    if (!revision) { console.log(`  ${label}: sin versión de texto; no se envía.`); continue; }
    try {
      await submitSceneShot(filmId, label, { revisionId: revision.revisionId, authorization: redoAuthorizationPhrase(label, usd), redo: true });
      console.log(`  ${label}: enviada a Veo (US$${usd.toFixed(2)}). El video anterior queda archivado.`);
    } catch (e) { console.log(`  ${label}: ERROR ${(e as Error).message}`); }
  }
  const scenes = [...new Set(labels.map((l) => l.slice(0, 3)))];
  console.log(`\nSiguiente (revisa, pasa la puerta y fija): ${scenes.map((s) => `npm run vigilar -- ${key} --escena ${s} --hasta 3`).join('  ·  ')}`);
}

try { await main(); } catch (e) { console.error('\nERROR: ' + (e instanceof Error ? e.message : String(e))); process.exit(1); }
