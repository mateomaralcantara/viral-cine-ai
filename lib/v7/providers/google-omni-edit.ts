import { GoogleGenAI } from '@google/genai';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertPaidGenerationAllowed } from '@/lib/engine/production-safety';

export type OmniEditRequest = {
  inputVideo: string;
  outputVideo: string;
  prompt: string;
};

export async function editVideoWithGeminiOmni(request: OmniEditRequest) {
  if (process.env.V7_GOOGLE_OMNI_EDIT_ENABLED !== 'true') {
    throw new Error('Edicion Omni V7 desactivada. Requiere autorizacion.');
  }

  assertPaidGenerationAllowed(
    'editar video con Google Gemini Omni',
    'GEMINI_API_KEY'
  );

  const source = path.resolve(request.inputVideo);
  const output = path.resolve(request.outputVideo);
  const safeRoot = path.resolve(process.cwd(), '.data', 'v7');

  if (!output.startsWith(safeRoot + path.sep)) {
    throw new Error('El resultado debe guardarse dentro de .data/v7.');
  }

  if (source === output) {
    throw new Error('No se permite sobrescribir el video original.');
  }

  if (!request.prompt.trim()) {
    throw new Error('Falta el prompt de edicion.');
  }

  const sourceInfo = await stat(source);

  if (!sourceInfo.isFile()) {
    throw new Error('La entrada no es un archivo.');
  }

  try {
    await stat(output);
    throw new Error('El archivo de salida ya existe.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
  });

  let videoFile = await ai.files.upload({ file: source });

  const deadline = Date.now() + 5 * 60_000;

  while (String(videoFile.state) === 'PROCESSING') {
    if (Date.now() > deadline) {
      throw new Error('Tiempo agotado procesando el video.');
    }

    await new Promise(resolve => setTimeout(resolve, 5000));

    videoFile = await ai.files.get({
      name: videoFile.name!
    });
  }

  if (String(videoFile.state) === 'FAILED' || !videoFile.uri) {
    throw new Error('Google no pudo preparar el video.');
  }

  const interaction = await ai.interactions.create({
    model: process.env.V7_GOOGLE_OMNI_EDIT_MODEL ||
      'gemini-omni-1.1-flash',
    input: [
      { type: 'video', uri: videoFile.uri },
      { type: 'text', text: request.prompt }
    ],
    response_format: {
      type: 'video',
      delivery: 'uri'
    },
    store: false,
    stream: false
  }, { timeout: 20 * 60_000 });

  if (interaction.status !== 'completed') {
    throw new Error(
      'Google devolvio estado: ' + interaction.status
    );
  }

  const generated = interaction.output_video;

  if (!generated) {
    throw new Error('Google no devolvio video.');
  }

  await mkdir(path.dirname(output), { recursive: true });

  if (generated.data) {
    await writeFile(
      output,
      Buffer.from(generated.data, 'base64'),
      { flag: 'wx' }
    );
  } else if (generated.uri) {
    await ai.files.download({
      file: generated,
      downloadPath: output
    });
  } else {
    throw new Error('Respuesta sin archivo de video.');
  }

  return output;
}