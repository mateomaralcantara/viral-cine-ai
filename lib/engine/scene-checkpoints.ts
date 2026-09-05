import { randomUUID } from 'node:crypto';
import { readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FilmProject, FilmScene, FilmShot, SceneMode, ShotMode } from '@/lib/domain/schemas';
import { assertCinematicSceneVideo, assertPlayableSceneVideo, type SceneVideoValidationOptions } from '@/lib/media/probe';
import { assetAbsolutePath, assetRelativePath, projectAssetDir } from '@/lib/storage/project-store';

export type SceneAssets = {
  mode: SceneMode | ShotMode;
  imageAsset: string;
  voiceAsset: string;
  videoAsset: string;
};

type SceneCheckpoint = {
  version: 2;
  productionMode: 'real' | 'demo';
  projectId: string;
  sceneId: string;
  order: number;
  completedAt: string;
  assets: SceneAssets;
  video: {
    bytes: number;
    durationSeconds: number;
  };
};

type ShotCheckpoint = {
  version: 2;
  productionMode: 'real' | 'demo';
  provider?: string;
  projectId: string;
  sceneId: string;
  shotId: string;
  sceneOrder: number;
  shotOrder: number;
  completedAt: string;
  assets: SceneAssets;
  video: {
    bytes: number;
    durationSeconds: number;
  };
};

export function sceneCheckpointPath(projectId: string, order: number) {
  return path.join(projectAssetDir(projectId, 'checkpoints'), `scene-${pad(order)}.json`);
}

export function shotCheckpointPath(projectId: string, sceneOrder: number, shotOrder: number) {
  return path.join(projectAssetDir(projectId, 'checkpoints'), `scene-${pad(sceneOrder)}-shot-${padShot(shotOrder)}.json`);
}

export function temporarySceneVideoPath(finalPath: string) {
  const extension = path.extname(finalPath) || '.mp4';
  const base = finalPath.slice(0, -extension.length);
  return `${base}.partial-${randomUUID()}${extension}`;
}

export async function publishSceneVideo(
  temporaryPath: string,
  finalPath: string,
  expectedSeconds: number,
  options: SceneVideoValidationOptions = {}
) {
  await assertCinematicSceneVideo(temporaryPath, expectedSeconds, options);
  await rm(finalPath, { force: true });
  await rename(temporaryPath, finalPath);
  return finalPath;
}

export async function saveSceneCheckpoint(project: FilmProject, scene: FilmScene, assets: SceneAssets) {
  const videoPath = assetAbsolutePath(project.id, assets.videoAsset);
  const [file, probe] = await Promise.all([
    stat(videoPath),
    assertPlayableSceneVideo(videoPath, scene.durationSeconds)
  ]);
  const checkpoint: SceneCheckpoint = {
    version: 2,
    productionMode: activeProductionMode(),
    projectId: project.id,
    sceneId: scene.id,
    order: scene.order,
    completedAt: new Date().toISOString(),
    assets,
    video: { bytes: file.size, durationSeconds: probe.durationSeconds }
  };
  const destination = sceneCheckpointPath(project.id, scene.order);
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
  await rm(destination, { force: true });
  await rename(temporary, destination);
  return checkpoint;
}

export async function saveShotCheckpoint(project: FilmProject, scene: FilmScene, shot: FilmShot, assets: SceneAssets) {
  const videoPath = assetAbsolutePath(project.id, assets.videoAsset);
  const [file, probe] = await Promise.all([
    stat(videoPath),
    assertPlayableSceneVideo(videoPath, shot.durationSeconds)
  ]);
  const checkpoint: ShotCheckpoint = {
    version: 2,
    productionMode: activeProductionMode(),
    provider: shot.lastProvider,
    projectId: project.id,
    sceneId: scene.id,
    shotId: shot.id,
    sceneOrder: scene.order,
    shotOrder: shot.order,
    completedAt: new Date().toISOString(),
    assets,
    video: { bytes: file.size, durationSeconds: probe.durationSeconds }
  };
  const destination = shotCheckpointPath(project.id, scene.order, shot.order);
  await atomicCheckpoint(destination, checkpoint);
  return checkpoint;
}

export async function reusableSceneAssets(project: FilmProject, scene: FilmScene): Promise<SceneAssets | undefined> {
  const fromCheckpoint = await readCheckpoint(project.id, scene);
  if (fromCheckpoint && await checkpointIsValid(project.id, scene, fromCheckpoint)) return fromCheckpoint.assets;

  if (rejectLegacyAssetsInRealMode()) return undefined;

  const canonical = renderedAssets(
    project.id,
    scene.mode,
    path.join(projectAssetDir(project.id, 'images'), `scene-${pad(scene.order)}.png`),
    path.join(projectAssetDir(project.id, 'audio'), `scene-${pad(scene.order)}.mp3`),
    path.join(projectAssetDir(project.id, 'video'), `scene-${pad(scene.order)}.mp4`)
  );
  const assets: SceneAssets = scene.videoAsset && scene.imageAsset && scene.voiceAsset
    ? {
        mode: scene.mode,
        imageAsset: scene.imageAsset,
        voiceAsset: scene.voiceAsset,
        videoAsset: scene.videoAsset
      }
    : canonical;
  try {
    await validateAssets(project.id, scene, assets);
    await saveSceneCheckpoint(project, scene, assets);
    return assets;
  } catch {
    return undefined;
  }
}

