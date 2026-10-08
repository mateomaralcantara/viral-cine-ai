import { createHash } from 'node:crypto';
import type { FilmV7 } from '@/lib/v7/domain/film';
import { GenerationJobSchema, type GenerationJob } from '@/lib/v7/domain/job';
import { executionLayers } from './dependency-graph';

function stableJobId(parts: string[]) {
  return 'job-' + createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24);
}

export function planFilmJobs(film: FilmV7, createdAt = new Date().toISOString()) {
  const jobs: GenerationJob[] = [];
  let previousSceneQA: string | undefined;
  for (const act of film.acts) {
    for (const sequence of act.sequences) {
      for (const scene of sequence.scenes) {
        const continuityId = stableJobId([film.id, scene.id, 'continuity']);
        jobs.push(GenerationJobSchema.parse({
          id: continuityId, filmId: film.id, type: 'continuity.resolve',
          sceneId: scene.id, status: 'ready', priority: 20,
          dependsOn: previousSceneQA ? [previousSceneQA] : [],
          estimatedCostUsd: 0, idempotencyKey: continuityId, attempt: 0, maxAttempts: 1, createdAt
        }));

        const shotQaIds: string[] = [];
        for (const shot of scene.shots) {
          const videoId = stableJobId([film.id, scene.id, shot.id, 'video']);
          const qaId = stableJobId([film.id, scene.id, shot.id, 'qa-shot']);
          jobs.push(GenerationJobSchema.parse({
            id: videoId, filmId: film.id, type: 'video.generate',
            sceneId: scene.id, shotId: shot.id, status: 'planned', priority: 10,
            dependsOn: [continuityId], estimatedCostUsd: 0,
            idempotencyKey: videoId, attempt: 0, maxAttempts: 1, createdAt
          }));
          jobs.push(GenerationJobSchema.parse({
            id: qaId, filmId: film.id, type: 'qa.shot',
            sceneId: scene.id, shotId: shot.id, status: 'planned', priority: 5,
            dependsOn: [videoId], estimatedCostUsd: 0,
            idempotencyKey: qaId, attempt: 0, maxAttempts: 1, createdAt
          }));
          shotQaIds.push(qaId);
        }
        const sceneQaId = stableJobId([film.id, scene.id, 'qa-scene']);
        jobs.push(GenerationJobSchema.parse({
          id: sceneQaId, filmId: film.id, type: 'qa.scene',
          sceneId: scene.id, status: 'planned', priority: 3,
          dependsOn: shotQaIds.length ? shotQaIds : [continuityId],
          estimatedCostUsd: 0, idempotencyKey: sceneQaId,
          attempt: 0, maxAttempts: 1, createdAt
        }));
        previousSceneQA = sceneQaId;
      }
    }
  }
  return { jobs, layers: executionLayers(jobs) };
}
