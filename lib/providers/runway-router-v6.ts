import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API_ROOT = 'https://api.dev.runwayml.com';
const API_VERSION = '2024-11-06';

export type RunwayRouterVideoInput = {
  configId: string;
  input: {
    promptText: string;
    aspectRatio: '16:9' | '9:16';
    duration: number;
    resolution?: '720p' | '1080p';
    referenceImages?: Array<{
      uri: string;
      role: 'first';
    }>;
  };
};

export type RunwayDryRunResult = {
  model: string;
  credits: number;
  resolvedSettings?: Record<string, unknown>;
};

export type GrokLiteImageToVideoRequest = {
  model: 'grok_imagine_1_5_lite';
  promptImage: string;
  promptText?: string;
  ratio: 'auto_480p' | 'auto_720p' | 'auto_1080p';
  duration: number;
};

export function grokLiteImageToVideoCredits(
  durationSeconds: number,
  ratio: GrokLiteImageToVideoRequest['ratio']
) {
  if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 15) {
    throw new Error('Grok Lite permite duraciones enteras de 1 a 15 segundos.');
  }

  const perSecond =
    ratio === 'auto_480p' ? 2 :
    ratio === 'auto_720p' ? 3 :
    14;

  return durationSeconds * perSecond + 1;
}

export async function imageFileToDataUri(filePath: string) {
  const data = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === '.png'
      ? 'image/png'
      : ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : undefined;

  if (!mime) {
    throw new Error('Formato de imagen no permitido para Runway: ' + ext);
  }

  const encoded = data.toString('base64');
  const uri = 'data:' + mime + ';base64,' + encoded;

  if (Buffer.byteLength(uri, 'utf8') > 5 * 1024 * 1024) {
    throw new Error(
      'La imagen de referencia supera el máximo seguro de 5MB como Data URI.'
    );
  }

  return uri;
}

export async function dryRunRunwayRouterVideo(
  request: RunwayRouterVideoInput,
  secret: string
): Promise<RunwayDryRunResult> {
  const response = await runwayRequest(
    '/v1/generate/video',
    {
      ...request,
      dryRun: true
    },
    secret
  );

  const routing = record(response.routing);
  const estimatedCost = record(routing.estimatedCost);
  const model = stringValue(routing.model);
  const credits = numberValue(estimatedCost.credits);

  if (!model || credits === undefined) {
    throw new Error(
      'Runway dryRun no devolvió routing.model y routing.estimatedCost.credits.'
    );
  }

  return {
    model,
    credits,
    resolvedSettings: record(routing.resolvedSettings)
  };
}

export async function generateRunwayGrokLiteFromEnvironment(
  request: GrokLiteImageToVideoRequest,
  outputPath: string,
  timeoutMs = 12 * 60 * 1000
) {
  const key = process.env.RUNWAYML_API_SECRET?.trim();
  if (!key || key.length < 8) {
    throw new Error('Runway API secret no está configurado.');
  }
  return generateRunwayGrokLiteImageToVideo(
    request,
    key,
    outputPath,
    timeoutMs
  );
}

export async function generateRunwayGrokLiteImageToVideo(
  request: GrokLiteImageToVideoRequest,
  secret: string,
  outputPath: string,
  timeoutMs = 12 * 60 * 1000
) {
  if (request.model !== 'grok_imagine_1_5_lite') {
    throw new Error('ViralCine 6 Safe solo autoriza grok_imagine_1_5_lite en esta ruta.');
  }

  const submitted = await runwayRequest(
    '/v1/image_to_video',
    request,
    secret
  );

  const taskId =
    stringValue(submitted.id) ||
    stringValue(record(submitted.task).id);

  if (!taskId) {
    throw new Error('Runway no devolvió task id.');
  }

  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    await sleep(5000);

    const task = await runwayGet(
      '/v1/tasks/' + encodeURIComponent(taskId),
      secret
    );

    const status = stringValue(task.status);

    if (status === 'SUCCEEDED') {
      const output = Array.isArray(task.output)
        ? task.output.find((item) => typeof item === 'string')
        : undefined;

      if (typeof output !== 'string') {
        throw new Error('Runway terminó la tarea sin URL de salida.');
      }

      const media = await fetch(output);
      if (!media.ok) {
        throw new Error(
          'No se pudo descargar el video de Runway: HTTP ' + media.status
        );
      }

      await writeFile(
        outputPath,
        Buffer.from(await media.arrayBuffer())
      );

      return {
        taskId,
        model: request.model,
        credits: grokLiteImageToVideoCredits(
          request.duration,
          request.ratio
        ),
        outputPath
      };
    }

    if (status === 'FAILED' || status === 'CANCELED') {
      throw new Error(
        'Runway terminó la tarea con estado ' +
          status +
          '. taskId=' +
          taskId
      );
    }
  }

  throw new Error(
    'Timeout esperando Runway. taskId=' +
      taskId +
      '. No reintentes automáticamente; consulta la tarea primero.'
  );
}

