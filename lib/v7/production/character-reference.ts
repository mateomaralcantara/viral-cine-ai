/**
 * Utilidades de identidad para las tomas (funciones puras).
 * Sin censura propia: lo divino, lo religioso o lo sobrenatural se describe tal cual.
 * (Si Google bloquea una toma no se cobra; se reformula o se parte de una imagen aprobada.)
 */

export type IdentityReport = { identidad: number | null; problemas: Array<{ tipo: string; descripcion: string; gravedad: string }> };

/** ¿El revisor dijo que la cara de algún personaje no es la correcta? */
export function needsIdentityFix(report: IdentityReport | null) {
  if (!report) return false;
  if (report.identidad != null && report.identidad < 6) return true;
  return report.problemas.some((p) => p.gravedad === 'critico' && /identidad|no coincide|pelo corto|no se parece/i.test(p.tipo + ' ' + p.descripcion));
}

/** La toma muestra al personaje si el texto lo nombra. */
export function shotShows(name: string, prompt: string) {
  const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return new RegExp('\\b' + plain(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(plain(prompt));
}
