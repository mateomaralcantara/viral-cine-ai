import { access, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import { assetAbsolutePath } from '@/lib/storage/project-store';
import { createPlaceholderImage } from '@/lib/media/ffmpeg';

export type ImageReferenceFallbackResult = {
  mode: 'continuity-copy' | 'character-copy' | 'local-placeholder';
  sourcePath?: string;
};

export function isImageProviderFallbackEligible(error: unknown) {
  const candidate = error as {
    status?: number;
    code?: string;
    name?: string;
    message?: string;
    error?: {
      code?: string;
      type?: string;
      message?: string;
      moderation_details?: unknown;
    };
  };

  const status = Number(candidate?.status || 0);
  const code = String(candidate?.code || candidate?.error?.code || '').toLowerCase();
  const type = String(candidate?.error?.type || '').toLowerCase();
  const message = String(
    candidate?.message || candidate?.error?.message || ''
  ).toLowerCase();

  if (
    code === 'moderation_blocked' ||
    code === 'content_policy_violation' ||
    type.includes('image_generation_user_error') ||
    message.includes('safety system') ||
    message.includes('safety_violations') ||
    message.includes('content policy')
  ) {
    return true;
  }

  if (status === 429 || status >= 500) return true;
  if (
    candidate?.name === 'AbortError' ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('temporarily unavailable')
  ) {
    return true;
  }

  return false;
}

export async function createImageReferenceFallback(input: {
  project: FilmProject;
  scene: FilmScene;
  shot: FilmShot;
  destinationPath: string;
  preferredPaths?: string[];
}) : Promise<ImageReferenceFallbackResult> {
  const { project, scene, shot, destinationPath } = input;
  await mkdir(path.dirname(destinationPath), { recursive: true });

  const preferred = (input.preferredPaths || []).filter(Boolean);
  for (const sourcePath of preferred) {
    if (
      sourcePath !== destinationPath &&
      await fileExists(sourcePath)
    ) {
      await copyFile(sourcePath, destinationPath);
      return { mode: 'continuity-copy', sourcePath };
    }
  }

  for (const sourcePath of storyContinuityCandidates(project, scene, shot)) {
    if (
      sourcePath !== destinationPath &&
      await fileExists(sourcePath)
    ) {
      await copyFile(sourcePath, destinationPath);
      return { mode: 'continuity-copy', sourcePath };
    }
  }

  for (const characterId of shot.characterIds || []) {
    const character = project.plan?.characters.find((item) => item.id === characterId);
    if (!character?.referenceAsset) continue;
    const sourcePath = assetAbsolutePath(project.id, character.referenceAsset);
    if (await fileExists(sourcePath)) {
      await copyFile(sourcePath, destinationPath);
      return { mode: 'character-copy', sourcePath };
    }
  }

  await createPlaceholderImage(
    scene.title + ' · ' + shot.title,
    'Referencia visual local de continuidad. ' +
    'Escena histórica sobria; composición neutra y segura para completar la producción.',
    destinationPath,
    project.input
  );
  return { mode: 'local-placeholder' };
}

function storyContinuityCandidates(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot
) {
  const candidates: string[] = [];
  const rows = (project.plan?.scenes || [])
    .flatMap((candidateScene) =>
      candidateScene.shots.map((candidateShot) => ({
        scene: candidateScene,
        shot: candidateShot
      }))
    )
    .filter(({ scene: candidateScene, shot: candidateShot }) => {
      if (candidateShot.id === shot.id) return false;
      if (candidateScene.order > scene.order) return false;
      if (candidateScene.order === scene.order && candidateShot.order >= shot.order) return false;
      return Boolean(candidateShot.imageAsset);
    })
    .sort((a, b) =>
      b.scene.order - a.scene.order ||
      b.shot.order - a.shot.order
    );

  for (const row of rows) {
    if (!row.shot.imageAsset) continue;
    candidates.push(assetAbsolutePath(project.id, row.shot.imageAsset));
  }

  return candidates;
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
