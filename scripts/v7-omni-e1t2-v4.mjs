import nextEnv from '@next/env';
import { GoogleGenAI } from '@google/genai';
import {
  readFile, writeFile, stat, mkdir
} from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  assertPaidGenerationAllowed
} from '../lib/engine/production-safety.ts';

nextEnv.loadEnvConfig(process.cwd());

const model = 'gemini-omni-1.1-flash';
const filmId = 'v7-film-01db01f78f6c0e5afee6';

const filmRoot = path.resolve(
  '.data', 'v7', 'films', filmId
);

const originalTrial = path.join(
  filmRoot, 'omni-e1t2-first-paid-trial'
);

const input = path.join(
  originalTrial, 'entrada-4s.mp4'
);

const oldMarker = path.join(
  originalTrial, 'SOLICITUD-UNICA-REGISTRADA.json'
);

const trial = path.join(
  filmRoot, 'omni-e1t2-fourth-trial'
);

const marker = path.join(trial, 'SOLICITUD-V4.json');
const output = path.join(trial, 'E1-T2-LIPSYNC-CANDIDATO.mp4');

const prompt = [
  'Edit this existing video, do not create a different scene.',
  'The woman must visibly articulate the Spanish dialogue',
  'already audible in the original clip:',
  '"Hace seis meses yo también tenía una mesa."',
  'Animate her lips, jaw and natural facial movement',
  'so they match the timing of each spoken word.',
  'Keep the same woman, face, hair, clothing, camera,',
  'lighting, framing, setting and original voice.',
  'Preserve the source duration of approximately 3.25 seconds.',
  'No added speech, subtitles, music or extra characters.',
  'Keep everything else the same.'
].join(' ');

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function cleanError(error) {
  return String(error?.message || error)
    .replace(/AIza[A-Za-z0-9_-]+/g, '[KEY_HIDDEN]')
    .replace(/key=[^&\s]+/gi, 'key=[HIDDEN]')
    .slice(0, 1400);
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Falta GEMINI_API_KEY');
  }

  if (process.env.V7_GOOGLE_OMNI_EDIT_MODEL !== model) {
    throw new Error('Modelo incorrecto');
  }

  if (process.env.V7_GOOGLE_OMNI_EDIT_ENABLED !== 'false') {
    throw new Error('El modo global debe permanecer bloqueado');
  }

  if (!(await exists(oldMarker))) {
    throw new Error('Falta registro de primera solicitud');
  }

  // Exigir el registro V2 antes de permitir un tercer intento.
  const previousAttempt = path.join(
    filmRoot,
    'omni-e1t2-third-trial',
    'SOLICITUD-V3.json'
  );

  if (!(await exists(previousAttempt))) {
    throw new Error('Registro del segundo intento ausente');
  }
  if (await exists(marker) || await exists(output)) {
    throw new Error('Segundo intento ya registrado. NO REPETIR.');
  }

  const info = await stat(input);

  if (!info.isFile() || info.size < 10000) {
    throw new Error('MP4 de entrada invalido');
  }

  const hash = createHash('sha256')
    .update(await readFile(input))
    .digest('hex');

  console.log('MODELO=' + model);
  console.log('ENTRADA=' + input);
  console.log('TAMANO=' + info.size);
  console.log('SHA256=' + hash);
  console.log('SALIDA=' + output);
  console.log('SOLICITUDES_PERMITIDAS=1');
  console.log('REINTENTOS_AUTOMATICOS=0');
  console.log('');
  console.log('ATENCION: nueva solicitud pagada.');
  console.log('Estimacion inferior a USD 2, sin tope duro garantizado.');
  console.log('Revisa primero los cargos anteriores en Google AI Studio.');
  console.log('');

  const rl = createInterface({ input: stdin, output: stdout });
  let answer;

  try {
    answer = await rl.question(
      'Escribe AUTORIZO CUARTA PRUEBA para continuar: '
    );
  } finally {
    rl.close();
  }

  if (answer.trim() !== 'AUTORIZO CUARTA PRUEBA') {
    console.log('CANCELADO. Ninguna solicitud enviada.');
    return;
  }

  await mkdir(trial, { recursive: true });

  const record = {
    model,
    source: input,
    sourceSha256: hash,
    status: 'STARTING',
    createdAt: new Date().toISOString(),
    maxAttempts: 1,
    retryAllowed: false,
    interactionId: null
  };

  // Escritura exclusiva: bloquea intentos duplicados.
  await writeFile(
    marker,
    JSON.stringify(record, null, 2),
    { flag: 'wx' }
  );

  const saveRecord = async (status, extra = {}) => {
    record.status = status;
    Object.assign(record, extra);
    await writeFile(marker, JSON.stringify(record, null, 2));
  };

  try {
    // Autorizacion limitada a ESTE proceso Node.
    // No se modifica .env.local.
    process.env.PRODUCTION_MODE = 'real';
    process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
    process.env.ALLOW_PAID_GENERATION = 'true';

    assertPaidGenerationAllowed(
      'una edicion Omni autorizada',
      'GEMINI_API_KEY'
    );

    // Evitar que GOOGLE_API_KEY prevalezca en este proceso.
    // El archivo .env.local no se modifica.
    delete process.env.GOOGLE_API_KEY;

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });

    console.log('SUBIENDO_MP4_A_GOOGLE');

    let file = await ai.files.upload({
      file: input,
      config: { mimeType: 'video/mp4' }
    });

    const deadline = Date.now() + 300000;

    while (String(file.state) === 'PROCESSING') {
      if (Date.now() > deadline) {
        throw new Error('Timeout procesando entrada');
      }

      await new Promise(r => setTimeout(r, 5000));
      file = await ai.files.get({ name: file.name });
    }

    if (!file.uri || String(file.state) === 'FAILED') {
      throw new Error('Google no preparo el MP4');
    }

    await saveRecord('SUBMITTING');

    console.log('ENVIANDO_UNICA_SOLICITUD_DE_EDICION');

    const interaction = await ai.interactions.create({
      model,
      input: [
        { type: 'video', uri: file.uri },
        { type: 'text', text: prompt }
      ],
      generation_config: {
        video_config: { task: 'edit' }
      },
      response_format: {
        type: 'video',
        resolution: '720p',
        aspect_ratio: '16:9',
        delivery: 'uri'
      },
      store: true,
      background: false,
      stream: false
    }, { timeout: 1200000 });

    await saveRecord('RESPONSE_RECEIVED', {
      interactionId: interaction.id || null,
      interactionStatus: interaction.status
    });

    if (interaction.status !== 'completed') {
      throw new Error(
        'Estado pendiente/no completado: ' + interaction.status
      );
    }

    const video = interaction.output_video ||
      (interaction.steps || [])
        .flatMap(s => s.content || [])
        .find(c => c.type === 'video');

    if (!video) {
      throw new Error('Respuesta sin video');
    }

    if (video.data) {
      await writeFile(
        output,
        Buffer.from(video.data, 'base64'),
        { flag: 'wx' }
      );
    } else if (video.uri) {
      const match = video.uri.match(/\/files\/([A-Za-z0-9_-]+)(?::download)?(?:\?|$)/);
      const id = match?.[1];

      if (!/^[A-Za-z0-9_-]+$/.test(id)) {
        throw new Error('URI de salida inesperada');
      }

      const name = 'files/' + id;
      const outputDeadline = Date.now() + 480000;

      while (true) {
        if (Date.now() > outputDeadline) {
          throw new Error('Timeout al recuperar resultado');
        }

        const info = await ai.files.get({ name });
        const state = String(info.state?.name || info.state);

        if (state === 'ACTIVE') break;
        if (state === 'FAILED') {
          throw new Error('Procesamiento de salida fallido');
        }

        await new Promise(r => setTimeout(r, 5000));
      }

      await ai.files.download({
        file: video,
        downloadPath: output
      });
    } else {
      throw new Error('Salida sin datos ni URI');
    }

    const result = await stat(output);

    if (result.size < 10000) {
      throw new Error('Resultado demasiado pequeno');
    }

    await saveRecord('CANDIDATE_SAVED_NOT_QA', {
      output,
      bytes: result.size
    });

    console.log('VIDEO_CANDIDATO=' + output);
    console.log('QA_PENDIENTE=SI');
    console.log('V6_MODIFICADO=NO');
  } catch (error) {
    const message = cleanError(error);

    await saveRecord('FAILED_OR_UNCERTAIN', {
      lastError: message,
      httpStatus: error?.status || null
    });

    console.error('GOOGLE_ERROR=' + message);
    console.error('NO_REPETIR: revisar el registro y facturacion.');
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('ERROR_LOCAL=' + cleanError(error));
  process.exitCode = 1;
});