import { AssetSchema, type Asset } from '@/lib/v7/domain/asset';
import type { StoredFilmBundle } from '@/lib/v7/storage/film-store';

export type V7LibraryStatus = 'development' | 'production' | 'finished';

export type V7FilmLibrarySummary = {
  id: string;
  title: string;
  story: string;
  durationMinutes: number;
  genre: string;
  aspectRatio: string;
  language: string;
  budgetUsd: number;
  quality: string;
  legacyProjectId?: string;
  isMigrated: boolean;
  libraryStatus: V7LibraryStatus;
  nextStage: string | null;
  nextStageLabel: string | null;
  acts: number;
  sequences: number;
  scenes: number;
  shots: number;
  takes: number;
  characters: number;
  videoAssets: number;
  hasMaster: boolean;
  masterMediaId: string | null;
  progressPercent: number;
  updatedAt: string;
  savedAt: string;
};

export function getMasterAsset(bundle: StoredFilmBundle): Asset | undefined {
  const explicit = [...bundle.assets]
    .filter((asset) => asset.type === 'master' && asset.approved)
    .sort((a, b) => b.version - a.version)[0];
  if (explicit) return explicit;

  const legacyPath = bundle.film.metadata.originalFinalVideoAsset;
  if (
    bundle.film.legacyProjectId &&
    typeof legacyPath === 'string' &&
    legacyPath.trim().length > 0
  ) {
    return AssetSchema.parse({
      id: 'legacy-master',
      filmId: bundle.film.id,
      type: 'master',
      storagePath: legacyPath,
      source: 'legacy-v6',
      version: 1,
      approved: true,
      createdAt: bundle.film.updatedAt
    });
  }

  return undefined;
}

export function classifyLibraryStatus(bundle: StoredFilmBundle): V7LibraryStatus {
  if (getMasterAsset(bundle)) return 'finished';

  const productionStageIds = new Set(['production', 'qa', 'post', 'master']);
  const hasReachedProduction = Boolean(bundle.workflow?.stages.some((stage) =>
    productionStageIds.has(stage.id) &&
    ['ready', 'in-progress', 'approved'].includes(stage.status)
  ));
  return hasReachedProduction ? 'production' : 'development';
}

export function workflowProgressPercent(bundle: StoredFilmBundle) {
  const stages = bundle.workflow?.stages || [];
  if (!stages.length) return 0;
  const points = stages.reduce((sum, stage) => {
    if (stage.status === 'approved') return sum + 1;
    if (stage.status === 'in-progress') return sum + 0.5;
    if (stage.status === 'ready') return sum + 0.15;
    return sum;
  }, 0);
  return Math.min(100, Math.round(points / stages.length * 100));
}

export function summarizeV7FilmLibraryItem(bundle: StoredFilmBundle): V7FilmLibrarySummary {
  const sequences = bundle.film.acts.flatMap((act) => act.sequences);
  const scenes = sequences.flatMap((sequence) => sequence.scenes);
  const shots = scenes.flatMap((scene) => scene.shots);
  const takes = shots.flatMap((shot) => shot.takes);
  const nextStage = bundle.workflow?.stages.find((stage) =>
    stage.status === 'ready' || stage.status === 'in-progress'
  );
  const master = getMasterAsset(bundle);

  return {
    id: bundle.film.id,
    title: bundle.film.title,
    story: bundle.film.premise,
    durationMinutes: bundle.film.durationMinutes,
    genre: bundle.film.genre,
    aspectRatio: bundle.film.aspectRatio,
    language: bundle.film.language,
    budgetUsd: bundle.film.budgetUsd,
    quality: String(bundle.creationInput?.quality ?? bundle.film.metadata.qualityPreset ?? 'cine'),
    legacyProjectId: bundle.film.legacyProjectId,
    isMigrated: Boolean(bundle.film.legacyProjectId),
    libraryStatus: classifyLibraryStatus(bundle),
    nextStage: nextStage?.id ?? null,
    nextStageLabel: nextStage?.label ?? null,
    acts: bundle.film.acts.length,
    sequences: sequences.length,
    scenes: scenes.length,
    shots: shots.length,
    takes: takes.length,
    characters: bundle.film.characters.length,
    videoAssets: bundle.assets.filter((asset) => asset.type === 'video').length,
    hasMaster: Boolean(master),
    masterMediaId: master ? 'master' : null,
    progressPercent: workflowProgressPercent(bundle),
    updatedAt: bundle.film.updatedAt,
    savedAt: bundle.savedAt
  };
}
