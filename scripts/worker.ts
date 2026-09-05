import { recoverInterruptedProjects } from '../lib/engine/recovery';
import { produceProject } from '../lib/engine/producer';
import { listProjects } from '../lib/storage/project-store';
import { acquireWorkerLock } from '../lib/engine/worker-lock';
import { safeErrorMessage } from '../lib/engine/production-safety';

let stopping = false;
let activeProject: string | null = null;

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

const workerLock = await acquireWorkerLock();
try {
  const recovered = await recoverInterruptedProjects();
  if (recovered > 0) console.log(`[worker] Proyectos interrumpidos recuperados: ${recovered}`);
  console.log('[worker] ViralCine Studio listo. Esperando proyectos...');

  while (!stopping) {
    try {
      const projects = await listProjects();
      const queued = projects.find((project) => project.status === 'queued');
      if (queued && !activeProject) {
        activeProject = queued.id;
        console.log(`[worker] Produciendo: ${queued.input.title} (${queued.id})`);
        try {
          const result = await produceProject(queued.id);
          if (result.status === 'quality-review') {
            console.log(`[worker] Pausado por calidad: ${queued.input.title}`);
          } else if (result.status === 'paused-billing') {
            console.warn(`[worker] Pausado por saldo: ${queued.input.title}`);
          } else if (result.status === 'paused-safety') {
            console.warn(`[worker] Pausado por seguridad: ${queued.input.title}`);
          } else if (result.status === 'failed') {
            console.error(`[worker] Falló ${queued.input.title}: ${result.error || 'error técnico'}`);
          } else {
            console.log(`[worker] Terminado: ${queued.input.title}`);
          }
        } catch (error) {
          console.error(`[worker] Falló ${queued.input.title}: ${safeErrorMessage(error)}`);
        } finally {
          activeProject = null;
        }
      }
    } catch (error) {
      console.error(`[worker] Error del ciclo: ${safeErrorMessage(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
} finally {
  await workerLock.release();
  console.log('[worker] Detenido.');
}
