import { basename, extname } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { fal } from '@fal-ai/client';
import { describeFalFailure, normalizeFalVideoPrompt } from '@/lib/providers/fal-compat';

function configure() {
  if (!process.env.FAL_KEY) throw new Error('Falta FAL_KEY');
  fal.config({ credentials: process.env.FAL_KEY });
}

async function upload(localPath: string) {
  configure();
  const data = await readFile(localPath);
  const file = new File([data], basename(localPath), { type: mimeFor(localPath) });
  return withFalContext('subir el recurso', () => fal.storage.upload(file));
}

async function saveRemote(url: string, outputPath: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo descargar el resultado de Fal (${response.status}).`);
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  return outputPath;
}

export async function generateFalVideo(imagePath: string, prompt: string, outputPath: string, durationSeconds = 8) {
  configure();
  const imageUrl = await upload(imagePath);
  const model = process.env.FAL_VIDEO_MODEL || 'fal-ai/vidu/q3/image-to-video';
  const safePrompt = normalizeFalVideoPrompt(prompt);
  const safeDuration = Math.min(16, Math.max(1, Math.round(durationSeconds)));
  const result = await withFalContext(`generar el video con ${model}`, () => fal.subscribe(model, {
    input: { image_url: imageUrl, prompt: safePrompt, duration: safeDuration, resolution: '720p', audio: true },
    logs: true
  }));
  return saveRemote(findMediaUrl(result.data, 'video'), outputPath);
}

export async function generateFalAvatar(imagePath: string, audioPath: string, prompt: string, outputPath: string) {
  configure();
  const [imageUrl, audioUrl] = await Promise.all([upload(imagePath), upload(audioPath)]);
  const model = process.env.FAL_AVATAR_MODEL || 'fal-ai/longcat-single-avatar/image-audio-to-video';
  const result = await withFalContext('generar el avatar', () => fal.subscribe(model, {
    input: { image_url: imageUrl, audio_url: audioUrl, prompt },
    logs: true
  }));
  return saveRemote(findMediaUrl(result.data, 'video'), outputPath);
}

export async function generateFalMusic(prompt: string, durationSeconds: number, outputPath: string) {
  configure();
  const model = process.env.FAL_MUSIC_MODEL || 'cassetteai/music-generator';
  const result = await withFalContext('generar la música', () => fal.subscribe(model, {
    input: { prompt, duration: Math.min(180, Math.max(30, durationSeconds)), instrumental: true },
    logs: true
  }));
  return saveRemote(findMediaUrl(result.data, 'audio'), outputPath);
}

function findMediaUrl(value: unknown, preferredKey: 'video' | 'audio'): string {
  const visited = new Set<unknown>();
  const walk = (node: unknown, depth: number): string | undefined => {
    if (depth > 8 || node == null || visited.has(node)) return undefined;
    if (typeof node === 'string' && /^https?:\/\//.test(node)) return node;
    if (typeof node !== 'object') return undefined;
    visited.add(node);
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item, depth + 1);
        if (found) return found;
      }
      return undefined;
    }
    const record = node as Record<string, unknown>;
    const preferred = walk(record[preferredKey], depth + 1);
    if (preferred) return preferred;
    if (typeof record.url === 'string' && /^https?:\/\//.test(record.url)) return record.url;
    for (const child of Object.values(record)) {
      const found = walk(child, depth + 1);
      if (found) return found;
    }
    return undefined;
  };
  const url = walk(value, 0);
  if (!url) throw new Error(`Fal no devolvió una URL de ${preferredKey}.`);
  return url;
}

function mimeFor(filePath: string) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.mp4') return 'video/mp4';
  return 'application/octet-stream';
}

async function withFalContext<T>(operation: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const failure = describeFalFailure(error);
    const detail = failure.details.length > 0 ? failure.details.join('; ') : failure.message;
    const request = failure.requestId ? ` Solicitud Fal: ${failure.requestId}.` : '';
    if (failure.status === 422 || /\b422\b|unprocessable entity/i.test(failure.message)) {
      throw new Error(`Fal.ai rechazó los datos para ${operation} (HTTP 422): ${detail}.${request}`);
    }
    if (failure.status === 403 || /\b403\b|forbidden/i.test(failure.message)) {
      throw new Error(`Fal.ai rechazó ${operation} (HTTP 403). Verifica que FAL_KEY sea válida, que la cuenta tenga saldo y que el modelo configurado esté habilitado.`);
    }
    if (failure.status === 401 || /\b401\b|unauthorized|invalid.*key/i.test(failure.message)) {
      throw new Error(`Fal.ai rechazó la clave durante ${operation} (HTTP 401). Crea o copia nuevamente FAL_KEY.`);
    }
    throw new Error(`Fal.ai no pudo ${operation}: ${detail}.${request}`);
  }
}
