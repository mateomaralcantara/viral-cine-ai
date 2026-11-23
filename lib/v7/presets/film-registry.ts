/** Películas que los scripts conocen por su nombre corto (npm run … -- <nombre>). */
import { CONVIDADOS_ID } from '@/lib/v7/presets/los-convidados-al-agape';
import { PRIMERA_PAGINA_ID } from '@/lib/v7/presets/la-primera-pagina';
import { EPISODIO_1_ID } from '@/lib/v7/presets/convidados-episodio-1';

export const FILM_KEYS: Record<string, string> = {
  convidados: CONVIDADOS_ID,
  episodio1: EPISODIO_1_ID,
  primera: PRIMERA_PAGINA_ID,
  'dos-toques': 'film-dos-toques-de-bocina-v7'
};

/** Nombre corto de una película a partir de su id (para lanzar los agentes desde el estudio). */
export function filmKeyFor(filmId: string) {
  return Object.entries(FILM_KEYS).find(([, id]) => id === filmId)?.[0] ?? null;
}
