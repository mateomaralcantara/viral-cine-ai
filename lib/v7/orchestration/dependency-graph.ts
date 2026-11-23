import type { GenerationJob } from '@/lib/v7/domain/job';

export function validateDependencyGraph(jobs: GenerationJob[]) {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  for (const job of jobs) {
    for (const dependency of job.dependsOn) {
      if (!byId.has(dependency)) throw new Error('Dependencia inexistente ' + dependency + ' para job ' + job.id);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error('Ciclo detectado en dependency graph: ' + id);
    visiting.add(id);
    for (const dep of byId.get(id)?.dependsOn || []) visit(dep);
    visiting.delete(id);
    visited.add(id);
  }
  for (const job of jobs) visit(job.id);
  return true;
}

export function executionLayers(jobs: GenerationJob[]) {
  validateDependencyGraph(jobs);
  const pending = new Map(jobs.map((job) => [job.id, job]));
  const completed = new Set<string>();
  const layers: GenerationJob[][] = [];
  while (pending.size) {
    const layer = [...pending.values()].filter((job) =>
      job.dependsOn.every((dependency) => completed.has(dependency))
    );
    if (!layer.length) throw new Error('Dependency graph no puede avanzar.');
    layers.push(layer);
    for (const job of layer) {
      pending.delete(job.id);
      completed.add(job.id);
    }
  }
  return layers;
}
