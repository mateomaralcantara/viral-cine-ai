/**
 * HARNESS DE CONTINUIDAD: foto de partida de cada toma con la cara oficial del personaje
 * y la ropa/pelo/luz de la última toma ya aprobada donde aparece.
 *
 *   npm run continuidad -- episodio2 --escena E01             qué tomas la necesitan (gratis)
 *   npm run continuidad -- episodio2 --escena E01 --generar   crearlas (~US$0.04 cada una)
 *       --tomas E01-P03,E01-P04    solo esas      --repetir    rehace también las que ya tienen foto
 */
import nextEnv from '@next/env';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { makeContinuity, planContinuity } from '../lib/v7/production/continuity-runner';

nextEnv.loadEnvConfig(process.cwd());
const args = process.argv.slice(2);
const key = args.find((a) => FILM_KEYS[a]) ?? '';
const filmId = FILM_KEYS[key];
const option = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
if (!filmId) { console.log('Uso: npm run continuidad -- ' + Object.keys(FILM_KEYS).join('|') + ' --escena E01 [--generar]'); process.exit(1); }

async function main() {
  const scene = option('--escena')?.toUpperCase();
  const shots = option('--tomas')?.toUpperCase().split(',').map((s) => s.trim()).filter(Boolean);
  const plan = await planContinuity(filmId, { scene, shots, repeat: args.includes('--repetir') });
  if (!plan.approved.length) { console.log('No hay personajes con retrato aprobado. Apruébalos en PERSONAJES · IDENTIDAD.'); return; }
  console.log(`HARNESS DE CONTINUIDAD · personajes oficiales: ${plan.approved.map((s) => s.nombre).join(', ')}`);
  if (plan.skipped.length) console.log('Ya tienen foto (no se repiten): ' + plan.skipped.join(', '));
  if (!plan.jobs.length) { console.log('No hay tomas que preparar.'); return; }
  console.log(`Fotos a crear: ${plan.jobs.length} · ~US$${plan.costUsd.toFixed(2)}`);
  for (const j of plan.jobs) console.log(`  ${j.label}  ${j.cast.map((c) => c.nombre).join(' + ')}  ${j.anchor ? '· continúa de ' + j.anchor : '· sin toma aprobada antes: solo retratos'}`);
  if (!args.includes('--generar')) { console.log('\nNO SE GENERÓ NADA (esto era el plan). Para crearlas añade --generar'); return; }
  const r = await makeContinuity(filmId, plan.serie, plan.jobs);
  console.log(`\nListas ${r.done.length} de ${plan.jobs.length}.${r.failed.length ? ' Fallaron: ' + r.failed.map((f) => f.label).join(', ') : ''}`);
}

try { await main(); } catch (e) { console.error('\nERROR: ' + (e instanceof Error ? e.message : String(e))); process.exit(1); }
