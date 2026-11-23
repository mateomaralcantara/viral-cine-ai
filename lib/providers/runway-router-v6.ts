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

export type Grok15AudioDrivenRequest = {
  model: 'grok_imagine_1_5';
  promptText: string;
  duration: number;
  ratio: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '3:2' | '2:3';
  resolution: '480p' | '720p' | '1080p';
  references: Array<{ uri: string }>;
  referenceAudio: Array<{ type: 'audio'; uri: string }>;
};

export type Wan3AudioReferenceRequest = {
  model: 'wan3';
  promptText: string;
  audio: true;
  duration: number;
  ratio: '832:480' | '1280:720' | '1920:1080';
  references: Array<{ uri: string }>;
  referenceAudio: Array<{ type: 'audio'; uri: string }>;
};

export function wan3VideoCredits(
  durationSeconds: number,
  ratio: Wan3AudioReferenceRequest['ratio']
) {
  if (!Number.isInteger(durationSeconds) || durationSeconds < 2 || durationSeconds > 30) {
    throw new Error('WAN 3.0 permite duraciones enteras de 2 a 30 segundos.');
  }

  const perSecond =
    ratio === '832:480' ? 5 :
    ratio === '1280:720' ? 10 :
    20;

  return durationSeconds * perSecond;
}

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

export async function audioFileToDataUri(filePath: string) {
  const data = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === '.mp3'
      ? 'audio/mpeg'
      : ext === '.wav'
        ? 'audio/wav'
        : ext === '.flac'
          ? 'audio/flac'
          : ext === '.m4a'
            ? 'audio/mp4'
            : ext === '.aac'
              ? 'audio/aac'
              : undefined;

  if (!mime) {
    throw new Error('Formato de audio no permitido para Runway: ' + ext);
  }

  const uri = 'data:' + mime + ';base64,' + data.toString('base64');

  if (Buffer.byteLength(uri, 'utf8') > 5 * 1024 * 1024) {
    throw new Error(
      'El audio de referencia supera el máximo seguro de 5MB como Data URI.'
    );
  }

  return uri;
}

export function grok15AudioDrivenCredits(
  durationSeconds: number,
  resolution: Grok15AudioDrivenRequest['resolution'],
  imageReferenceCount: number,
  audioReferenceCount: number
) {
  if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 15) {
    throw new Error('Grok 1.5 permite duraciones enteras de 1 a 15 segundos.');
  }
  if (imageReferenceCount < 1) {
    throw new Error('Grok 1.5 audio-driven exige al menos una referencia de imagen.');
  }
  if (audioReferenceCount < 1 || audioReferenceCount > 3) {
    throw new Error('Grok 1.5 audio-driven exige entre 1 y 3 referencias de audio.');
  }
  if (resolution === '1080p') {
    throw new Error('Grok 1.5 con referencias de imagen/audio está limitado a 720p.');
  }

  const perSecond = resolution === '480p' ? 10 : 16;
  return (
    durationSeconds * perSecond +
    imageReferenceCount +
    audioReferenceCount
  );
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

export async function getRunwayTaskDetailsFromEnvironment(
  taskId: string
) {
  const key = process.env.RUNWAYML_API_SECRET?.trim();
  if (!key || key.length < 8) {
    throw new Error('Runway API secret no está configurado.');
  }

  const task = await runwayGet(
    '/v1/tasks/' + encodeURIComponent(taskId),
    key
  );

  return {
    id: stringValue(task.id) || taskId,
    status: stringValue(task.status) || 'UNKNOWN',
    failureCode: stringValue(task.failureCode),
    failure: stringValue(task.failure),
    createdAt: stringValue(task.createdAt),
    output: Array.isArray(task.output)
      ? task.output.filter((item): item is string => typeof item === 'string')
      : []
  };
}

export async function generateRunwayWan3AudioReferenceFromEnvironment(
  request: Wan3AudioReferenceRequest,
  outputPath: string,
  timeoutMs = 12 * 60 * 1000
) {
  const key = process.env.RUNWAYML_API_SECRET?.trim();
  if (!key || key.length < 8) {
    throw new Error('Runway API secret no está configurado.');
  }

  if (request.model !== 'wan3') {
    throw new Error('ViralCine 6 Safe solo autoriza wan3 en esta ruta.');
  }

  if (!request.references.length || !request.referenceAudio.length) {
    throw new Error('WAN 3.0 audio-reference requiere imagen y audio de referencia.');
  }

  const credits = wan3VideoCredits(
    request.duration,
    request.ratio
  );

  const submitted = await runwayRequest(
    '/v1/text_to_video',
    request,
    key
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
      key
    );
    const status = stringValue(task.status);

    if (status === 'SUCCEEDED') {
      const output = Array.isArray(task.output)
        ? task.output.find((item) => typeof item === 'string')
        : undefined;

      if (typeof output !== 'string') {
        throw new Error('Runway terminó WAN 3.0 sin URL de salida.');
      }

      const media = await fetch(output);
      if (!media.ok) {
        throw new Error(
          'No se pudo descargar el video WAN 3.0: HTTP ' + media.status
        );
      }

      await writeFile(
        outputPath,
        Buffer.from(await media.arrayBuffer())
      );

      return {
        taskId,
        model: request.model,
        credits,
        outputPath
      };
    }

    if (status === 'FAILED' || status === 'CANCELED') {
      const failureCode = stringValue(task.failureCode);
      const failure = stringValue(task.failure);
      throw new Error(
        'Runway WAN 3.0 terminó con estado ' +
          status +
          '. taskId=' +
          taskId +
          (failureCode ? ' failureCode=' + failureCode : '') +
          (failure ? ' failure=' + failure : '')
      );
    }
  }

  throw new Error(
    'Timeout esperando WAN 3.0. taskId=' +
      taskId +
      '. No reintentes automáticamente; consulta la tarea primero.'
  );
}

export async function generateRunwayGrok15AudioDrivenFromEnvironment(
  request: Grok15AudioDrivenRequest,
  outputPath: string,
  timeoutMs = 12 * 60 * 1000
) {
  const key = process.env.RUNWAYML_API_SECRET?.trim();
  if (!key || key.length < 8) {
    throw new Error('Runway API secret no está configurado.');
  }

  if (request.model !== 'grok_imagine_1_5') {
    throw new Error('ViralCine 6 Safe solo autoriza grok_imagine_1_5 en esta ruta.');
  }

  if (!request.references.length || !request.referenceAudio.length) {
    throw new Error('La ruta audio-driven requiere imagen y audio de referencia.');
  }

  const credits = grok15AudioDrivenCredits(
    request.duration,
    request.resolution,
    request.references.length,
    request.referenceAudio.length
  );

  const submitted = await runwayRequest(
    '/v1/text_to_video',
    request,
    key
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
      key
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
        credits,
        outputPath
      };
    }

    if (status === 'FAILED' || status === 'CANCELED') {
      const failureCode = stringValue(task.failureCode);
      const failure = stringValue(task.failure);
      throw new Error(
        'Runway terminó la tarea con estado ' +
          status +
          '. taskId=' +
          taskId +
          (failureCode ? ' failureCode=' + failureCode : '') +
          (failure ? ' failure=' + failure : '')
      );
    }
  }

  throw new Error(
    'Timeout esperando Runway. taskId=' +
      taskId +
      '. No reintentes automáticamente; consulta la tarea primero.'
  );
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
