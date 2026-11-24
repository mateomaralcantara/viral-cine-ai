import nextEnv from '@next/env';
import {
  readFile, writeFile, mkdir, stat
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  generateWanImageVideo
} from '../lib/providers/wan.ts';

nextEnv.loadEnvConfig(process.cwd());

const action = process.argv[2];
const packageDir = path.resolve(process.argv[3] || '');

const model = 'wan2.6-i2v-flash';
const filmId = 'v7-film-01db01f78f6c0e5afee6';

const filmRoot = path.resolve(
  '.data', 'v7', 'films', filmId
);

const reference = path.join(
  packageDir, 'referencias', 'LS01-referencia.jpg'
);

const manifestFile = path.join(
  packageDir, 'PRODUCCION-50S.json'
);

const outputDir = path.join(
  packageDir, 'generados'
);

const output = path.join(
  outputDir, 'LS01-WAN26-7S-CANDIDATO.mp4'
);

const marker = path.join(
  outputDir, 'LS01-SOLICITUD-UNICA.json'
);

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function hideSecrets(error) {
  return String(error?.message || error)
    .replace(/Bearer\s+\S+/gi, 'Bearer [OCULTO]')
    .replace(/AIza[A-Za-z0-9_-]+/g, '[OCULTO]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[OCULTO]')
    .slice(0, 1200);
}

async function validate() {
  const branch = execFileSync(
    'git', ['branch', '--show-current'],
    { encoding: 'utf8' }
  ).trim();

  if (branch !== 'feat/v7-integrated') {
    throw new Error('Rama incorrecta');
  }

  if (!packageDir.startsWith(
    filmRoot + path.sep
  )) {
    throw new Error('Paquete fuera de V7');
  }

  const manifest = JSON.parse(
    await readFile(manifestFile, 'utf8')
  );

  const shot = manifest.shots.find(
    s => s.id === 'LS01'
  );

  if (
    manifest.filmId !== filmId ||
    manifest.durationSeconds !== 50 ||
    !shot ||
    Number(shot.seconds) !== 7
  ) {
    throw new Error('Orden de produccion incorrecta');
  }

  if (!process.env.DASHSCOPE_API_KEY ||
      process.env.DASHSCOPE_API_KEY.length < 12) {
    throw new Error(
      'Falta DASHSCOPE_API_KEY en .env.local. Sin solicitud.'
    );
  }

  if (
    process.env.WAN_VIDEO_MODEL &&
    process.env.WAN_VIDEO_MODEL !== model
  ) {
    throw new Error(
      'Modelo Wan configurado distinto. Sin solicitud.'
    );
  }

  const base = (
    process.env.DASHSCOPE_BASE_URL ||
    'https://dashscope-intl.aliyuncs.com/api/v1'
  ).replace(/\/$/, '');

  const internationalEndpoint =
    /^https:\/\/dashscope-intl\.aliyuncs\.com\/api\/v1$/i
      .test(base) ||
    /^https:\/\/[a-z0-9-]+\.ap-southeast-1\.maas\.aliyuncs\.com\/api\/v1$/i
      .test(base);

  if (!internationalEndpoint) {
    throw new Error(
      'Region de Wan distinta de Singapur/internacional. ' +
      'No se puede aplicar esta estimacion.'
    );
  }

  const image = await stat(reference);

  if (!image.isFile() || image.size < 10000) {
    throw new Error('Referencia visual invalida');
  }

  if (await exists(marker) || await exists(output)) {
    throw new Error(
      'LS01 ya tiene intento o resultado. NO REPETIR.'
    );
  }

  return shot;
}

async function main() {
  const shot = await validate();

  console.log('PREFLIGHT_LS01=OK');
  console.log('TOMA=LS01');
  console.log('PERSONAJES=Mariana y Elena');
  console.log('MODELO=' + model);
  console.log('DURACION=7');
  console.log('RESOLUCION=720p');
  console.log('AUDIO_GENERADO=NO');
  console.log('ESTIMACION_USD=0.175');
  console.log('REFERENCIA=' + reference);
  console.log('SOLICITUD_PREVIA=NO');

  if (action === 'preflight') {
    console.log('API_CALLS=0');
    return;
  }

  if (action !== 'generate' ||
      process.env.VC_LS01_APPROVAL !== 'AUTORIZO_LS01') {
    throw new Error(
      'Generacion bloqueada sin autorizacion explicita'
    );
  }

  await mkdir(outputDir, { recursive: true });

  const hash = createHash('sha256')
    .update(await readFile(reference))
    .digest('hex');

  const record = {
    shot: 'LS01',
    filmId,
    model,
    seconds: 7,
    estimateUsd: 0.175,
    referenceSha256: hash,
    status: 'REQUEST_MAY_HAVE_BEEN_SENT',
    createdAt: new Date().toISOString(),
    retriesAllowed: false,
    output
  };

  await writeFile(
    marker,
    JSON.stringify(record, null, 2),
    { flag: 'wx' }
  );

  const save = async (status, extra = {}) => {
    Object.assign(record, extra, { status });
    await writeFile(
      marker,
      JSON.stringify(record, null, 2)
    );
  };

  const prompt = [
    'Seven-second cinematic dramatic scene.',
    'Use the reference image as the exact first frame.',
    'Maintain the exact identities, faces and appearance',
    'of the people shown in the reference.',
    'Mariana notices the handwritten manuscript of Elena.',
    'Mariana slowly looks down at the notebook,',
    'then shows genuine interest and sits beside Elena.',
    'Elena keeps one hand resting on the manuscript.',
    'Natural restrained movements, realistic physics,',
    'subtle breathing, organic camera push-in.',
    'Contemporary intimate cinema, natural lighting.',
    'No visible spoken dialogue or mouth articulation.',
    'No extra characters, no identity changes,',
    'no face morphing, no subtitle or text overlay.',
    'Single continuous take, 16:9, no cuts.',
    shot.prompt
  ].join(' ');

  try {
    // Permisos limitados a este proceso.
    process.env.PRODUCTION_MODE = 'real';
    process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
    process.env.ALLOW_PAID_GENERATION = 'true';
    process.env.WAN_VIDEO_MODEL = model;

    console.log('ENVIANDO_UNA_SOLICITUD_WAN');

    await generateWanImageVideo(
      reference,
      prompt,
      output,
      7
    );

    const video = await stat(output);

    if (video.size < 10000) {
      throw new Error('El video recibido es invalido');
    }

    await save('CANDIDATE_SAVED_NOT_APPROVED', {
      outputBytes: video.size
    });

    console.log('VIDEO_LS01=' + output);
    console.log('QA_PENDIENTE=SI');
    console.log('MASTER_FINAL=NO');
  } catch (error) {
    const message = hideSecrets(error);

    await save('FAILED_OR_BILLING_UNCERTAIN', {
      error: message
    });

    console.error('ERROR_LS01=' + message);
    console.error('NO_REPETIR_LA_GENERACION');
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('ERROR_LOCAL=' + hideSecrets(error));
  process.exitCode = 1;
});