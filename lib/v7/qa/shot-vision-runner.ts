/**
 * Llamada al modelo de visión (Gemini) para revisar un video. Compartido por el
 * revisor (calidad-tomas) y el reparador (reparar-tomas).
 */
import type { GoogleGenAI } from '@google/genai';
import { buildReviewPrompt, normalizeReview, reviewCostUsd, REVIEW_JSON_SCHEMA, type ShotReview, type ShotReviewInput } from '@/lib/v7/qa/shot-vision-review';

export type ReviewResult = ShotReview & { model: string; inputTokens: number; outputTokens: number; costUsd: number };

export const QA_MODELS = process.env.V7_QA_MODEL?.trim() ? [process.env.V7_QA_MODEL.trim()] : ['gemini-3-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash'];

export class VisionReviewer {
  private modelIndex = 0;
  constructor(private ai: GoogleGenAI, private cover: { mimeType: string; data: string } | null, private models = QA_MODELS) {}

  get hasCover() { return !!this.cover; }

  async review(video: Buffer, input: Omit<ShotReviewInput, 'hasCover'>): Promise<ReviewResult> {
    for (;;) {
      const model = this.models[this.modelIndex];
      try {
        const res = await this.ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [
            { inlineData: { mimeType: 'video/mp4', data: video.toString('base64') } },
            ...(this.cover ? [{ inlineData: this.cover }] : []),
            { text: buildReviewPrompt({ ...input, hasCover: !!this.cover }) }
          ] }],
          config: { temperature: 0.2, responseMimeType: 'application/json', responseJsonSchema: REVIEW_JSON_SCHEMA }
        });
        const review = normalizeReview(res.text ?? '', { onCamera: input.onCamera });
        const inputTokens = res.usageMetadata?.promptTokenCount ?? 0;
        const outputTokens = (res.usageMetadata?.candidatesTokenCount ?? 0) + (res.usageMetadata?.thoughtsTokenCount ?? 0);
        return { ...review, model, inputTokens, outputTokens, costUsd: reviewCostUsd(inputTokens, outputTokens) };
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        if (/404|NOT_FOUND|not found|is not supported/i.test(msg) && this.modelIndex < this.models.length - 1) { this.modelIndex++; continue; }
        throw new Error(msg.replace(/\s+/g, ' ').slice(0, 220));
      }
    }
  }
}
