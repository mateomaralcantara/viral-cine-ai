/**
 * Crea la película «LA PRIMERA PÁGINA» (2 min) en la carpeta de datos local.
 * Solo escribe el guion (bundle): no llama a proveedores ni gasta nada.
 * Nunca sobrescribe: si ya existe, la deja como está.
 *
 *   node --import tsx scripts/crear-la-primera-pagina.ts
 */
import nextEnv from '@next/env';
import { createPrimeraPaginaBundle, getPrimeraPaginaStats, PRIMERA_PAGINA_ID } from '../lib/v7/presets/la-primera-pagina';
import { saveV7FilmBundle, v7FilmBundleExists, v7FilmBundlePath } from '../lib/v7/storage/film-store';

nextEnv.loadEnvConfig(process.cwd());
const stats = getPrimeraPaginaStats();
if (await v7FilmBundleExists(PRIMERA_PAGINA_ID)) {
  console.log('Ya existe. No se modifica: ' + v7FilmBundlePath(PRIMERA_PAGINA_ID));
} else {
  await saveV7FilmBundle(createPrimeraPaginaBundle());
  console.log('Creada: ' + v7FilmBundlePath(PRIMERA_PAGINA_ID));
}
console.log(`LA PRIMERA PÁGINA: ${stats.scenes} escenas, ${stats.shots} tomas, ${stats.totalSeconds} s. Sin costo.`);
console.log('Ábrela en: http://127.0.0.1:3010/v7/films/' + PRIMERA_PAGINA_ID + '?tab=studio');
