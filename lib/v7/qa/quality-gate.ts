/**
 * HARNESS DE CORRECCIÓN · PUERTA DE CALIDAD (función pura).
 * Una toma solo PASA si no tiene ningún error. Los agentes nunca fijan ni montan una
 * toma que no pase esta puerta; solo el autor puede aprobarla a mano (y queda anotado).
 */
import type { ReviewIssue, ShotReview } from './shot-vision-review';

export const GATE = { score: 8, script: 7, identity: 8, listen: 0.85 } as const;

export type GateInput = {
  review: Pick<ShotReview, 'puntuacion' | 'coincideConGuion' | 'identidad' | 'textoEnPantalla' | 'bocasHablando' | 'problemas' | 'veredicto'> | null;
  /** Diálogo dicho en cámara por el personaje. */
  onCamera: boolean;
  /** La toma muestra a un personaje con ficha aprobada. */
  showsCharacter: boolean;
  /** Fracción de palabras del guion que se oyen en la toma (Agente de Escucha), si se midió. */
  listenCoverage?: number | null;
};
export type GateResult = { pass: boolean; reasons: string[] };

/** Defectos «medios» que igualmente impiden pasar: rompen la continuidad o el diálogo. */
const BLOCKING_MEDIUM = /identidad|vestuario|continuidad|decorado|mesa|duplic|clon|doble|repetid|texto|subt[ií]tulo|logo|marca|sincron|di[aá]logo|labios|audio|cara|barba|pelo|edad/i;

export function qualityGate(input: GateInput): GateResult {
  const r = input.review;
  if (!r) return { pass: false, reasons: ['La toma aún no tiene revisión de calidad.'] };
  const reasons: string[] = [];
  if (r.veredicto !== 'aprobar') reasons.push(`El revisor dijo «${r.veredicto}».`);
  if (r.puntuacion < GATE.score) reasons.push(`Nota ${r.puntuacion}/10 (mínimo ${GATE.score}).`);
  if (r.coincideConGuion < GATE.script) reasons.push(`No sigue el guion (${r.coincideConGuion}/10, mínimo ${GATE.script}).`);
  if (input.showsCharacter) {
    if (r.identidad == null) reasons.push('No se reconoce al personaje.');
    else if (r.identidad < GATE.identity) reasons.push(`La cara no coincide con la ficha (${r.identidad}/10, mínimo ${GATE.identity}).`);
  }
  if (r.textoEnPantalla) reasons.push('Hay texto o letras en la imagen.');
  if (!input.onCamera && r.bocasHablando) reasons.push('Alguien mueve los labios en una toma sin diálogo.');
  for (const p of r.problemas as ReviewIssue[]) {
    if (p.gravedad === 'critico') reasons.push(`Crítico · ${p.tipo}: ${p.descripcion}`);
    else if (p.gravedad === 'medio' && BLOCKING_MEDIUM.test(p.tipo + ' ' + p.descripcion)) reasons.push(`${p.tipo}: ${p.descripcion}`);
  }
  if (input.onCamera) {
    if (input.listenCoverage == null) reasons.push('Falta escuchar el diálogo (Agente de Escucha).');
    else if (input.listenCoverage < GATE.listen) reasons.push(`Del diálogo solo se entiende el ${Math.round(input.listenCoverage * 100)} % (mínimo ${GATE.listen * 100} %).`);
  }
  return { pass: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/** La puerta está activa salvo que la película la desactive explícitamente. */
export function gateEnabled(film: { metadata?: Record<string, unknown> }) {
  return film.metadata?.puertaDeCalidad !== false;
}
