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
