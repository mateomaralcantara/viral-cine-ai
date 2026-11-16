/**
 * Crea la película «LA PRIMERA PÁGINA» (2 min) en la carpeta de datos local.
 * Solo escribe el guion (bundle): no llama a proveedores ni gasta nada.
 * Nunca sobrescribe una película existente.
 *
 *   node --import tsx scripts/crear-la-primera-pagina.ts
 *   node --import tsx scripts/crear-la-primera-pagina.ts --actualizar-textos
 *
 * --actualizar-textos: copia los textos nuevos del guion SOLO a las tomas que aún
 * no tienen video, intento ni versión guardada. Las tomas ya producidas no se tocan.
 */
import { access } from 'node:fs/promises';
import path from 'node:path';
import nextEnv from '@next/env';
import { createPrimeraPaginaBundle, getPrimeraPaginaStats, PRIMERA_PAGINA_ID } from '../lib/v7/presets/la-primera-pagina';
import { readV7FilmBundle, saveV7FilmBundle, v7FilmBundleExists, v7FilmBundlePath, v7FilmRoot } from '../lib/v7/storage/film-store';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';

nextEnv.loadEnvConfig(process.cwd());
const exists = async (file: string) => access(file).then(() => true, () => false);
const stats = getPrimeraPaginaStats();

if (!(await v7FilmBundleExists(PRIMERA_PAGINA_ID))) {
  await saveV7FilmBundle(createPrimeraPaginaBundle());
  console.log('Creada: ' + v7FilmBundlePath(PRIMERA_PAGINA_ID));
} else if (process.argv.includes('--actualizar-textos')) {
  const stored = await readV7FilmBundle(PRIMERA_PAGINA_ID);
  const fresh = createPrimeraPaginaBundle().film;
  const freshShots = new Map(fresh.acts.flatMap((a) => a.sequences.flatMap((q) => q.scenes.flatMap((s) => s.shots))).map((s) => [s.id, s]));
  const changed: string[] = [];
  const kept: string[] = [];
  for (const scene of indexedScenes(stored.film)) {
    for (const { shot, label } of scene.shots) {
      const next = freshShots.get(shot.id);
      if (!next || next.visualPrompt === shot.visualPrompt) continue;
      const dir = path.join(v7FilmRoot(PRIMERA_PAGINA_ID), label.toLowerCase());
      if (await exists(path.join(dir, 'provider-operation.json')) || await exists(path.join(dir, 'veo-prompts'))) {
        kept.push(label);
        continue;
      }
      shot.visualPrompt = next.visualPrompt;
      shot.spokenText = next.spokenText;
      changed.push(label);
    }
  }
  if (changed.length) await saveV7FilmBundle({ ...stored, savedAt: undefined });
  console.log('Textos actualizados: ' + (changed.join(', ') || 'ninguno'));
  if (kept.length) console.log('No tocadas (ya tienen video o versión guardada): ' + kept.join(', '));
} else {
  console.log('Ya existe. No se modifica: ' + v7FilmBundlePath(PRIMERA_PAGINA_ID));
  console.log('Para pasar los textos nuevos a las tomas sin video: npm run crear:primera-pagina -- --actualizar-textos');
}
console.log(`LA PRIMERA PÁGINA: ${stats.scenes} escenas, ${stats.shots} tomas, ${stats.totalSeconds} s. Sin costo.`);
