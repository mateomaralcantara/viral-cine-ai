/**
 * Control de calidad visual de una toma: un modelo de visión (Gemini) mira el MP4
 * y responde un veredicto estructurado. Este módulo es puro: arma la consulta,
 * valida la respuesta y decide; no llama a la red.
 */
export type ShotReviewInput = {
  label: string;
  title: string;
  prompt: string;
  spokenText: string;
  speaker: string;
  characters: Array<{ name: string; appearance: string }>;
  hasCover: boolean;
};

export type ReviewIssue = { tipo: string; gravedad: 'critico' | 'medio' | 'leve'; descripcion: string; segundo?: number };
export type ShotReview = {
  puntuacion: number;
  coincideConGuion: number;
  identidad: number | null;
  textoEnPantalla: boolean;
  bocasHablando: boolean;
  problemas: ReviewIssue[];
  veredicto: 'aprobar' | 'revisar' | 'rehacer';
  motivo: string;
  promptSugerido: string;
};

export const REVIEW_RULES = [
  'Todo lo que se ve debe corresponder al texto de la toma (lugar, acción, cámara, luz).',
  'Los personajes deben coincidir con su descripción fija (y con la portada, si se adjunta).',
  'Nadie debe mover los labios como si hablara: las voces se añaden después en off.',
  'No debe haber texto, letras, subtítulos, logotipos ni marcas de agua en pantalla.',
  'Anatomía correcta: manos, dedos, caras y cuerpos sin deformaciones ni fusiones.',
  'Movimiento natural: sin saltos, parpadeos de imagen, objetos que aparecen o desaparecen.',
  'Sin rostros de niños, violencia explícita ni figuras que parezcan divinas o religiosas.'
];

export function buildReviewPrompt(input: ShotReviewInput) {
  const cast = input.characters.length
    ? input.characters.map((c) => `- ${c.name}: ${c.appearance}`).join('\n')
    : '- (sin personajes descritos)';
  return [
    'Eres el supervisor de calidad de una productora de cine. Mira el video adjunto (toma ' + input.label + ' «' + input.title + '») y evalúalo con rigor.',
    input.hasCover ? 'También se adjunta la portada del libro: los personajes deben parecerse a los de la portada.' : '',
    '\nTEXTO CON EL QUE SE GENERÓ LA TOMA:\n' + input.prompt,
    '\nPERSONAJES (descripción fija):\n' + cast,
    '\nVOZ EN OFF QUE SE AÑADIRÁ DESPUÉS (' + input.speaker + '): «' + input.spokenText + '»',
    '\nREGLAS:\n' + REVIEW_RULES.map((r, i) => `${i + 1}. ${r}`).join('\n'),
    '\nPUNTÚA de 0 a 10 (10 = cine profesional sin defectos). identidad = parecido de los personajes con su descripción; null si no aparece ningún personaje reconocible.',
    'veredicto: «aprobar» si puntuacion >= 8 y ningún problema crítico; «rehacer» si hay algún problema crítico o puntuacion < 6; si no, «revisar».',
    'Si el veredicto es «rehacer», escribe en promptSugerido un texto nuevo y completo, en español, que corrija los problemas y respete las reglas',
    '(describe solo lo visible, bocas cerradas, sin texto en pantalla). Si no, deja promptSugerido vacío.',
    'Responde en español, solo con el JSON pedido.'
  ].filter(Boolean).join('\n');
}

export const REVIEW_JSON_SCHEMA = {
  type: 'object',
  properties: {
    puntuacion: { type: 'number' },
    coincideConGuion: { type: 'number' },
    identidad: { type: ['number', 'null'] },
    textoEnPantalla: { type: 'boolean' },
    bocasHablando: { type: 'boolean' },
    problemas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tipo: { type: 'string' },
          gravedad: { type: 'string', enum: ['critico', 'medio', 'leve'] },
          descripcion: { type: 'string' },
          segundo: { type: 'number' }
        },
        required: ['tipo', 'gravedad', 'descripcion']
      }
    },
    veredicto: { type: 'string', enum: ['aprobar', 'revisar', 'rehacer'] },
    motivo: { type: 'string' },
    promptSugerido: { type: 'string' }
  },
  required: ['puntuacion', 'coincideConGuion', 'identidad', 'textoEnPantalla', 'bocasHablando', 'problemas', 'veredicto', 'motivo', 'promptSugerido']
} as const;

const clamp = (n: unknown) => Math.max(0, Math.min(10, Math.round(Number(n) * 10) / 10 || 0));

/** Valida la respuesta del modelo y aplica las reglas de veredicto de forma determinista. */
export function normalizeReview(raw: unknown): ShotReview {
  const r = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
  if (!r || typeof r !== 'object') throw new Error('Respuesta de calidad vacía.');
  const problemas: ReviewIssue[] = Array.isArray(r.problemas) ? r.problemas.map((p) => {
    const x = p as Record<string, unknown>;
    const gravedad = x.gravedad === 'critico' || x.gravedad === 'medio' ? x.gravedad : 'leve';
    return { tipo: String(x.tipo ?? 'otro'), gravedad, descripcion: String(x.descripcion ?? ''), ...(Number.isFinite(Number(x.segundo)) && x.segundo != null ? { segundo: Number(x.segundo) } : {}) };
  }) : [];
  const textoEnPantalla = r.textoEnPantalla === true;
  const bocasHablando = r.bocasHablando === true;
  if (textoEnPantalla && !problemas.some((p) => p.tipo.includes('texto'))) problemas.push({ tipo: 'texto en pantalla', gravedad: 'critico', descripcion: 'Aparece texto o letras en la imagen.' });
  if (bocasHablando && !problemas.some((p) => p.tipo.includes('boca'))) problemas.push({ tipo: 'bocas', gravedad: 'medio', descripcion: 'Algún personaje mueve los labios como si hablara.' });
  const puntuacion = clamp(r.puntuacion);
  const critical = problemas.some((p) => p.gravedad === 'critico');
  const veredicto: ShotReview['veredicto'] = critical || puntuacion < 6 ? 'rehacer' : puntuacion >= 8 && !bocasHablando ? 'aprobar' : 'revisar';
  return {
    puntuacion,
    coincideConGuion: clamp(r.coincideConGuion),
    identidad: r.identidad == null ? null : clamp(r.identidad),
    textoEnPantalla, bocasHablando, problemas, veredicto,
    motivo: String(r.motivo ?? ''),
    promptSugerido: veredicto === 'rehacer' ? String(r.promptSugerido ?? '').trim() : ''
  };
}

/** Precio orientativo de Gemini Flash (US$ por millón de tokens). Ajustable por entorno. */
export function reviewCostUsd(inputTokens: number, outputTokens: number, inPerM = 0.5, outPerM = 3) {
  return (inputTokens * inPerM + outputTokens * outPerM) / 1_000_000;
}
