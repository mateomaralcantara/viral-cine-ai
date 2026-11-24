/**
 * IMPORTAR TOMAS YA PAGADAS DE OTRA VERSIÓN DE LA PELÍCULA (gratis).
 *
 *   npm run importar-tomas -- <película nueva> --desde <película vieja>              propuesta
 *   npm run importar-tomas -- <película nueva> --desde <película vieja> --aplicar    importar
 */
import nextEnv from '@next/env';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { applyImport, planImport } from '../lib/v7/production/import-shots';

nextEnv.loadEnvConfig(process.cwd());
const args = process.argv.slice(2);
const option = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const target = FILM_KEYS[args[0] ?? ''];
const source = FILM_KEYS[option('--desde') ?? ''];
if (!target || !source) { console.log('Uso: npm run importar-tomas -- <película nueva> --desde <película vieja> [--aplicar]'); process.exit(1); }

async function main() {
  const plan = await planImport(target, source);
  console.log(`IMPORTAR de ${source} a ${target}: ${plan.length} tomas emparejadas`);
  for (const p of plan) console.log(`  ${p.target} «${p.targetTitle}»  ←  ${p.source} «${p.sourceTitle}»  (parecido ${Math.round(p.score * 100)} %)${p.line ? ' · «' + p.line.slice(0, 60) + '»' : ''}`);
  if (!args.includes('--aplicar')) { console.log('\nNO SE IMPORTÓ NADA (esto era la propuesta). Para importar añade --aplicar'); return; }
  const r = await applyImport(target, source, plan);
  console.log(`\nImportadas ${r.done.length}${r.skipped.length ? ` · omitidas ${r.skipped.join(', ')}` : ''}. Quedan fijadas como tu elección.`);
}

try { await main(); } catch (e) { console.error('\nERROR: ' + (e instanceof Error ? e.message : String(e))); process.exit(1); }
