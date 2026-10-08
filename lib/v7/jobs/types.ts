import type { GenerationJob } from '@/lib/v7/domain/job';
export interface JobQueue {
  enqueue(job: GenerationJob): Promise<void>;
  get(jobId: string): Promise<GenerationJob | undefined>;
  update(job: GenerationJob): Promise<void>;
  listReady(): Promise<GenerationJob[]>;
}
export type JobDependencyGraph = { jobs: GenerationJob[]; blockedBy: Map<string, string[]> };
