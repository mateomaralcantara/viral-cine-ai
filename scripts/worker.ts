import { loadProjectLocalEnvOverride } from '../lib/env/local-env';
import { recoverInterruptedProjects } from '../lib/engine/recovery';
import { produceProject } from '../lib/engine/producer';
import { produceProjectV4 } from '../lib/engine/producer-v4';
import { listProjects } from '../lib/storage/project-store';
import { acquireWorkerLock } from '../lib/engine/worker-lock';
import { safeErrorMessage } from '../lib/engine/production-safety';

loadProjectLocalEnvOverride();

let stopping = false;
let activeProject: string | null = null;

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

const workerLock = await acquireWorkerLock();
try {
  const recovered = await recoverInterruptedProjects();
  if (recovered > 0) console.log(`[worker] Proyectos interrumpidos recuperados: ${recovered}`);
  const realCinema = process.env.REAL_CINEMA_PIPELINE !== 'false';
  console.log(`[worker] ViralCine Studio listo. Pipeline: ${realCinema ? '4.0 REAL CINEMA' : '3.3 LEGACY'}.`);

  while (!stopping) {
    try {
      const projects = await listProjects();
      const queued = projects.find((project) => project.status === 'queued');
      if (queued && !activeProject) {
        activeProject = queued.id;
        console.log(`[worker] Produciendo: ${queued.input.title} (${queued.id})`);
        try {
          const result = realCinema
            ? await produceProjectV4(queued.id)
            : await produceProject(queued.id);
          if (result.status === 'quality-review') {
            console.log(`[worker] Pausado por calidad: ${queued.input.title}`);
          } else if (result.status === 'paused-billing') {
            console.warn(
              `[worker] Pausado por saldo: ${queued.input.title} — ${result.error || 'sin detalle'}`
            );
          } else if (result.status === 'paused-safety') {
            console.warn(
              `[worker] Pausado por seguridad: ${queued.input.title} — ${result.error || 'sin detalle'}`
            );
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
