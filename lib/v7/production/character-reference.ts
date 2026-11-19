/**
 * Foto de referencia del protagonista (funciones puras).
 * 1) Retrato maestro de Martin a partir de la portada del libro.
 * 2) Primer fotograma de cada toma con ese mismo Martin: Veo parte de él
 *    (image-to-video), así la cara es la misma en todas las tomas.
 */

/** Palabras que hicieron saltar el filtro de Google o que piden texto en pantalla. */
const RISKY: Array<[RegExp, string]> = [
  [/\bdivin[oa]s?\b/gi, 'cálida'],
  [/\bcelestial(es)?\b/gi, 'luminosa'],
  [/\bsagrad[oa]s?\b/gi, 'solemne'],
  [/\bángel(es)?\b/gi, 'figura'],
  [/\bsangre\b/gi, 'sombra'],
  [/\bcadáver(es)?\b/gi, 'figura inmóvil']
];

export function sanitizePrompt(text: string) {
  let out = text;
  for (const [re, rep] of RISKY) out = out.replace(re, rep);
  return out.replace(/\s+/g, ' ').trim();
}

export function masterPortraitPrompt(name: string, appearance: string) {
  return [
    `Retrato fotográfico cinematográfico hiperrealista de ${name}, el protagonista de la portada adjunta.`,
    `Debe ser exactamente la misma persona que en la portada: misma cara, mismo pelo, misma barba y mismo tono de piel.`,
    `Descripción fija: ${appearance}.`,
    'Plano medio, de frente, mirando ligeramente fuera de cámara, expresión serena y cansada, boca cerrada.',
    'Luz suave lateral, fondo neutro oscuro desenfocado, formato 16:9, calidad de cine.',
    'Sin texto, sin letras, sin logotipos, sin marcas de agua, sin el título del libro.'
  ].join(' ');
}

export function keyframePrompt(name: string, shotPrompt: string) {
  return [
    'Crea el PRIMER FOTOGRAMA de una toma de cine (16:9, fotografía hiperrealista, iluminación cinematográfica).',
    `La primera imagen adjunta es ${name}: en la escena debe ser exactamente esa misma persona (misma cara, pelo, barba y tono de piel).`,
    'Respeta el vestuario, el lugar y la luz que pide la toma.',
    `TOMA: ${sanitizePrompt(shotPrompt)}`,
    'Todas las bocas cerradas. Manos naturales y discretas. Sin texto, letras, subtítulos, logotipos ni marcas de agua. Sin niños.'
  ].join('\n');
}

export type IdentityReport = { identidad: number | null; problemas: Array<{ tipo: string; descripcion: string; gravedad: string }> };

/** ¿El revisor dijo que la cara del protagonista no es la correcta? */
export function needsIdentityFix(report: IdentityReport | null) {
  if (!report) return false;
  if (report.identidad != null && report.identidad < 6) return true;
  return report.problemas.some((p) => p.gravedad === 'critico' && /identidad|no coincide|pelo corto|no se parece/i.test(p.tipo + ' ' + p.descripcion));
}

/** La toma muestra al protagonista si el texto lo nombra. */
export function shotShows(name: string, prompt: string) {
  return new RegExp('\\b' + name + '\\b', 'i').test(prompt);
}

export const IMAGE_USD_ESTIMATE = 0.04;
