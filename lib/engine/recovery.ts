import { listProjects, saveProject } from '@/lib/storage/project-store';

export async function recoverInterruptedProjects() {
  const projects = await listProjects();
  let recovered = 0;
  for (const project of projects) {
    if (!['producing', 'composing'].includes(project.status)) continue;
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
    project.status = 'queued';
    project.error = undefined;
    project.progress = {
      ...project.progress,
      phase: 'recovery',
      message: 'Producción interrumpida recuperada; validando tomas y escenas guardadas',
      updatedAt: new Date().toISOString()
    };
    project.productionLog.push(
      `${new Date().toISOString()} Worker reiniciado: proyecto recuperado desde ${previousStatus}`
    );
    await saveProject(project);
    recovered += 1;
  }
  return recovered;
}
