import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import type { ProjectInput } from '@/lib/domain/schemas';
import { assertPaidGenerationAllowed } from '@/lib/engine/production-safety';

export async function generateGeminiOmniVideo(
  referencePaths: string[],
  prompt: string,
  input: ProjectInput,
  outputPath: string
) {
  assertPaidGenerationAllowed('generar video con Gemini Omni', 'GEMINI_API_KEY');
  if (!referencePaths.length) throw new Error('Gemini Omni necesita al menos una referencia visual.');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const media = await Promise.all(referencePaths.slice(0, 6).map(async (filePath) => ({
    type: 'image' as const,
    data: (await readFile(filePath)).toString('base64'),
    mime_type: mimeFor(filePath)
  })));
  const taggedPrompt = [
    prompt,
    'Use the first supplied image as the opening frame.',
    media.length > 1 ? 'Use the remaining images as subject references. Preserve exact facial identity, wardrobe and proportions.' : '',
    'Single continuous cinematic shot. Authentic motion throughout. No slideshow, no still frame, no dialogue, no subtitles, no logos.'
  ].filter(Boolean).join(' ');

  const interaction = await ai.interactions.create({
    model: process.env.GEMINI_OMNI_VIDEO_MODEL || 'gemini-omni-flash-preview',
    input: [...media, { type: 'text' as const, text: taggedPrompt }],
    response_format: { type: 'video', aspect_ratio: input.aspectRatio, delivery: 'uri' },
    store: false,
    stream: false
  }, { timeout: 20 * 60_000 });

  if (interaction.status !== 'completed') {
    throw new Error(`Gemini Omni terminó con estado ${interaction.status}.`);
  }
  const video = interaction.output_video;
  if (!video) throw new Error('Gemini Omni terminó sin devolver video.');
  if (video.data) {
    await writeFile(outputPath, Buffer.from(video.data, 'base64'));
    return outputPath;
  }
  if (video.uri) {
    const fileId = video.uri.match(/files\/([a-z0-9-]+)/i)?.[1];
    if (!fileId) throw new Error('Gemini Omni devolvió una URI de video inválida.');
    const started = Date.now();
    while (true) {
      if (Date.now() - started > 20 * 60_000) throw new Error('Gemini Omni excedió 20 minutos procesando el video.');
      const file = await ai.files.get({ name: `files/${fileId}` });
      const state = String(file.state || '').toUpperCase();
      if (state === 'ACTIVE') break;
      if (state === 'FAILED') throw new Error(`Gemini Omni no pudo procesar el video: ${file.error?.message || 'estado FAILED'}.`);
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    await ai.files.download({ file: video, downloadPath: outputPath });
    return outputPath;
  }
  throw new Error('Gemini Omni devolvió un video sin datos ni URI.');
}

function mimeFor(filePath: string): 'image/png' | 'image/jpeg' | 'image/webp' {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  return 'image/jpeg';
}
