import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import {
  assetAbsolutePath,
  assetRelativePath,
  getProject,
  projectAssetDir
} from '@/lib/storage/project-store';
import {
  generateRunwayGrokLiteFromEnvironment,
  grokLiteImageToVideoCredits,
  imageFileToDataUri
} from '@/lib/providers/runway-router-v6';
import {
  appendSpend,
  latestSpendForKey
} from '@/lib/engine/spend-ledger';
import {
  createSilenceAudio,
  normalizeGeneratedVideo,
  normalizeReferenceImage
} from '@/lib/media/ffmpeg';
import {
  assertCinematicSceneVideo
} from '@/lib/media/probe';
import {
  SCENE6_SOFIA_ID_V6
} from '@/lib/engine/scene6-closing-plan-v6';
import {
  buildScene6BRepairShotsV6
} from '@/lib/engine/scene6b-repair-spec-v6';

const MODEL = 'grok_imagine_1_5_lite' as const;
const RATIO = 'auto_720p' as const;
const MAX_CREDITS = 13;
const MAX_USD = 0.13;
const SPEND_KEY = 'v6safe:e6b:t1:grok-lite:1';

export type Scene6BT1ReviewResultV6 = {
  projectId: string;
  video: string;
  credits: number;
  usd: number;
};

export async function produceScene6BT1ReviewV6(
  projectId: string
): Promise<Scene6BT1ReviewResultV6> {
  delete process.env.FAL_KEY;
  process.env.ALLOW_PAID_PROVIDER_FALLBACK = 'false';

  const project = await getProject(projectId);
  assertProjectReady(project);

  const scene6 = sceneByOrder(project, 6);
  const shot = buildScene6BRepairShotsV6(scene6.id)[0];

  if (
    shot.characterIds.length !== 1 ||
    shot.characterIds[0] !== SCENE6_SOFIA_ID_V6 ||
    shot.spokenText
  ) {
    throw new Error(
      'E6B/T1 debe contener únicamente a Sofía y ser silenciosa.'
    );
  }

  const sofiaRef = await characterReference(
    project,
    SCENE6_SOFIA_ID_V6,
    'sofia-main'
  );

  const dirs = {
    images: path.join(
      projectAssetDir(project.id, 'images'),
      'scene6b-repair-v6'
    ),
    audio: path.join(
      projectAssetDir(project.id, 'audio'),
      'scene6b-repair-v6'
    ),
    video: path.join(
      projectAssetDir(project.id, 'video'),
      'scene6b-repair-v6'
    )
  };
  await Promise.all([
    mkdir(dirs.images, { recursive: true }),
    mkdir(dirs.audio, { recursive: true }),
    mkdir(dirs.video, { recursive: true })
  ]);

  const sofiaSafeRef = path.join(
    dirs.images,
    'sofia-identity-grok-safe-9x16.png'
  );
  if (!(await exists(sofiaSafeRef))) {
    await normalizeReferenceImage(
      sofiaRef,
      sofiaSafeRef,
      '9:16'
    );
  }

  const silence4 = path.join(
    dirs.audio,
    'silence-4s.mp3'
  );
  if (!(await exists(silence4))) {
    await createSilenceAudio(4, silence4);
  }

  const raw = path.join(
    dirs.video,
    'scene-006b-shot-01-grok-lite-raw.mp4'
  );
  const final = path.join(
    dirs.video,
    'scene-006b-shot-01.mp4'
  );

  const credits = grokLiteImageToVideoCredits(
    4,
    RATIO
  );
  if (credits !== MAX_CREDITS) {
    throw new Error(
      'SAFE COST GATE E6B/T1: esperado 13 créditos, actual=' +
        credits +
        '.'
    );
  }

  if (!(await exists(raw))) {
    await assertRetrySafe(project.id);

    await appendSpend(project.id, {
      operation: 'video',
      provider: 'runway-direct',
      model: MODEL,
      state: 'submitted',
      estimatedUsd: MAX_USD,
      sceneId: scene6.id,
      shotId: shot.id,
      characterId: SCENE6_SOFIA_ID_V6,
      idempotencyKey: SPEND_KEY
    });

    try {
      const generated = await withPaidGate(
        async () =>
          generateRunwayGrokLiteFromEnvironment(
            {
              model: MODEL,
              promptImage:
                await imageFileToDataUri(sofiaSafeRef),
              promptText: buildSofiaOnlyPrompt(shot),
              ratio: RATIO,
              duration: 4
            },
            raw
          )
      );

      if (generated.credits !== MAX_CREDITS) {
        throw new Error(
          'Runway devolvió ' +
            generated.credits +
            ' créditos; esperábamos 13.'
        );
      }

      await appendSpend(project.id, {
        operation: 'video',
        provider: 'runway-direct',
        model: generated.model,
        state: 'succeeded',
        estimatedUsd: MAX_USD,
        actualUsd: MAX_USD,
        sceneId: scene6.id,
        shotId: shot.id,
        characterId: SCENE6_SOFIA_ID_V6,
        idempotencyKey: SPEND_KEY,
        providerRequestId: generated.taskId,
        outputAsset:
          assetRelativePath(project.id, raw)
      });
    } catch (error) {
      await recordFailure(
        project.id,
        scene6,
        shot,
        error
      );
      throw error;
    }
  }

  await normalizeGeneratedVideo(
    raw,
    silence4,
    4,
    final,
    project.input.aspectRatio
  );
  await assertCinematicSceneVideo(
    final,
    4,
    { requireMotion: true }
  );

  return {
    projectId: project.id,
    video: final,
    credits: MAX_CREDITS,
    usd: MAX_USD
  };
}

