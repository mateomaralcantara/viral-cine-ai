import { listProjects, saveProject } from '@/lib/storage/project-store';
import { assertProductionCanQueue, safeErrorMessage } from '@/lib/engine/production-safety';

export async function recoverInterruptedProjects() {
  const projects = await listProjects();
  let recovered = 0;
  for (const project of projects) {
    const hasInterruptedUnit = project.plan?.scenes.some((scene) =>
      scene.status === 'rendering' || scene.shots.some((shot) => shot.status === 'rendering')
    );
    if (!['producing', 'composing'].includes(project.status) && !hasInterruptedUnit) continue;
    const previousStatus = project.status;
    for (const scene of project.plan?.scenes || []) {
      for (const shot of scene.shots) {
        if (shot.status === 'rendering') {
          shot.status = 'pending';
          shot.error = undefined;
        }
      }
      if (scene.status === 'rendering') {
        scene.status = 'pending';
        scene.error = undefined;
      }
    }
    try {
      assertProductionCanQueue(project);
      project.status = 'queued';
      project.error = undefined;
    } catch (error) {
      project.status = 'paused-safety';
      project.error = safeErrorMessage(error);
    }
    project.progress = {
      ...project.progress,
      phase: project.status === 'queued' ? 'recovery' : 'paused-safety',
      message: project.status === 'queued'
        ? 'Producción interrumpida recuperada; validando tomas y escenas guardadas'
        : project.error || 'Producción pausada por seguridad',
      updatedAt: new Date().toISOString()
    };
    project.productionLog.push(
      `${new Date().toISOString()} Worker reiniciado: proyecto recuperado desde ${previousStatus} como ${project.status}`
    );
    await saveProject(project);
    recovered += 1;
  }
  return recovered;
}
