/**
 * Agente reparador (planificación, pura): a partir del informe del revisor decide
 * arreglos GRATUITOS con FFmpeg sobre el video ya generado. No vuelve a generar
 * video ni llama a proveedores. Cada intento posterior es más agresivo.
 *
 *   texto / logo / marca de agua  -> recorte (zoom) alejándose de la esquina afectada
 *   fallo en un segundo concreto  -> se recorta el tramo malo y se usa el mejor tramo limpio
 *   parpadeo                      -> deflicker + reducción de ruido
 *   manos / anatomía              -> zoom anclado arriba (las manos suelen ir abajo)
 *   bocas hablando                -> se silencia el audio original (la voz en off manda)
 *   identidad / caminar que desliza -> no se arregla gratis: necesita volver a generar
 * Siempre: igualación de color suave y nitidez ligera.
 */
import type { ShotReview } from '@/lib/v7/qa/shot-vision-review';

export type RepairPlan = {
  attempt: number;
  zoom: number;                 // 1 = sin recorte
  anchorX: number;              // 0 izquierda, 0.5 centro, 1 derecha (qué parte se conserva)
  anchorY: number;              // 0 arriba, 0.5 centro, 1 abajo
  window: { start: number; end: number } | null; // tramo a conservar
  speed: number;                // < 1 = cámara lenta para recuperar duración
  deflicker: boolean;
  muteOriginal: boolean;
  actions: string[];            // explicación en español
  unfixable: string[];          // lo que solo se arregla regenerando
};

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const has = (s: string, re: RegExp) => re.test(plain(s));

const RE = {
  text: /texto|logo|marca de agua|letras|subtitul/,
  glitch: /artefact|glitch|recuadro|superpuest|ghost|congelad|transicion|corte|salto/,
  flicker: /parpade|flicker|inestab|ruido digital/,
  mouth: /boca|labio|silb|habla|sincronia labial/,
  anatomy: /mano|dedo|anatom|brazo|deform/,
  identity: /identidad|no coincide|pelo corto|no se parece/,
  walk: /desliz|camina|pisada|peso/,
  tear: /lagrima|fluido/
};

/** Tramo limpio más largo evitando ±margen alrededor de los segundos con fallo. */
export function cleanWindow(duration: number, badSeconds: number[], margin = 0.6, minimum = 3) {
  const cuts = badSeconds.filter((s) => Number.isFinite(s) && s >= 0 && s <= duration).sort((a, b) => a - b);
  if (!cuts.length) return null;
  let best = { start: 0, end: 0 };
  let cursor = 0;
  for (const s of cuts) {
    const end = Math.max(cursor, s - margin);
    if (end - cursor > best.end - best.start) best = { start: cursor, end };
    cursor = Math.max(cursor, s + margin);
  }
  if (duration - cursor > best.end - best.start) best = { start: cursor, end: duration };
  const round = (n: number) => Math.round(n * 100) / 100;
  return best.end - best.start >= minimum ? { start: round(best.start), end: round(best.end) } : null;
}

