/**
 * Agente de Escucha: compara lo que SE OYE en una toma con la frase del guion.
 * Detecta diálogos ininteligibles o con palabras inventadas (algo que la vista no ve).
 */
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-zñ0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

/** Porcentaje de palabras del guion que se oyen, en orden (LCS de palabras). */
export function wordMatch(expected: string, heard: string) {
  const a = plain(expected), b = plain(heard);
  if (!a.length) return 1;
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  }
  return dp[a.length][b.length] / a.length;
}

export function listenVerdict(score: number) {
  return score >= 0.85 ? 'SE ENTIENDE' : score >= 0.6 ? 'DUDOSO' : 'NO SE ENTIENDE';
}

export const TRANSCRIBE_PROMPT = 'Transcribe literalmente, en español, todas las palabras habladas que se oyen en este audio. ' +
  'Si una parte no se entiende o son sonidos sin sentido, escríbelos tal como suenan entre corchetes, por ejemplo [demelación]. ' +
  'No corrijas ni completes nada. Devuelve solo la transcripción, sin comentarios.';

export type TimedWord = { palabra: string; inicio: number; fin: number; inteligible?: boolean };

/**
 * Tramo a quitar: el bloque más largo de palabras oídas que NO forman parte del guion y que queda
 * ENTRE palabras del guion (nunca se corta el principio ni el final de la frase).
 * Devuelve [desde, hasta] en segundos, ajustado al final de la palabra buena anterior y al inicio de la siguiente.
 */
export function extraneousSpan(expected: string, heard: TimedWord[]): [number, number] | null {
  const norm = (w: string) => w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-zñ0-9]/g, '');
  const a = expected.split(/\s+/).map(norm).filter(Boolean);
  const b = heard.map((w) => norm(w.palabra));
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    dp[i][j] = a[i] === b[j] && b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const matched = new Array<boolean>(b.length).fill(false);
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j] && b[j]) { matched[j] = true; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  let best: [number, number] | null = null;
  for (let j = 0; j < b.length;) {
    if (matched[j]) { j++; continue; }
    let k = j;
    while (k < b.length && !matched[k]) k++;
    const inside = j > 0 && k < b.length;           // entre palabras del guion
    if (inside && (!best || k - j > best[1] - best[0])) best = [j, k];
    j = k;
  }
  if (!best) return null;
  const from = heard[best[0] - 1].fin;                // justo al terminar la palabra buena anterior
  const to = heard[best[1]].inicio;                   // justo antes de la siguiente palabra buena
  return to - from > 0.15 ? [Math.round(from * 100) / 100, Math.round(to * 100) / 100] : null;
}