export async function generateRunwayRouterVideo(
  request: RunwayRouterVideoInput,
  secret: string,
  outputPath: string,
  timeoutMs = 12 * 60 * 1000
) {
  const submitted = await runwayRequest(
    '/v1/generate/video',
    request,
    secret
  );

  const taskId =
    stringValue(submitted.id) ||
    stringValue(record(submitted.task).id);

  if (!taskId) {
    throw new Error('Runway no devolvió task id.');
  }

  const routing = record(submitted.routing);
  const model = stringValue(routing.model);
  const realizedCost = record(routing.realizedCost);
  const estimatedCost = record(routing.estimatedCost);
  const credits =
    numberValue(realizedCost.credits) ??
    numberValue(estimatedCost.credits);

  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    await sleep(5000);

    const task = await runwayGet(
      '/v1/tasks/' + encodeURIComponent(taskId),
      secret
    );

    const status = stringValue(task.status);

    if (status === 'SUCCEEDED') {
      const output = Array.isArray(task.output)
        ? task.output.find((item) => typeof item === 'string')
        : undefined;

      if (typeof output !== 'string') {
        throw new Error('Runway terminó la tarea sin URL de salida.');
      }

      const media = await fetch(output);
      if (!media.ok) {
        throw new Error(
          'No se pudo descargar el video de Runway: HTTP ' + media.status
        );
      }

      await writeFile(
        outputPath,
        Buffer.from(await media.arrayBuffer())
      );

      return {
        taskId,
        model:
          model ||
          stringValue(record(task.routing).model) ||
          'runway-router',
        credits:
          credits ??
          numberValue(
            record(record(task.routing).realizedCost).credits
          ),
        outputPath
      };
    }

    if (status === 'FAILED' || status === 'CANCELED') {
      throw new Error(
        'Runway terminó la tarea con estado ' +
          status +
          '. taskId=' +
          taskId
      );
    }
  }

  throw new Error(
    'Timeout esperando Runway. taskId=' +
      taskId +
      '. No reintentes automáticamente; consulta la tarea primero.'
  );
}

async function runwayRequest(
  endpoint: string,
  body: unknown,
  secret: string
) {
  const response = await fetch(API_ROOT + endpoint, {
    method: 'POST',
    headers: headers(secret),
    body: JSON.stringify(body)
  });

  const text = await response.text();
  const parsed = parseJson(text);

  if (!response.ok) {
    throw new Error(
      'Runway HTTP ' +
        response.status +
        ': ' +
        safeBody(parsed, secret)
    );
  }

  return record(parsed);
}

async function runwayGet(
  endpoint: string,
  secret: string
) {
  const response = await fetch(API_ROOT + endpoint, {
    method: 'GET',
    headers: headers(secret)
  });

  const text = await response.text();
  const parsed = parseJson(text);

  if (!response.ok) {
    throw new Error(
      'Runway HTTP ' +
        response.status +
        ': ' +
        safeBody(parsed, secret)
    );
  }

  return record(parsed);
}

function headers(secret: string) {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + secret,
    'X-Runway-Version': API_VERSION
  };
}

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object'
    ? (value as Record<string, any>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : undefined;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function safeBody(value: unknown, secret: string) {
  return JSON.stringify(value)
    .split(secret)
    .join('[RUNWAY_SECRET_OCULTO]')
    .slice(0, 2400);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
