/**
 * PREPARAR EL EPISODIO DE ANTEMANO: que al generar ya esté todo listo.
 *
 *   npm run preparar -- episodio2                     plan de todo el episodio (gratis)
 *   npm run preparar -- episodio2 --generar           lo prepara todo (fotos ~US$0.04 cada una)
 *   npm run preparar -- episodio2 --escena E02 --generar     solo esa escena
 *
 * Para cada escena: 1) análisis inicial y arreglos del texto (gratis, solo tomas sin video),
 * 2) fotos de continuidad que falten (cara oficial + salón maestro + última toma aprobada),
 * 3) análisis final: qué escenas quedan «listas para generar». Nunca toca una toma fijada.
 */
import nextEnv from '@next/env';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { readV7FilmBundle } from '../lib/v7/storage/film-store';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';
import { applyPreflight, scenePreflight, setMasterInfo } from '../lib/v7/production/studio-harness';
import { makeContinuity, planContinuity } from '../lib/v7/production/continuity-runner';

nextEnv.loadEnvConfig(process.cwd());
const args = process.argv.slice(2);
const key = args.find((a) => FILM_KEYS[a]) ?? '';
const filmId = FILM_KEYS[key];
const option = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
if (!filmId) { console.log('Uso: npm run preparar -- ' + Object.keys(FILM_KEYS).join('|') + ' [--escena E02] [--generar]'); process.exit(1); }
const generar = args.includes('--generar');

async function main() {
  const { film } = await readV7FilmBundle(filmId);
  const only = option('--escena')?.toUpperCase();
  const scenes = indexedScenes(film).map((s) => s.label).filter((l) => !only || l === only);
  console.log(`PREPARAR · ${film.title}${only ? ' · ' + only : ' · episodio completo'}`);

  const set = await setMasterInfo(filmId);
  if (set && !set.aprobado) console.log(`AVISO: el salón «${set.nombre}» no tiene plano maestro aprobado (npm run decorado -- ${key} --generar y --aprobar). Sin él, la mesa puede cambiar.`);

  // 1. Textos: arreglos del análisis inicial (gratis; solo tomas sin video).
  let fixed = 0;
  for (const sc of scenes) fixed += (await applyPreflight(filmId, sc)).applied.length;
  console.log(`1) Textos revisados y corregidos: ${fixed} tomas.`);

  // 2. Fotos de continuidad que falten.
  const plan = await planContinuity(filmId, only ? { scene: only } : {});
  console.log(`2) Fotos de continuidad que faltan: ${plan.jobs.length} (~US$${plan.costUsd.toFixed(2)})${plan.skipped.length ? ` · ya hechas: ${plan.skipped.length}` : ''}`);
  for (const sc of scenes) {
    const n = plan.jobs.filter((j) => j.label.startsWith(sc + '-')).length;
    if (n) console.log(`   ${sc}: ${n} fotos`);
  }
  if (plan.jobs.length && generar) {
    const r = await makeContinuity(filmId, plan.serie, plan.jobs);
    console.log(`   Creadas ${r.done.length} de ${plan.jobs.length}.${r.failed.length ? ' Fallaron (repite el comando): ' + r.failed.map((f) => f.label).join(', ') : ''}`);
  }

  // 3. Análisis final.
  console.log('3) Estado final:');
  let ready = 0;
  for (const sc of scenes) {
    const p = await scenePreflight(filmId, sc);
    if (p.listaParaGenerar) ready++;
    const pending = p.tomas.length;
    console.log(`   ${sc}: ${p.listaParaGenerar ? 'LISTA PARA GENERAR' : 'falta: ' + p.bloqueadas.join(', ')} · nota ${p.nota}/10 · ${pending} tomas por generar · ${p.fijadas.length} fijadas`);
  }
  console.log(`\n${ready} de ${scenes.length} escenas listas para generar.${!generar && plan.jobs.length ? ' NO SE CREÓ NINGUNA FOTO (esto era el plan): añade --generar.' : ''}`);
}

try { await main(); } catch (e) { console.error('\nERROR: ' + (e instanceof Error ? e.message : String(e))); process.exit(1); }
