import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { FilmProject } from '../lib/domain/schemas';
import { ensureProjectFolders, projectAssetDir } from '../lib/storage/project-store';
import { checkFfmpeg } from '../lib/media/ffmpeg-check';
import { createSyntheticMotionVideo } from '../lib/media/synthetic-video';
import { inspectMixedShotVisualSource } from '../lib/engine/producer-v4';

const execFileAsync = promisify(execFile);
const PROJECT_ID = '22222222-3333-4444-8555-666666666666';

function fixture(): FilmProject {
  return {
    id: PROJECT_ID,
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    status: 'ready',
    input: {
      title: 'Mixed Source Test',
      premise: 'Prueba de rechazo de un MP4 visualmente inútil antes de permitir gasto adicional.',
      durationMinutes: 5,
      genre: 'Drama',
      audience: 'Equipo',
      visualStyle: 'Cinematográfico',
      language: 'es',
      aspectRatio: '16:9',
      budgetUsd: 20,
      burnSubtitles: false,
      generateMusic: false
    },
    plan: {
      logline: 'Test',
      synopsis: 'Test',
      creativeDirection: 'Test',
      musicPrompt: 'Test',
      characters: [{
        id: 'character-a',
        name: 'A',
        role: 'Principal',
        age: 40,
        appearance: 'Test',
        wardrobe: 'Test',
        personality: 'Test',
        voiceInstructions: 'Test',
        voiceProvider: 'elevenlabs',
        imagePrompt: 'Test'
      }],
      scenes: [{
        id: 'scene-a',
        order: 1,
        act: 1,
        title: 'Escena',
        durationSeconds: 7,
        summary: 'Test',
        narration: '',
        dialogue: '',
        dialogueTurns: [],
        visualPrompt: 'Escena dramática con personajes visibles',
        negativePrompt: '',
        camera: 'Plano medio',
        soundDesign: '',
        transition: '',
        mode: 'ai-video',
        characterIds: ['character-a'],
        shots: [{
          id: 'shot-mixed-source',
          order: 7,
          title: 'Mixta',
          durationSeconds: 7,
          visualPrompt: 'Personajes visibles en una escena real',
          camera: 'Plano medio',
          spokenText: 'Texto',
          dialogueLines: [
            { id: 'a', speakerId: 'narrator', text: 'Uno', startSeconds: 0, endSeconds: 3 },
            { id: 'b', speakerId: 'character-a', text: 'Dos', startSeconds: 3, endSeconds: 7 }
          ],
          mode: 'video',
          characterIds: ['character-a'],
          status: 'ready',
          videoAsset: 'video/scene-001-shot-07.mp4'
        }],
        status: 'ready'
      }]
    },
    supportVoices: [],
    progress: { phase: 'ready', percent: 100, message: 'Test', updatedAt: '2026-10-02T00:00:00.000Z' },
    productionLog: []
  } as FilmProject;
}

test('rechaza fuente histórica oscura y prefiere un video base reparado válido', async (context) => {
  if (!(await checkFfmpeg())) return context.skip('FFmpeg no está disponible');

  const root = await mkdtemp(path.join(os.tmpdir(), 'viralcine-mixed-source-'));
  const previousData = process.env.VIRALCINE_DATA_DIR;
  try {
    process.env.VIRALCINE_DATA_DIR = root;
    const project = fixture();
    await ensureProjectFolders(project.id);
    const shot = project.plan!.scenes[0].shots[0];
    const scene = project.plan!.scenes[0];

    const oldSource = path.join(projectAssetDir(project.id, 'video'), 'scene-001-shot-07.mp4');
    const ffmpeg = process.env.FFMPEG_PATH || (process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    await execFileAsync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=0x070b20:s=1280x720:r=25',
      '-t', '7', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', oldSource
    ]);

    const rejected = await inspectMixedShotVisualSource(project, scene, shot);
    assert.equal(rejected.needsGeneration, true);
    assert.equal(rejected.selectedAsset, undefined);
    assert.ok(rejected.rejected.some((item) => item.asset === shot.videoAsset));

    const folder = path.join(
      projectAssetDir(project.id, 'video'),
      'segmented-v4-source',
      'scene-001-shot-07-shot-mixed-source'
    );
    await mkdir(folder, { recursive: true });
    const repaired = path.join(folder, 'base-real.mp4');
    await createSyntheticMotionVideo(7, repaired, project.input.aspectRatio);

    const selected = await inspectMixedShotVisualSource(project, scene, shot);
    assert.equal(selected.needsGeneration, false);
    assert.equal(selected.selectedKind, 'repaired');
    assert.match(selected.selectedAsset || '', /^video\/segmented-v4-source\//);
  } finally {
    if (previousData === undefined) delete process.env.VIRALCINE_DATA_DIR;
    else process.env.VIRALCINE_DATA_DIR = previousData;
    await rm(root, { recursive: true, force: true });
  }
});