export async function reusableShotAssets(project: FilmProject, scene: FilmScene, shot: FilmShot): Promise<SceneAssets | undefined> {
  const fromCheckpoint = await readShotCheckpoint(project.id, scene, shot);
  if (fromCheckpoint && await shotCheckpointIsValid(project.id, shot, fromCheckpoint)) {
    shot.lastProvider = fromCheckpoint.provider || shot.lastProvider;
    return fromCheckpoint.assets;
  }

  if (rejectLegacyAssetsInRealMode()) return undefined;

  const key = `scene-${pad(scene.order)}-shot-${padShot(shot.order)}`;
  const canonical = renderedAssets(
    project.id,
    shot.mode,
    path.join(projectAssetDir(project.id, 'images'), `${key}.png`),
    path.join(projectAssetDir(project.id, 'audio'), `${key}.mp3`),
    path.join(projectAssetDir(project.id, 'video'), `${key}.mp4`)
  );
  const assets: SceneAssets = shot.videoAsset && shot.imageAsset && shot.voiceAsset
    ? { mode: shot.mode, imageAsset: shot.imageAsset, voiceAsset: shot.voiceAsset, videoAsset: shot.videoAsset }
    : canonical;
  try {
    await validateAssets(project.id, shot, assets);
    await saveShotCheckpoint(project, scene, shot, assets);
    return assets;
  } catch {
    return undefined;
  }
}

export async function removePartialSceneFiles(projectId: string) {
  const directory = projectAssetDir(projectId, 'video');
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.includes('.partial-'))
      .map((entry) => rm(path.join(directory, entry.name), { force: true }))
  );
}

async function readCheckpoint(projectId: string, scene: FilmScene): Promise<SceneCheckpoint | undefined> {
  try {
    const raw = await readFile(sceneCheckpointPath(projectId, scene.order), 'utf8');
    const value = JSON.parse(raw) as Partial<SceneCheckpoint>;
    if (
      value.version !== 2 ||
      value.productionMode !== activeProductionMode() ||
      value.projectId !== projectId ||
      value.sceneId !== scene.id ||
      value.order !== scene.order ||
      !value.assets?.videoAsset ||
      !value.assets.imageAsset ||
      !value.assets.voiceAsset ||
      !value.video?.bytes
    ) return undefined;
    return value as SceneCheckpoint;
  } catch {
    return undefined;
  }
}

async function readShotCheckpoint(projectId: string, scene: FilmScene, shot: FilmShot): Promise<ShotCheckpoint | undefined> {
  try {
    const raw = await readFile(shotCheckpointPath(projectId, scene.order, shot.order), 'utf8');
    const value = JSON.parse(raw) as Partial<ShotCheckpoint>;
    if (
      value.version !== 2 ||
      value.productionMode !== activeProductionMode() ||
      value.projectId !== projectId ||
      value.sceneId !== scene.id ||
      value.shotId !== shot.id ||
      value.sceneOrder !== scene.order ||
      value.shotOrder !== shot.order ||
      !value.assets?.videoAsset ||
      !value.assets.imageAsset ||
      !value.assets.voiceAsset ||
      !value.video?.bytes
    ) return undefined;
    return value as ShotCheckpoint;
  } catch {
    return undefined;
  }
}

async function checkpointIsValid(projectId: string, scene: FilmScene, checkpoint: SceneCheckpoint) {
  try {
    const videoPath = assetAbsolutePath(projectId, checkpoint.assets.videoAsset);
    const file = await stat(videoPath);
    if (file.size !== checkpoint.video.bytes) return false;
    await validateAssets(projectId, scene, checkpoint.assets);
    return true;
  } catch {
    return false;
  }
}

async function shotCheckpointIsValid(projectId: string, shot: FilmShot, checkpoint: ShotCheckpoint) {
  try {
    const videoPath = assetAbsolutePath(projectId, checkpoint.assets.videoAsset);
    const file = await stat(videoPath);
    if (file.size !== checkpoint.video.bytes) return false;
    await validateAssets(projectId, shot, checkpoint.assets);
    return true;
  } catch {
    return false;
  }
}

async function validateAssets(projectId: string, scene: Pick<FilmScene, 'durationSeconds'> | Pick<FilmShot, 'durationSeconds'>, assets: SceneAssets) {
  const [image, voice] = await Promise.all([
    stat(assetAbsolutePath(projectId, assets.imageAsset)),
    stat(assetAbsolutePath(projectId, assets.voiceAsset))
  ]);
  if (image.size < 1 || voice.size < 1) throw new Error('La escena tiene recursos visuales o de voz incompletos.');
  return assertPlayableSceneVideo(assetAbsolutePath(projectId, assets.videoAsset), scene.durationSeconds);
}

export function renderedAssets(projectId: string, mode: SceneMode | ShotMode, imagePath: string, voicePath: string, videoPath: string): SceneAssets {
  return {
    mode,
    imageAsset: assetRelativePath(projectId, imagePath),
    voiceAsset: assetRelativePath(projectId, voicePath),
    videoAsset: assetRelativePath(projectId, videoPath)
  };
}

async function atomicCheckpoint(destination: string, value: unknown) {
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rm(destination, { force: true });
  await rename(temporary, destination);
}

const pad = (value: number) => String(value).padStart(3, '0');
const padShot = (value: number) => String(value).padStart(2, '0');
const activeProductionMode = (): 'real' | 'demo' => process.env.PRODUCTION_MODE === 'real' ? 'real' : 'demo';
const rejectLegacyAssetsInRealMode = () =>
  activeProductionMode() === 'real' && process.env.ALLOW_LEGACY_CHECKPOINTS !== 'true';
