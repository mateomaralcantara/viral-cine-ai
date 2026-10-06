import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { assertPaidGenerationAllowed } from '@/lib/engine/production-safety';

const DEFAULT_BASE_URL =
  'https://dashscope-intl.aliyuncs.com/api/v1';
const DEFAULT_MODEL = 'wan2.6-i2v-flash';

export class WanNoChargeError extends Error {
  readonly noChargeLikely = true;

  constructor(message: string) {
    super(message);
    this.name = 'WanNoChargeError';
  }
}

export function isWanNoChargeFailure(error: unknown) {
  return error instanceof WanNoChargeError;
}

export async function generateWanImageVideo(
  imagePath: string,
  prompt: string,
  outputPath: string,
  durationSeconds = 6
) {
  assertPaidGenerationAllowed(
    'generar video con Wan 2.6 I2V Flash',
    'DASHSCOPE_API_KEY'
  );

  const apiKey = process.env.DASHSCOPE_API_KEY!;
  const baseUrl = (
    process.env.DASHSCOPE_BASE_URL || DEFAULT_BASE_URL
  ).replace(/\/$/, '');
  const model = process.env.WAN_VIDEO_MODEL || DEFAULT_MODEL;

  const image = await imageDataUrl(imagePath);
  const duration = Math.min(15, Math.max(2, Math.round(durationSeconds)));

  const create = await fetch(
    `${baseUrl}/services/aigc/video-generation/video-synthesis`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable'
      },
      body: JSON.stringify({
        model,
        input: {
          prompt: compactPrompt(prompt),
          img_url: image
        },
        parameters: {
          audio: false,
          resolution: '720P',
          prompt_extend: true,
          watermark: false,
          duration
        }
      })
    }
  );

  const created = await jsonResponse(create);
  if (!create.ok) {
    throw new WanNoChargeError(
      `Wan rechazó la creación del trabajo (HTTP ${create.status}): ${wanDetail(created)}`
    );
  }

  const taskId = created?.output?.task_id;
  if (!taskId) {
    throw new WanNoChargeError(
      `Wan no devolvió task_id: ${wanDetail(created)}`
    );
  }

  const started = Date.now();
  while (Date.now() - started < 12 * 60_000) {
    await new Promise((resolve) => setTimeout(resolve, 10_000));

    const response = await fetch(
      `${baseUrl}/tasks/${encodeURIComponent(taskId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      }
    );
    const task = await jsonResponse(response);

    if (!response.ok) {
      throw new Error(
        `Wan no pudo consultar el trabajo ${taskId} (HTTP ${response.status}): ${wanDetail(task)}`
      );
    }

    const status = String(task?.output?.task_status || '').toUpperCase();

    if (status === 'SUCCEEDED') {
      const videoUrl = task?.output?.video_url;
      if (!videoUrl) {
        throw new Error(
          `Wan marcó SUCCEEDED sin video_url para ${taskId}.`
        );
      }
      await downloadVideo(videoUrl, outputPath);
      return outputPath;
    }

    if (['FAILED', 'CANCELED', 'UNKNOWN'].includes(status)) {
      throw new WanNoChargeError(
        `Wan terminó ${status} para ${taskId}: ${wanDetail(task)}`
      );
    }
  }

  throw new Error(
    `Wan excedió 12 minutos esperando el trabajo ${taskId}; el estado de cobro debe reconciliarse antes de reintentar.`
  );
}

async function imageDataUrl(filePath: string) {
  const bytes = await readFile(filePath);
  const ext = extname(filePath).toLowerCase();
  const mime =
    ext === '.png'
      ? 'image/png'
      : ext === '.webp'
        ? 'image/webp'
        : 'image/jpeg';

  return `data:${mime};base64,${bytes.toString('base64')}`;
}

async function downloadVideo(url: string, outputPath: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Wan generó el video pero no se pudo descargar (HTTP ${response.status}).`
    );
  }
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}

async function jsonResponse(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 900) };
  }
}

function wanDetail(value: any) {
  const detail =
    value?.message ||
    value?.output?.message ||
    value?.code ||
    value?.output?.code ||
    JSON.stringify(value || {});

  return String(detail).slice(0, 900);
}

function compactPrompt(prompt: string) {
  return prompt.replace(/\s+/g, ' ').trim().slice(0, 1450);
}
