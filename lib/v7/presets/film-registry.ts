/** Películas que los scripts conocen por su nombre corto (npm run … -- <nombre>). */
import { CONVIDADOS_ID } from '@/lib/v7/presets/los-convidados-al-agape';
import { PRIMERA_PAGINA_ID } from '@/lib/v7/presets/la-primera-pagina';
import { EPISODIO_1_ID } from '@/lib/v7/presets/convidados-episodio-1';
import { EPISODIO_2_ID } from '@/lib/v7/presets/convidados-episodio-2';

const REGISTERED: Record<string, string> = {
  convidados: CONVIDADOS_ID,
  episodio1: EPISODIO_1_ID,
  episodio2: EPISODIO_2_ID,
  primera: PRIMERA_PAGINA_ID,
  'dos-toques': 'film-dos-toques-de-bocina-v7'
};

/** Las películas creadas desde la web (desglose del guion) se nombran por su id: film-<nombre>-v7. */
const FILM_ID = /^film-[a-z0-9][a-z0-9-]{1,80}-v\d+$/;

/** Nombres cortos de las películas conocidas; además acepta directamente cualquier id de película válido. */
export const FILM_KEYS: Record<string, string> = new Proxy(REGISTERED, {
  get: (target, k) => (typeof k === 'string' ? target[k] ?? (FILM_ID.test(k) ? k : undefined) : undefined)
});

/** Nombre con el que los agentes reciben la película (su nombre corto, o su id si se creó desde la web). */
export function filmKeyFor(filmId: string) {
  return Object.entries(REGISTERED).find(([, id]) => id === filmId)?.[0] ?? (FILM_ID.test(filmId) ? filmId : null);
}
