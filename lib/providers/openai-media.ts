import { basename } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import OpenAI, { toFile } from 'openai';
import { assertPaidGenerationAllowed } from '@/lib/engine/production-safety';

function client(operation: string) {
  assertPaidGenerationAllowed(operation, 'OPENAI_API_KEY');
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function generateImage(prompt: string, outputPath: string) {
  const response = await client('generar una imagen con OpenAI').images.generate({
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
    prompt,
    size: '1536x1024',
    quality: 'medium'
  });
  const base64 = response.data?.[0]?.b64_json;
  if (!base64) throw new Error('OpenAI no devolvió la imagen esperada.');
  await writeFile(outputPath, Buffer.from(base64, 'base64'));
  return outputPath;
}

export async function generateImageWithReferences(referencePaths: string[], prompt: string, outputPath: string) {
  if (!referencePaths.length) return generateImage(prompt, outputPath);
  const images = await Promise.all(
    referencePaths.slice(0, 8).map(async (referencePath) =>
      toFile(await readFile(referencePath), basename(referencePath), { type: 'image/png' })
    )
  );
  const response = await client('editar una imagen con OpenAI').images.edit({
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
    image: images,
    prompt,
    size: '1536x1024',
    quality: 'medium'
  });
  const base64 = response.data?.[0]?.b64_json;
  if (!base64) throw new Error('OpenAI no devolvió la escena editada esperada.');
  await writeFile(outputPath, Buffer.from(base64, 'base64'));
  return outputPath;
}

export async function generateSpeech(
  text: string,
  instructions: string,
  outputPath: string,
  voice?: string
) {
  const selectedVoice = voice?.trim() || process.env.OPENAI_TTS_VOICE || 'marin';
  const response = await client('generar voz con OpenAI').audio.speech.create({
    model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
    voice: selectedVoice as 'marin',
    input: text.slice(0, 4096),
    instructions,
    response_format: 'mp3'
  });
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  return outputPath;
}
