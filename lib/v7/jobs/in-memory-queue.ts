import type { GenerationJob } from '@/lib/v7/domain/job';
import type { JobQueue } from './types';
export class InMemoryJobQueue implements JobQueue {
  private readonly jobs = new Map<string, GenerationJob>();
  async enqueue(job: GenerationJob) {
    if (this.jobs.has(job.id)) throw new Error('Job duplicado: ' + job.id);
    this.jobs.set(job.id, structuredClone(job));
  }
  async get(jobId: string) {
    const job = this.jobs.get(jobId);
    return job ? structuredClone(job) : undefined;
  }
  async update(job: GenerationJob) {
    if (!this.jobs.has(job.id)) throw new Error('Job inexistente: ' + job.id);
    this.jobs.set(job.id, structuredClone(job));
  }
  async listReady() {
    const succeeded = new Set([...this.jobs.values()]
      .filter((job) => job.status === 'succeeded' || job.status === 'approved').map((job) => job.id));
    return [...this.jobs.values()]
      .filter((job) => job.status === 'ready' && job.dependsOn.every((dependency) => succeeded.has(dependency)))
      .sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt))
      .map((job) => structuredClone(job));
  }
}
