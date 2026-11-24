/**
 * ESTIMACIÓN DE PRESUPUESTO de una película (función pura). Usa las tarifas reales del proyecto:
 * Veo por segundo, fotos de continuidad, revisión de calidad, música y un margen para correcciones
 * (en el Episodio 1 las correcciones fueron ~30 % de la primera pasada).
 */
export const BUDGET_RATES = {
  veoPerSecond: 0.15,        // Veo 3.1 Fast en Vertex (V7_VEO_USD_PER_SECOND)
  photo: 0.04,               // foto de continuidad (Gemini imagen)
  reviewPerShot: 0.012,      // revisión de calidad por toma (Gemini visión)
  musicPer30s: 0.06,         // Lyria
  avgShotSeconds: 5.5,       // media de una toma (4, 6 u 8 s)
  correctionMargin: 0.3      // margen para rehacer tomas
} as const;

export type BudgetInput = {
  /** Segundos de video a generar (si ya hay desglose) o minutos de la película. */
  seconds?: number; minutes?: number;
  /** Número de tomas (si se conoce). */
  shots?: number;
  /** Tomas que ya tienen foto (subida por el autor o de continuidad): no se paga su foto. */
  shotsWithPhoto?: number;
  /** Ya gastado en video (para mostrar lo pendiente). */
  spentUsd?: number;
  quality?: 'cine' | 'premium' | 'maxima';
  rates?: Partial<typeof BUDGET_RATES>;
};

const round = (n: number) => Math.round(n * 100) / 100;

export function estimateFilmBudget(i: BudgetInput) {
  const r = { ...BUDGET_RATES, ...(i.rates ?? {}) };
  const seconds = Math.max(0, i.seconds ?? (i.minutes ?? 0) * 60);
  const shots = Math.max(0, i.shots ?? Math.ceil(seconds / r.avgShotSeconds));
  // Máxima calidad: más correcciones esperadas.
  const margin = i.quality === 'maxima' ? 0.45 : i.quality === 'premium' ? 0.35 : r.correctionMargin;
  const video = round(seconds * r.veoPerSecond);
  const photos = round(Math.max(0, shots - (i.shotsWithPhoto ?? 0)) * r.photo);
  const review = round(shots * r.reviewPerShot * 1.5);
  const music = round(Math.ceil(seconds / 30) * r.musicPer30s);
  const corrections = round(video * margin);
  const total = round(video + photos + review + music + corrections);
  const spent = round(i.spentUsd ?? 0);
  return {
    seconds, shots,
    partidas: [
      { concepto: 'Video (Veo, primera pasada)', usd: video },
      { concepto: 'Fotos de continuidad', usd: photos },
      { concepto: 'Revisión de calidad (agentes)', usd: review },
      { concepto: 'Música original', usd: music },
      { concepto: `Margen de correcciones (${Math.round(margin * 100)} %)`, usd: corrections }
    ],
    total, spent, pending: round(Math.max(0, total - spent)),
    /** Voces en off: ElevenLabs cobra por caracteres de su plan, no por dólar en este cálculo. */
    nota: 'Las voces en off usan los caracteres de tu plan de ElevenLabs (no suman aquí).'
  };
}
