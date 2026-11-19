/**
 * Traducción de los subtítulos al inglés con Gemini (céntimos por película).
 * Guarda lo traducido en <película>/subtitulos/en.json: nunca se paga dos veces la misma frase.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { googleClient, videoPlatform } from '@/lib/v7/production/scene-veo-engine';
import { QA_MODELS } from '@/lib/v7/qa/shot-vision-runner';

export function translationPrompt(lines: string[], context: string) {
  return [
    'You are a professional film subtitle translator (Spanish -> English).',
    'Translate each Spanish subtitle into natural, literary, emotionally faithful English, as in a high-end drama film.',
    'Keep proper names (Martin, Ágape, Kant, Leibniz, Camus…), keep ellipses and question/exclamation marks, keep it concise for subtitles.',
    'Context of the film: ' + context,
    'Return ONLY a JSON array of strings with exactly ' + lines.length + ' items, in the same order.',
    JSON.stringify(lines)
  ].join('\n');
}

export async function translateToEnglish(filmRoot: string, lines: string[], context: string): Promise<Map<string, string>> {
  const cacheFile = path.join(filmRoot, 'subtitulos', 'en.json');
  let cache: Record<string, string> = {};
  try { cache = JSON.parse(await readFile(cacheFile, 'utf8')); } catch { /* sin caché */ }
  const todo = [...new Set(lines.filter((l) => l.trim() && !cache[l]))];
  if (todo.length) {
    const platform = videoPlatform();
    const ai = googleClient(platform, platform === 'vertex' ? (process.env.V7_QA_LOCATION?.trim() || 'global') : undefined);
    for (let i = 0; i < todo.length; i += 60) {
      const batch = todo.slice(i, i + 60);
      let out: unknown = null;
      for (const model of QA_MODELS) {
        try {
          const res = await ai.models.generateContent({
            model, contents: [{ role: 'user', parts: [{ text: translationPrompt(batch, context) }] }],
            config: { temperature: 0.3, responseMimeType: 'application/json', responseJsonSchema: { type: 'array', items: { type: 'string' } } }
          });
          out = JSON.parse(res.text ?? '[]');
          break;
        } catch (e) {
          if (!/404|NOT_FOUND|not found|is not supported/i.test(String((e as Error)?.message ?? e))) throw e;
        }
      }
      if (!Array.isArray(out) || out.length !== batch.length) throw new Error('La traducción no devolvió el mismo número de frases; vuelve a intentarlo.');
      batch.forEach((l, k) => { cache[l] = String((out as unknown[])[k]).trim(); });
    }
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify(cache, null, 2) + '\n', 'utf8');
  }
  return new Map(lines.map((l) => [l, cache[l] ?? l]));
}