export function planRepair(review: ShotReview, duration: number, attempt = 1): RepairPlan {
  const plan: RepairPlan = { attempt, zoom: 1, anchorX: 0.5, anchorY: 0.5, window: null, speed: 1, deflicker: false, muteOriginal: false, actions: [], unfixable: [] };
  const issues = review.problemas.map((p) => ({ ...p, all: p.tipo + ' ' + p.descripcion }));
  const strong = attempt >= 2;
  if (review.textoEnPantalla || issues.some((p) => has(p.all, RE.text))) {
    const where = plain(issues.filter((p) => has(p.all, RE.text)).map((p) => p.descripcion).join(' '));
    plan.zoom = Math.max(plan.zoom, strong ? 1.3 : 1.2);
    plan.anchorX = /derech/.test(where) ? 0 : /izquierd/.test(where) ? 1 : 0.5;
    plan.anchorY = /inferior|abajo/.test(where) ? 0 : /superior|arriba/.test(where) ? 1 : 0.5;
    plan.actions.push('Recorte para sacar el texto/logo del encuadre');
  }
  const bad = issues.filter((p) => p.segundo != null && (has(p.all, RE.glitch) || has(p.all, RE.tear) || strong)).map((p) => p.segundo!);
  const win = cleanWindow(duration, bad, strong ? 0.9 : 0.6);
  if (win && win.end - win.start < duration - 0.2) {
    plan.window = win;
    plan.speed = Math.max(0.75, Math.min(1, (win.end - win.start) / Math.min(duration, 6)));
    plan.actions.push(`Se quita el tramo con fallo: se usa ${win.start.toFixed(1)}–${win.end.toFixed(1)} s` + (plan.speed < 1 ? ` en cámara lenta (${Math.round(plan.speed * 100)} %)` : ''));
  }
  if (issues.some((p) => has(p.all, RE.flicker)) || strong) { plan.deflicker = true; plan.actions.push('Quitar parpadeo y ruido'); }
  if (review.bocasHablando || issues.some((p) => has(p.all, RE.mouth))) {
    plan.muteOriginal = true;
    plan.actions.push('Silenciar el audio original (las bocas no se pueden cerrar sin regenerar)');
    if (strong && plan.zoom < 1.15) { plan.zoom = 1.15; plan.actions.push('Zoom para restar protagonismo a los personajes del fondo'); }
  }
  if (issues.some((p) => has(p.all, RE.anatomy) && p.gravedad !== 'leve') && plan.zoom === 1) {
    plan.zoom = strong ? 1.3 : 1.18;
    plan.anchorY = 0;
    plan.actions.push('Zoom hacia arriba para sacar las manos del encuadre');
  }
  if (review.identidad != null && review.identidad < 6 || issues.some((p) => has(p.all, RE.identity) && p.gravedad === 'critico')) plan.unfixable.push('identidad de Martin (necesita foto de referencia y regenerar)');
  if (issues.some((p) => has(p.all, RE.walk) && p.gravedad === 'critico') && !plan.window) plan.unfixable.push('movimiento al caminar (regenerar)');
  if (issues.some((p) => has(p.all, RE.tear) && p.gravedad === 'critico') && !plan.window) plan.unfixable.push('lágrima/fluido sin segundo concreto (regenerar)');
  plan.actions.push('Igualar color y dar nitidez ligera');
  return plan;
}

/** Filtro de video de FFmpeg para el plan. Salida 1280×720, 24 fps. */
export function repairVideoFilter(plan: RepairPlan) {
  const f: string[] = [];
  if (plan.window) f.push(`trim=start=${plan.window.start}:end=${plan.window.end}`, 'setpts=PTS-STARTPTS');
  if (plan.speed < 1) f.push(`setpts=PTS/${plan.speed.toFixed(3)}`);
  if (plan.zoom > 1) {
    const z = plan.zoom.toFixed(3);
    f.push(`crop=trunc(iw/${z}/2)*2:trunc(ih/${z}/2)*2:(iw-iw/${z})*${plan.anchorX}:(ih-ih/${z})*${plan.anchorY}`);
  }
  f.push('scale=1280:720:flags=lanczos', 'setsar=1');
  if (plan.deflicker) f.push('deflicker=size=5:mode=pm', 'hqdn3d=1.5:1.5:6:6');
  f.push('eq=contrast=1.04:saturation=1.05:gamma=0.98', 'unsharp=5:5:0.6:5:5:0', 'fps=24', 'format=yuv420p');
  return f.join(',');
}

export function repairAudioFilter(plan: RepairPlan) {
  const f: string[] = [];
  if (plan.window) f.push(`atrim=start=${plan.window.start}:end=${plan.window.end}`, 'asetpts=PTS-STARTPTS');
  if (plan.speed < 1) f.push(`atempo=${Math.max(0.5, plan.speed).toFixed(3)}`);
  f.push(plan.muteOriginal ? 'volume=0' : 'volume=1', 'aresample=48000');
  return f.join(',');
}

/** ¿Se queda la reparación? Debe subir la nota y no empeorar el parecido con el guion. */
export function acceptRepair(before: ShotReview, after: ShotReview) {
  return after.puntuacion >= before.puntuacion + 0.5 && after.coincideConGuion >= before.coincideConGuion - 1;
}
