import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

loadEnvConfig(process.cwd());

const expectedHost = 'wrxeerltoapvybhaxlmu.supabase.co';
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!rawUrl || !secret) {
  throw new Error('Faltan credenciales Supabase');
}

const url = new URL(rawUrl);

if (
  url.protocol !== 'https:' ||
  url.hostname !== expectedHost
) {
  throw new Error('Proyecto Supabase incorrecto');
}

const dataDir = process.env.VIRALCINE_DATA_DIR || '.data';
const dataRoot = path.resolve(process.cwd(), dataDir);
const filmsRoot = path.join(dataRoot, 'v7', 'films');

console.log('=== SHADOW PREFLIGHT ===');
console.log('Proyecto:', expectedHost);
console.log('Escritura remota: DESACTIVADA');

let directories;

try {
  directories = await readdir(filmsRoot, {
    withFileTypes: true
  });
} catch (error) {
  if (error?.code === 'ENOENT') {
    throw new Error(
      'No existe el catalogo local V7 en este worktree. ' +
      'No se asumira que el catalogo esta vacio. ' +
      'Verifica VIRALCINE_DATA_DIR y la ubicacion de .data.'
    );
  }
  throw error;
}

const local = [];
const invalid = [];

for (const entry of directories) {
  if (!entry.isDirectory()) continue;

  const file = path.join(filmsRoot, entry.name, 'bundle.json');

  try {
    const raw = await readFile(file, 'utf8');
    const bundle = JSON.parse(raw);

    if (
      !bundle.film ||
      typeof bundle.film.id !== 'string' ||
      bundle.film.id !== entry.name
    ) {
      invalid.push(entry.name);
      continue;
    }

    local.push({
      id: bundle.film.id,
      title: bundle.film.title,
      updatedAt: bundle.film.updatedAt,
      sha256: createHash('sha256')
        .update(raw)
        .digest('hex')
    });
  } catch {
    invalid.push(entry.name);
  }
}

const remote = [];
const pageSize = 1000;

for (let offset = 0; ; offset += pageSize) {
  const params = new URLSearchParams({
    select: 'id,title,updated_at',
    order: 'id.asc',
    limit: String(pageSize),
    offset: String(offset)
  });

  const response = await fetch(
    `${url.origin}/rest/v1/films?${params}`,
    {
      method: 'GET',
      headers: {
        apikey: secret,
        Accept: 'application/json',
        'User-Agent': 'ViralCine-Backend/7.0'
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(20000)
    }
  );

  if (!response.ok) {
    throw new Error(
      `Lectura remota fallida: HTTP ${response.status}`
    );
  }

  const page = await response.json();

  if (!Array.isArray(page)) {
    throw new Error('Respuesta remota invalida');
  }

  remote.push(...page);

  if (page.length < pageSize) break;
}

const remoteIds = new Set(remote.map(film => film.id));
const localIds = new Set(local.map(film => film.id));

const onlyLocal = local.filter(
  film => !remoteIds.has(film.id)
);

const onlyRemote = remote.filter(
  film => !localIds.has(film.id)
);

const common = local.filter(
  film => remoteIds.has(film.id)
);

console.log('');
console.log('Peliculas locales:', local.length);
console.log('Peliculas Supabase:', remote.length);
console.log('Solo locales:', onlyLocal.length);
console.log('Solo remotas:', onlyRemote.length);
console.log('IDs coincidentes:', common.length);
console.log('Bundles invalidos:', invalid.length);

console.log('');
console.log('SOLO LOCALES:');
for (const film of onlyLocal.slice(0, 20)) {
  console.log('-', film.id);
}

console.log('');
console.log('SOLO REMOTAS:');
for (const film of onlyRemote.slice(0, 20)) {
  console.log('-', film.id);
}

console.log('');
console.log(
  'NOTA: ID coincidente no demuestra integridad del contenido.'
);
console.log(
  'La comparacion de hashes requiere un espejo versionado.'
);

if (invalid.length > 0) {
  console.log('BUNDLES INVALIDOS:', invalid.join(', '));
  process.exitCode = 2;
}

console.log('');
console.log('SHADOW PREFLIGHT FINALIZADO');
console.log('Sin INSERT, UPDATE, UPSERT ni DELETE.');