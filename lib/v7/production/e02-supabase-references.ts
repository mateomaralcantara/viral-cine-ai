import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const FILM = 'film-dos-toques-de-bocina-v7';
const SCENE = 'E02';
const PROJECT = 'wrxeerltoapvybhaxlmu';
const URL_SUPABASE = `https://${PROJECT}.supabase.co`;

const IDS = Array.from(
  { length: 7 },
  (_, i) => `E02-P${String(i + 1).padStart(2, '0')}`
);

type Env = Record<string, string | undefined>;

type ShotReference = {
  approved: boolean;
  readyForScene: boolean;
  sha256?: string;
  storagePath?: string;
};

export type E02ReferenceBoard = {
  ok: true;
  configured: boolean;
  approvedCount: number;
  requiredCount: 7;
  referencesReady: boolean;
  generationQueueEnabled: boolean;
  shots: Record<string, ShotReference>;
};

type ReferenceRow = {
  shot_id: string;
  approved: boolean;
  active: boolean;
  status: string;
  sha256: string;
  storage_bucket: string;
  storage_path: string;
};

function readEnv(filename: string): Env {
  const values: Env = {};

  try {
    const content = readFileSync(filename, 'utf8');

    for (const line of content.split(/\r?\n/)) {
      const match = line.match(
        /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/
      );

      if (!match) continue;

      let value = match[2].trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      values[match[1]] = value;
    }
  } catch {
    // Archivo opcional.
  }

  return values;
}

function config() {
  const cwd = process.cwd();

  const directories = [
    cwd,
    path.resolve(cwd, '../viral-cine-v7-integration'),
    path.resolve(cwd, '../viral-cine-ai'),
    path.resolve(cwd, '../viral-cine-v7-cinema-core'),
  ];

  const sources: Env[] = [process.env];

  for (const directory of directories) {
    sources.push(readEnv(path.join(directory, '.env.local')));
    sources.push(readEnv(path.join(directory, '.env')));
  }

  for (const env of sources) {
    const url = (
      env.SUPABASE_URL ||
      env.NEXT_PUBLIC_SUPABASE_URL ||
      URL_SUPABASE
    ).replace(/\/$/, '');

    if (url !== URL_SUPABASE) continue;

    const secret = (
      env.SUPABASE_SERVICE_ROLE_KEY ||
      env.SUPABASE_SECRET_KEY ||
      ''
    ).trim();

    if (
      secret.startsWith('eyJ') ||
      secret.startsWith('sb_secret_')
    ) {
      return { url, secret };
    }
  }

  throw new Error(
    'No se encontro la credencial privada de Supabase para ViralCine ' +
    'en los archivos de entorno locales.'
  );
}

async function request(
  pathname: string,
  options: RequestInit = {}
): Promise<Response> {
  const { url, secret } = config();

  const headers: Record<string, string> = {
    apikey: secret,
  };

  if (secret.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${secret}`;
  }

  return fetch(url + pathname, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
}

export async function approvedE02References(): Promise<E02ReferenceBoard> {
  const shots: Record<string, ShotReference> =
    Object.fromEntries(
      IDS.map(id => [
        id,
        { approved: false, readyForScene: false },
      ])
    );

  try {
    config();
  } catch {
    return {
      ok: true,
      configured: false,
      approvedCount: 0,
      requiredCount: 7,
      referencesReady: false,
      generationQueueEnabled: false,
      shots,
    };
  }

  const params = new URLSearchParams({
    select: 'shot_id,approved,active,status,sha256,storage_bucket,storage_path',
    film_id: `eq.${FILM}`,
    scene_id: `eq.${SCENE}`,
    active: 'eq.true',
  });

  const response = await request(
    `/rest/v1/scene_reference_images?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(
      `Supabase rechazo la consulta de fotografias (HTTP ${response.status}).`
    );
  }

  const records = (await response.json()) as ReferenceRow[];

  for (const ref of records) {
    if (!IDS.includes(ref.shot_id)) continue;

    const ready =
      ref.approved === true &&
      ref.active === true &&
      ref.status === 'ready' &&
      ref.storage_bucket === 'viralcine-scene-references';

    shots[ref.shot_id] = {
      approved: ref.approved === true,
      readyForScene: ready,
      sha256: ref.sha256,
      storagePath: ref.storage_path,
    };
  }

  const approvedCount = IDS.filter(
    id => shots[id].readyForScene
  ).length;

  return {
    ok: true,
    configured: true,
    approvedCount,
    requiredCount: 7,
    referencesReady: approvedCount === 7,
    generationQueueEnabled: approvedCount === 7,
    shots,
  };
}

export async function getApprovedE02Image(
  id: string
): Promise<{ bytes: Buffer; hash: string } | null> {
  if (!IDS.includes(id)) {
    throw new Error('Identificador de toma invalido.');
  }

  const board = await approvedE02References();
  const photo = board.shots[id];

  if (
    !photo?.readyForScene ||
    !photo.sha256 ||
    !photo.storagePath
  ) {
    return null;
  }

  const objectPath = photo.storagePath
    .split('/')
    .map(encodeURIComponent)
    .join('/');

  const response = await request(
    `/storage/v1/object/authenticated/viralcine-scene-references/${objectPath}`
  );

  if (!response.ok) {
    throw new Error(
      `${id}: Supabase Storage respondio HTTP ${response.status}.`
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  if (
    bytes.length < 3000 ||
    bytes.length > 4000000 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8
  ) {
    throw new Error(`${id}: la fotografia JPG no es valida.`);
  }

  const hash = createHash('sha256')
    .update(bytes)
    .digest('hex');

  if (hash !== photo.sha256) {
    throw new Error(
      `${id}: la fotografia no coincide con el original aprobado.`
    );
  }

  return { bytes, hash };
}