import { createHash } from 'node:crypto';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { FilmProject } from '@/lib/domain/schemas';
import {
  assetAbsolutePath,
  assetRelativePath,
  projectAssetDir,
  saveProject
} from '@/lib/storage/project-store';
import {
  appendSpend,
  assertSpendRetrySafe,
  estimateOperationCost
} from '@/lib/engine/spend-ledger';
import {
  assertPaidGenerationAllowed,
  hasUsableCredential,
  safeErrorMessage
} from '@/lib/engine/production-safety';
import { generateFalMusic } from '@/lib/providers/fal-media';

export type ProjectMusicInspection = {
  enabled: boolean;
  ready: boolean;
  prompt: string;
  durationSeconds: number;
  asset?: string;
  path?: string;
  fingerprint: string;
  estimatedUsd: number;
  blocker?: string;
};

export async function inspectProjectMusic(
  project: FilmProject
): Promise<ProjectMusicInspection> {
  if (!project.input.generateMusic) {
    return {
      enabled: false,
      ready: false,
      prompt: '',
      durationSeconds: 0,
      fingerprint: 'disabled',
      estimatedUsd: 0
    };
  }

  const prompt = resolveMusicPrompt(project);
  const durationSeconds = soundtrackDurationSeconds(project);
  const fingerprint = createHash('sha256')
    .update(prompt + '\0' + durationSeconds)
    .digest('hex')
    .slice(0, 12);
  const musicPath = path.join(
    projectAssetDir(project.id, 'audio'),
    'music-v4',
    'soundtrack-' + fingerprint + '.mp3'
  );
  const ready = await fileExists(musicPath);

  return {
    enabled: true,
    ready,
    prompt,
    durationSeconds,
    asset: assetRelativePath(project.id, musicPath),
    path: musicPath,
    fingerprint,
    estimatedUsd: ready ? 0 : estimateOperationCost('music', durationSeconds),
    blocker: ready || hasUsableCredential('FAL_KEY')
      ? undefined
      : 'Falta FAL_KEY para generar la música de fondo.'
  };
}

export async function ensureProjectMusicReal(
  project: FilmProject
): Promise<ProjectMusicInspection> {
  const before = await inspectProjectMusic(project);
  if (!before.enabled) return before;

  if (before.ready && before.asset) {
    if (project.musicAsset !== before.asset) {
      project.musicAsset = before.asset;
      await saveProject(project);
    }
    return before;
  }

  if (!before.path || !before.asset) {
    throw new Error('No se pudo resolver la ruta de música del proyecto.');
  }
  if (before.blocker) throw new Error(before.blocker);

  assertPaidGenerationAllowed('generar música de fondo con Fal.ai', 'FAL_KEY');
  await mkdir(path.dirname(before.path), { recursive: true });

  const idempotencyKey = 'project-music:' + before.fingerprint + ':v1';
  await assertSpendRetrySafe(project.id, idempotencyKey, 'música de fondo del proyecto');

  await appendSpend(project.id, {
    operation: 'music',
    provider: 'fal',
    model: process.env.FAL_MUSIC_MODEL || 'cassetteai/music-generator',
    state: 'submitted',
    estimatedUsd: before.estimatedUsd,
    idempotencyKey
  });

  try {
    await generateFalMusic(before.prompt, before.durationSeconds, before.path);
    await appendSpend(project.id, {
      operation: 'music',
      provider: 'fal',
      model: process.env.FAL_MUSIC_MODEL || 'cassetteai/music-generator',
      state: 'succeeded',
      estimatedUsd: before.estimatedUsd,
      idempotencyKey,
      outputAsset: before.asset
    });
  } catch (error) {
    await appendSpend(project.id, {
      operation: 'music',
      provider: 'fal',
      model: process.env.FAL_MUSIC_MODEL || 'cassetteai/music-generator',
      state: 'failed-unknown',
      estimatedUsd: before.estimatedUsd,
      idempotencyKey,
      error: safeErrorMessage(error)
    });
    throw error;
  }

  project.musicAsset = before.asset;
  project.productionLog.push(
    new Date().toISOString() +
    ' Banda sonora instrumental 4.1 generada y cacheada: ' + before.asset
  );
  await saveProject(project);

  return inspectProjectMusic(project);
}

export function shotTimelineOffsetSeconds(
  project: FilmProject,
  sceneId: string,
  shotId: string
) {
  if (!project.plan) return 0;
  let cursor = 0;
  const scenes = [...project.plan.scenes].sort((a, b) => a.order - b.order);
  for (const scene of scenes) {
    const shots = [...scene.shots].sort((a, b) => a.order - b.order);
    for (const shot of shots) {
      if (scene.id === sceneId && shot.id === shotId) return cursor;
      cursor += shot.durationSeconds;
    }
  }
  return 0;
}

function resolveMusicPrompt(project: FilmProject) {
  const explicit = project.plan?.musicPrompt?.trim();
  if (explicit) {
    return explicit +
      ' Instrumental cinematic underscore only. No vocals, no spoken words, no lyrics. ' +
      'Support dialogue and narration without overpowering them.';
  }

  return [
    'Cinematic instrumental underscore for',
    project.input.genre,
    'film.',
    project.plan?.creativeDirection || project.input.visualStyle,
    'Emotionally restrained, coherent, no vocals, no spoken words, no lyrics, suitable under dialogue.'
  ].filter(Boolean).join(' ');
}

function soundtrackDurationSeconds(project: FilmProject) {
  const target = Math.round(project.input.durationMinutes * 60);
  return Math.min(180, Math.max(30, target));
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
