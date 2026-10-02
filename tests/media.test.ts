import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { ProjectInputSchema } from '../lib/domain/schemas';
import { checkFfmpeg } from '../lib/media/ffmpeg-check';
import {
  createPlaceholderImage,
  createSceneContactSheet,
  createSilenceAudio,
  createSyntheticSpeechAudio,
  renderAnimatedImage
} from '../lib/media/ffmpeg';
import { assertCinematicSceneVideo, assertCinematicVideoTrack, assertPlayableSceneVideo } from '../lib/media/probe';

const execFileAsync = promisify(execFile);

test('FFmpeg produce un clip MP4 reproducible desde imagen y audio', async (context) => {
  if (!(await checkFfmpeg())) return context.skip('FFmpeg no está disponible');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'viralcine-test-'));
  const image = path.join(directory, 'scene.png');
  const audio = path.join(directory, 'voice.mp3');
  const video = path.join(directory, 'scene.mp4');
  const contactSheet = path.join(directory, 'contact-sheet.jpg');
  const input = ProjectInputSchema.parse({
    title: 'Prueba técnica',
    premise: 'Una escena de prueba confirma que el motor audiovisual puede producir un archivo real.',
    durationMinutes: 10,
    genre: 'Técnico',
    audience: 'Equipo interno',
    visualStyle: 'Cinematográfico',
    budgetUsd: 50
  });
  await createPlaceholderImage('Escena técnica', 'Prueba de imagen, audio y codificación.', image, input);
  await createSilenceAudio(1, audio);
  await renderAnimatedImage(image, audio, 1, video, '16:9');
  assert.ok((await stat(video)).size > 5_000);
  const probe = await assertPlayableSceneVideo(video, 1);
  assert.equal(probe.hasVideo, true);
  assert.equal(probe.hasAudio, true);
  await createSceneContactSheet(video, 1, contactSheet);
  assert.ok((await stat(contactSheet)).size > 1_000);
});

test('la voz sintética offline supera el umbral audible sin relajar producción real', async (context) => {
  if (!(await checkFfmpeg())) return context.skip('FFmpeg no está disponible');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'viralcine-audible-demo-'));
  const image = path.join(directory, 'scene.png');
  const audio = path.join(directory, 'synthetic-voice.mp3');
  const video = path.join(directory, 'scene.mp4');
  const input = ProjectInputSchema.parse({
    title: 'Prueba de audio offline',
    premise: 'Una señal local prueba el transporte de voz sin llamadas externas.',
    durationMinutes: 5,
    genre: 'Técnico',
    audience: 'Equipo interno',
    visualStyle: 'Cinematográfico',
    budgetUsd: 50
  });
  await createPlaceholderImage('Audio offline', 'Validación audible sin proveedor pagado.', image, input);
  await createSyntheticSpeechAudio(2, audio);
  await renderAnimatedImage(image, audio, 2, video, '16:9');
  await assert.doesNotReject(
    () => assertCinematicSceneVideo(video, 2, { requireAudibleAudio: true })
  );
});

test('rechaza un MP4 negro antes de enviarlo a la auditoria de calidad', async (context) => {
  if (!(await checkFfmpeg())) return context.skip('FFmpeg no está disponible');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'viralcine-black-video-'));
  const video = path.join(directory, 'black.mp4');
  const ffmpeg = process.env.FFMPEG_PATH || (process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  await execFileAsync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:r=24',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video
  ]);
  await assert.rejects(
    () => assertCinematicSceneVideo(video, 2, { requireMotion: true }),
    /Video rechazado.*negro/
  );
  await assert.rejects(
    () => assertCinematicVideoTrack(video, 2),
    /Fuente visual rechazada.*negro/
  );
});
