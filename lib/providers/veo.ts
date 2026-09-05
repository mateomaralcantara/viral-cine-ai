import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { GoogleGenAI } from '@google/genai';
import type { ProjectInput } from '@/lib/domain/schemas';
import { assertPaidGenerationAllowed } from '@/lib/engine/production-safety';

export async function generateVeoVideo(imagePath: string, prompt: string, input: ProjectInput, outputPath: string, durationSeconds = 8) {
  assertPaidGenerationAllowed('generar video con Veo', 'GEMINI_API_KEY');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const bytes = await readFile(imagePath);
  let operation = await ai.models.generateVideos({
    model: process.env.GEMINI_VIDEO_MODEL || 'veo-3.1-fast-generate-preview',
    prompt,
    image: {
      imageBytes: bytes.toString('base64'),
      mimeType: extname(imagePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg'
    },
    config: {
      aspectRatio: input.aspectRatio,
      numberOfVideos: 1,
      durationSeconds: durationSeconds <= 4 ? 4 : durationSeconds <= 6 ? 6 : 8,
      resolution: process.env.GEMINI_VIDEO_RESOLUTION || '720p'
    }
  });

  const started = Date.now();
  while (!operation.done) {
    if (Date.now() - started > 20 * 60_000) throw new Error('Veo excedió 20 minutos de espera.');
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const video = operation.response?.generatedVideos?.[0]?.video;
  if (!video) throw new Error('Veo terminó sin devolver video.');
  await ai.files.download({ file: video, downloadPath: outputPath });
  return outputPath;
}
