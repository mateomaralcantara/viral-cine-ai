import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { POST } from '../app/api/projects/[projectId]/produce/route';
import { ProjectInputSchema } from '../lib/domain/schemas';
import { createDemoPlan } from '../lib/engine/demo-plan';
import { reusableShotAssets, renderedAssets, shotCheckpointPath } from '../lib/engine/scene-checkpoints';
import { createPlaceholderImage, createSilenceAudio, renderAnimatedImage } from '../lib/media/ffmpeg';
import { checkFfmpeg } from '../lib/media/ffmpeg-check';
import { createProject, getProject, projectAssetDir, saveProject } from '../lib/storage/project-store';

const input = ProjectInputSchema.parse({
  title: 'Aprobacion sin cobro',
  premise: 'Una toma revisada se acepta y continua sin volver a llamar a ningun proveedor de video.',
  durationMinutes: 5,
  genre: 'Prueba',
  audience: 'Equipo interno',
  visualStyle: 'Cine limpio',
  budgetUsd: 50,
  generateMusic: false
});

test('aprobar manualmente guarda checkpoint y no aumenta generaciones', async (context) => {
  if (!(await checkFfmpeg())) return context.skip('FFmpeg no esta disponible');
  const previousData = process.env.VIRALCINE_DATA_DIR;
  const previousMode = process.env.PRODUCTION_MODE;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'viralcine-approval-'));
  process.env.VIRALCINE_DATA_DIR = directory;
  process.env.PRODUCTION_MODE = 'demo';
  try {
    let project = await createProject(input);
    project.plan = createDemoPlan(input);
    const scene = project.plan.scenes[0];
    const shot = scene.shots[0];
    const image = path.join(projectAssetDir(project.id, 'images'), 'approval.png');
    const voice = path.join(projectAssetDir(project.id, 'audio'), 'approval.mp3');
    const video = path.join(projectAssetDir(project.id, 'video'), 'approval.mp4');
    await createPlaceholderImage('Aprobacion', 'Toma valida', image, input);
    await createSilenceAudio(shot.durationSeconds, voice);
    await renderAnimatedImage(image, voice, shot.durationSeconds, video, input.aspectRatio);
    Object.assign(shot, renderedAssets(project.id, shot.mode, image, voice, video), {
      status: 'review-required' as const,
      qualityScore: 7.5,
      qualityAttempts: 1,
      generationCount: 1
    });
    scene.status = 'review-required';
    project.status = 'quality-review';
    project = await saveProject(project);

    const response = await POST(
      new Request(`http://localhost/api/projects/${project.id}/produce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'approve' })
      }),
      { params: Promise.resolve({ projectId: project.id }) }
    );
    assert.equal(response.status, 200);
    const queued = await getProject(project.id);
    const approvedScene = queued.plan?.scenes[0];
    const approvedShot = approvedScene?.shots[0];
    if (!approvedScene || !approvedShot) throw new Error('La toma aprobada desaparecio.');
    assert.equal(queued.status, 'queued');
    assert.equal(approvedShot.generationCount, 1);
    assert.equal(approvedShot.qualityOverrideApproved, true);
    assert.ok((await stat(shotCheckpointPath(project.id, 1, 1))).size > 100);
    assert.ok(await reusableShotAssets(queued, approvedScene, approvedShot));
  } finally {
    restore('VIRALCINE_DATA_DIR', previousData);
    restore('PRODUCTION_MODE', previousMode);
    await rm(directory, { recursive: true, force: true });
  }
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
