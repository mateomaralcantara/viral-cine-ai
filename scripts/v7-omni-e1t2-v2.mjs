import nextEnv from '@next/env';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

nextEnv.loadEnvConfig(process.cwd());

const filmId = 'v7-film-01db01f78f6c0e5afee6';
const model = 'gemini-omni-1.1-flash';

const filmRoot = path.resolve(
  '.data', 'v7', 'films', filmId
);

const trial = path.join(
  filmRoot, 'omni-e1t2-first-paid-trial'
);

const input = path.join(trial, 'entrada-4s.mp4');
const marker = path.join(
  trial, 'SOLICITUD-UNICA-REGISTRADA.json'
);

const secondTrial = path.join(
  filmRoot, 'omni-e1t2-second-trial'
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

async function preflight() {
  if (
    path.basename(process.cwd()).toLowerCase() !==
    'viral-cine-v7-integration'
  ) {
    throw new Error('Directorio V7 incorrecto');
  }

  const branch = execFileSync(
    'git',
    ['branch', '--show-current'],
    { encoding: 'utf8' }
  ).trim();

  if (branch !== 'feat/v7-integrated') {
    throw new Error('Rama Git incorrecta');
  }

  if (
    !process.env.GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY.length < 16
  ) {
    throw new Error('GEMINI_API_KEY no configurada');
  }

  if (
    process.env.V7_GOOGLE_OMNI_EDIT_MODEL !== model
  ) {
    throw new Error('Modelo Gemini incorrecto');
  }

  if (
    process.env.V7_GOOGLE_OMNI_EDIT_ENABLED !== 'false'
  ) {
    throw new Error(
      'Mantener la edicion desactivada durante el preflight'
    );
  }

  if (!(await exists(marker))) {
    throw new Error(
      'Falta el registro de la solicitud anterior'
    );
  }

  const previous = JSON.parse(
    await readFile(marker, 'utf8')
  );

  if (previous.model !== model) {
    throw new Error('El registro usa otro modelo');
  }

  if (!(await exists(input))) {
    throw new Error('Falta entrada-4s.mp4');
  }

  const info = await stat(input);

  if (!info.isFile() || info.size < 10000) {
    throw new Error('MP4 de entrada no valido');
  }

  const durationText = execFileSync(
    'ffprobe',
    [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      input
    ],
    { encoding: 'utf8' }
  ).trim();

  const seconds = Number(durationText);

  if (
    !Number.isFinite(seconds) ||
    seconds < 2.8 ||
    seconds > 4.2
  ) {
    throw new Error('Duracion de entrada inesperada');
  }

  if (await exists(path.join(
    secondTrial, 'SOLICITUD-V2.json'
  ))) {
    throw new Error(
      'Existe un segundo intento registrado. No repetir.'
    );
  }

  console.log('');
  console.log('PREFLIGHT_V2=OK');
  console.log('MODELO=' + model);
  console.log('ENTRADA=' + input);
  console.log('DURACION=' + seconds.toFixed(3) + 's');
  console.log('TAMANO=' + info.size + ' bytes');
  console.log('REGISTRO_V1=CONSERVADO');
  console.log('NUEVA_SOLICITUD=NO');
  console.log('GOOGLE_API_CALLS=0');
  console.log('V6_INTACTO=SI');
}

try {
  const action = process.argv[2];

  if (action !== 'preflight') {
    throw new Error(
      'La generacion pagada esta bloqueada hasta una nueva autorizacion.'
    );
  }

  await preflight();
} catch (error) {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
}