async function assertRetrySafe(
  projectId: string
) {
  const previous =
    await latestSpendForKey(projectId, SPEND_KEY);

  if (!previous) return;

  if (
    previous.state === 'failed-no-charge' &&
    (previous.actualUsd ?? 0) === 0 &&
    !previous.providerRequestId
  ) {
    return;
  }

  throw new Error(
    'SAFE RETRY BLOCK E6B/T1: estado previo=' +
      previous.state +
      ', actualUsd=' +
      String(previous.actualUsd ?? '') +
      ', providerRequestId=' +
      String(previous.providerRequestId ?? '') +
      '.'
  );
}

async function recordFailure(
  projectId: string,
  scene: FilmScene,
  shot: FilmShot,
  error: unknown
) {
  const message = errorText(error);
  const taskId =
    message.match(/taskId=([0-9a-f-]{36})/i)?.[1];
  const rejectedBeforeTask =
    !taskId &&
    /Runway HTTP 400/i.test(message) &&
    /Validation of body failed/i.test(message);

  await appendSpend(projectId, {
    operation: 'video',
    provider: 'runway-direct',
    model: MODEL,
    state: rejectedBeforeTask
      ? 'failed-no-charge'
      : 'failed-unknown',
    estimatedUsd: MAX_USD,
    actualUsd:
      rejectedBeforeTask ? 0 : undefined,
    sceneId: scene.id,
    shotId: shot.id,
    characterId: SCENE6_SOFIA_ID_V6,
    idempotencyKey: SPEND_KEY,
    providerRequestId: taskId,
    error:
      (rejectedBeforeTask
        ? '[runway-request-rejected-no-task] '
        : '') +
      message
  });
}

function buildSofiaOnlyPrompt(
  shot: FilmShot
) {
  return [
    shot.visualPrompt,
    'IDENTITY LOCK ABSOLUTO.',
    'La única persona visible es Sofía, niña latina de 10 años de la imagen de referencia.',
    'No aparece Elena, Mateo, adulto, otra niña, doble, reflejo humano ni persona de fondo.',
    'Sofía conserva exactamente rostro infantil, edad, cabello, piel y proporciones.',
    'Prohibido envejecimiento, cambio de género, morphing facial, cambio de cuerpo o transformación en la madre.',
    'Boca cerrada. Nadie habla.',
    'Una sola acción: Sofía entra un paso, toca suavemente la pared y mira fuera de cámara hacia su madre.',
    'Cámara: ' + shot.camera,
    'Sin texto, subtítulos, logos ni marcas de agua.'
  ].join(' ').slice(0, 1900);
}

async function characterReference(
  project: FilmProject,
  characterId: string,
  stateId: string
) {
  const character =
    project.plan?.characters.find(
      (item) => item.id === characterId
    );
  const bible =
    project.plan?.realMotion?.characterBible.find(
      (item) => item.characterId === characterId
    );
  const state = bible?.states.find(
    (item) => item.id === stateId
  );

  const candidates = [
    state?.referenceAsset,
    bible?.bodyReferenceAsset,
    bible?.masterReferenceAsset,
    character?.referenceAsset
  ].filter((value): value is string => Boolean(value));

  for (const asset of candidates) {
    const full = assetAbsolutePath(project.id, asset);
    if (await exists(full)) return full;
  }

  throw new Error(
    'No existe referencia visual utilizable para Sofía.'
  );
}

function assertProjectReady(project: FilmProject) {
  if (
    project.input.title.trim().toLocaleUpperCase() !==
    '15 DÍAS'
  ) {
    throw new Error(
      'Este productor solo está autorizado para 15 DÍAS.'
    );
  }

  if (
    process.env.ALLOW_EXTERNAL_API_CALLS === 'true' ||
    process.env.ALLOW_PAID_GENERATION === 'true' ||
    process.env.ALLOW_PAID_PROVIDER_FALLBACK === 'true'
  ) {
    throw new Error(
      'Las APIs generales deben iniciar bloqueadas.'
    );
  }
}

async function withPaidGate<T>(
  run: () => Promise<T>
) {
  const oldExternal =
    process.env.ALLOW_EXTERNAL_API_CALLS;
  const oldPaid =
    process.env.ALLOW_PAID_GENERATION;
  const oldFallback =
    process.env.ALLOW_PAID_PROVIDER_FALLBACK;
  const oldProduction =
    process.env.PRODUCTION_MODE;

  process.env.ALLOW_EXTERNAL_API_CALLS = 'true';
  process.env.ALLOW_PAID_GENERATION = 'true';
  process.env.ALLOW_PAID_PROVIDER_FALLBACK = 'false';
  process.env.PRODUCTION_MODE = 'real';

  try {
    return await run();
  } finally {
    restoreEnv(
      'ALLOW_EXTERNAL_API_CALLS',
      oldExternal
    );
    restoreEnv(
      'ALLOW_PAID_GENERATION',
      oldPaid
    );
    restoreEnv(
      'ALLOW_PAID_PROVIDER_FALLBACK',
      oldFallback
    );
    restoreEnv(
      'PRODUCTION_MODE',
      oldProduction
    );
  }
}

function sceneByOrder(
  project: FilmProject,
  order: number
) {
  const scene = project.plan?.scenes.find(
    (item) => item.order === order
  );
  if (!scene) {
    throw new Error(
      'No existe Escena ' + order + '.'
    );
  }
  return scene;
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function restoreEnv(
  name: string,
  value: string | undefined
) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : String(error);
}
