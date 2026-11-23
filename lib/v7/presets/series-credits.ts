/**
 * Créditos personalizados por serie (los define el autor). Si una serie no tiene,
 * se usan los créditos automáticos de los agentes (film-credits.ts).
 */
import type { CreditLine } from '@/lib/v7/production/film-credits';

export type SeriesCredits = {
  /** Tarjeta «Una película creada por …». */
  createdBy: string;
  /** Autor de la novela (con su foto junto al personaje si existe autor.jpg/png). */
  author: string;
  /** Personaje que el autor acompaña en su tarjeta de apertura. */
  authorCharacter?: string;
  authorCaption?: string;
  lines: CreditLine[];
};

export const SERIES_CREDITS: Record<string, SeriesCredits> = {
  'los-convidados-al-agape': {
    createdBy: 'ViralCine',
    author: 'Martín Mateo',
    authorCharacter: 'martin',
    authorCaption: 'Autor de la novela · da vida a Martin',
    lines: [
      { role: 'Casting e identidad de personajes', name: 'ViralCine' },
      { role: 'Cinematografía', name: 'ViralCine · Martín Mateo' },
      { role: 'Diálogos en cámara', name: 'ViralCine' },
      { role: 'Voz', name: 'Agente de Voz · ViralCine' },
      { role: 'Música', name: 'Agente Compositor · ViralCine' },
      { role: 'Supervisión de calidad', name: 'ViralCine · Martín Mateo' },
      { role: 'Postproducción y reparación', name: 'Agente Reparador' },
      { role: 'Traducción', name: 'Agente Traductor · ViralCine' }
    ]
  }
};
