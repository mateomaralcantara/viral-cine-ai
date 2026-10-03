import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { GoogleGenAI } from '@google/genai';
import type { ProjectInput } from '@/lib/domain/schemas';
import { assertPaidGenerationAllowed } from '@/lib/engine/production-safety';

export class VeoNoVideoError extends Error {
  readonly noChargeLikely = true;

  constructor(message: string) {
    super(message);
    this.name = 'VeoNoVideoError';
  }
}

export function isVeoNoChargeFailure(error: unknown) {
  return error instanceof VeoNoVideoError;
}

export async function generateVeoVideo(imagePath: string, prompt: string, input: ProjectInput, outputPath: string, durationSeconds = 8) {
  assertPaidGenerationAllowed('generar video con Veo', 'GEMINI_API_KEY');
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const previousGoogleApiKey = process.env.GOOGLE_API_KEY;
  // @google/genai can prioritize GOOGLE_API_KEY when both variables exist.
  // ViralCine's Veo path is explicitly guarded by GEMINI_API_KEY, so construct
  // this client with only that credential visible and restore the process env
  // immediately afterwards.
  if (previousGoogleApiKey !== undefined) delete process.env.GOOGLE_API_KEY;
  let ai: GoogleGenAI;
  try {
    ai = new GoogleGenAI({ apiKey: geminiApiKey });
  } finally {
    if (previousGoogleApiKey !== undefined) process.env.GOOGLE_API_KEY = previousGoogleApiKey;
  }
  const bytes = await readFile(imagePath);
  let operation = await ai.models.generateVideos({
    model: process.env.GEMINI_VIDEO_MODEL || 'veo-3.1-fast-generate-preview',
    source: {
      prompt,
      image: {
        imageBytes: bytes.toString('base64'),
        mimeType: extname(imagePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg'
      }
    },
    config: {
      aspectRatio: input.aspectRatio,
      numberOfVideos: 1,
      durationSeconds: durationSeconds <= 4 ? 4 : durationSeconds <= 6 ? 6 : 8,
      resolution: process.env.GEMINI_VIDEO_RESOLUTION || '720p',
      personGeneration: 'allow_adult'
    }
  });

  const started = Date.now();
  while (!operation.done) {
    if (Date.now() - started > 20 * 60_000) throw new Error('Veo excedió 20 minutos de espera.');
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const video = operation.response?.generatedVideos?.[0]?.video;
  if (!video) {
    const providerError = compactProviderDetail(operation.error);
    const metadata = compactProviderDetail(operation.metadata);
    const operationName = operation.name || 'sin-id';
    throw new VeoNoVideoError(
      'Veo terminó sin devolver video. operation=' + operationName +
      (providerError ? ' | providerError=' + providerError : '') +
      (metadata ? ' | metadata=' + metadata : '') +
      ' | Google indica que las generaciones bloqueadas/sin video no se cobran.'
    );
  }
  await ai.files.download({ file: video, downloadPath: outputPath });
  return outputPath;
}


function compactProviderDetail(value: unknown) {
  if (!value) return '';
  try {
    const text = JSON.stringify(value);
    return text.length > 700 ? text.slice(0, 700) + '…' : text;
  } catch {
    return String(value).slice(0, 700);
  }
}
