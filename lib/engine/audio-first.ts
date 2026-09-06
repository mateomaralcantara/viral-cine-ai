import { access, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import { projectAssetDir } from '@/lib/storage/project-store';
import { generateSpeech } from '@/lib/providers/openai-media';
import { generateElevenLabsSpeech, assertVoiceProfileReady } from '@/lib/providers/elevenlabs';
import { generateFalLipSync } from '@/lib/providers/fal-media';
import { runFakeProviderStage } from '@/lib/providers/fake-cinema';
import { createSilenceAudio, createSyntheticSpeechAudio } from '@/lib/media/ffmpeg';
import { hasUsableCredential, safeErrorMessage } from '@/lib/engine/production-safety';
import { appendSpend, estimateOperationCost, voiceCostUnits } from '@/lib/engine/spend-ledger';
import { hasMultipleDialogueSpeakers, resolveSingleSpeakerId } from '@/lib/engine/speaker-resolution';
import { findVoiceProfile } from '@/lib/engine/support-voice-registry-v4';

export type PreparedVoice = {
  voicePath: string;
  alignmentPath?: string;
  speakerId?: string;
  provider: string;
};

export async function prepareAudioFirstVoice(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot,
  key: string
): Promise<PreparedVoice> {
  const voicePath = path.join(projectAssetDir(project.id, 'audio'), `${key}.mp3`);
  const alignmentPath = path.join(projectAssetDir(project.id, 'audio'), `${key}.alignment.json`);
  if (await exists(voicePath)) {
    return {
      voicePath,
      alignmentPath: await exists(alignmentPath) ? alignmentPath : undefined,
      speakerId: resolveSingleSpeakerId(shot),
      provider: 'checkpoint'
    };
  }

  const text = shot.spokenText.trim();
  if (text && hasMultipleDialogueSpeakers(shot)) {
    throw new Error('Audio-first requiere un único hablante por segmento; divide la toma multihablante antes de generar voz.');
  }
  const speakerId = resolveSingleSpeakerId(shot);
  if (!text) {
    await createSilenceAudio(shot.durationSeconds, voicePath);
    return { voicePath, speakerId, provider: 'silence' };
  }

  if (process.env.PRODUCTION_MODE !== 'real') {
    await runFakeProviderStage('voice', voicePath, async () => {
      await createSyntheticSpeechAudio(shot.durationSeconds, voicePath);
      await writeFile(alignmentPath, `${JSON.stringify({ provider: 'offline', speakerId, text, syntheticAudibleSignal: true }, null, 2)}\n`, 'utf8');
      return voicePath;
    });
    return { voicePath, alignmentPath, speakerId, provider: 'offline' };
  }

  const voiceProfile = findVoiceProfile(project, speakerId);
  const voiceProvider = voiceProfile?.voiceProvider || 'elevenlabs';
  const idempotencyKey = `voice:${shot.id}:${speakerId || 'none'}:${text.length}`;
  const estimatedUsd = estimateOperationCost('voice', voiceCostUnits(text));

  if (speakerId === 'narrator' || voiceProvider === 'elevenlabs') {
    if (speakerId !== 'narrator') assertVoiceProfileReady(voiceProfile);
    await appendSpend(project.id, {
      operation: 'voice',
      provider: 'elevenlabs',
      model: voiceProfile?.voiceModel || process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2',
      state: 'reserved',
      estimatedUsd,
      sceneId: scene.id,
      shotId: shot.id,
      characterId: voiceProfile?.id,
      idempotencyKey
    });
    await appendSpend(project.id, {
      operation: 'voice',
      provider: 'elevenlabs',
      state: 'submitted',
      estimatedUsd,
      sceneId: scene.id,
      shotId: shot.id,
      characterId: voiceProfile?.id,
      idempotencyKey
    });
    try {
      const result = await generateElevenLabsSpeech(voiceProfile, text, voicePath, alignmentPath, {
        narrator: speakerId === 'narrator',
        emotion: shot.dialogueLines?.[0]?.emotion
      });
      await appendSpend(project.id, {
        operation: 'voice',
        provider: 'elevenlabs',
        model: voiceProfile?.voiceModel || process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2',
        state: 'succeeded',
        estimatedUsd,
        sceneId: scene.id,
        shotId: shot.id,
        characterId: voiceProfile?.id,
        idempotencyKey,
        providerRequestId: result.requestId,
        outputAsset: voicePath
      });
      return { voicePath, alignmentPath, speakerId, provider: 'elevenlabs' };
    } catch (error) {
      await appendSpend(project.id, {
        operation: 'voice',
        provider: 'elevenlabs',
        model: voiceProfile?.voiceModel || process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2',
        state: 'failed-unknown',
        estimatedUsd,
        sceneId: scene.id,
        shotId: shot.id,
        characterId: voiceProfile?.id,
        idempotencyKey,
        error: safeErrorMessage(error)
      });
      throw error;
    }
  }

  if (voiceProvider === 'openai' && voiceProfile && hasUsableCredential('OPENAI_API_KEY')) {
    await appendSpend(project.id, {
      operation: 'voice',
      provider: 'openai',
      model: process.env.OPENAI_TTS_MODEL,
      state: 'submitted',
      estimatedUsd,
      sceneId: scene.id,
      shotId: shot.id,
      characterId: voiceProfile.id,
      idempotencyKey
    });
    try {
      await generateSpeech(text, voiceProfile.voiceInstructions, voicePath);
      await writeFile(alignmentPath, `${JSON.stringify({ provider: 'openai', speakerId, text, alignment: null }, null, 2)}\n`, 'utf8');
      await appendSpend(project.id, {
        operation: 'voice',
        provider: 'openai',
        model: process.env.OPENAI_TTS_MODEL,
        state: 'succeeded',
        estimatedUsd,
        sceneId: scene.id,
        shotId: shot.id,
        characterId: voiceProfile.id,
        idempotencyKey,
        outputAsset: voicePath
      });
      return { voicePath, alignmentPath, speakerId, provider: 'openai' };
    } catch (error) {
      await appendSpend(project.id, {
        operation: 'voice',
        provider: 'openai',
        model: process.env.OPENAI_TTS_MODEL,
        state: 'failed-unknown',
        estimatedUsd,
        sceneId: scene.id,
        shotId: shot.id,
        characterId: voiceProfile.id,
        idempotencyKey,
        error: safeErrorMessage(error)
      });
      throw error;
    }
  }

  throw new Error(`No existe un proveedor vocal válido para el hablante ${speakerId || 'desconocido'}.`);
}

export async function applyAudioFirstLipSync(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot,
  baseVideoPath: string,
  voicePath: string,
  outputPath: string
) {
  if (shot.spokenText.trim() && hasMultipleDialogueSpeakers(shot)) {
    throw new Error('Lip-sync requiere un único hablante por segmento; divide la toma multihablante antes de sincronizar labios.');
  }
  const speakerId = resolveSingleSpeakerId(shot);
  if (!shot.spokenText.trim() || !speakerId || speakerId === 'narrator') {
    await copyFile(baseVideoPath, outputPath);
    return { outputPath, provider: 'none' };
  }
  if (process.env.PRODUCTION_MODE !== 'real') {
    await runFakeProviderStage('lip-sync', outputPath, async () => {
      await copyFile(baseVideoPath, outputPath);
      return outputPath;
    });
    return { outputPath, provider: 'offline' };
  }
  if (process.env.ENABLE_LIPSYNC === 'false') {
    throw new Error('Hay diálogo visible pero ENABLE_LIPSYNC=false. ViralCine 4.0 no publicará diálogo desincronizado.');
  }
  if (!hasUsableCredential('FAL_KEY')) {
    throw new Error('Hay diálogo visible pero falta FAL_KEY para el proveedor de lip-sync.');
  }

  const estimatedUsd = estimateOperationCost('lip-sync', shot.durationSeconds);
  const idempotencyKey = `lip-sync:${shot.id}:${shot.durationSeconds}`;
  await appendSpend(project.id, {
    operation: 'lip-sync',
    provider: 'fal',
    model: process.env.FAL_LIPSYNC_MODEL || 'fal-ai/sync-lipsync/v3',
    state: 'reserved',
    estimatedUsd,
    sceneId: scene.id,
    shotId: shot.id,
    idempotencyKey
  });
  await appendSpend(project.id, {
    operation: 'lip-sync',
    provider: 'fal',
    model: process.env.FAL_LIPSYNC_MODEL || 'fal-ai/sync-lipsync/v3',
    state: 'submitted',
    estimatedUsd,
    sceneId: scene.id,
    shotId: shot.id,
    idempotencyKey
  });
  try {
    await generateFalLipSync(baseVideoPath, voicePath, outputPath);
    await appendSpend(project.id, {
      operation: 'lip-sync',
      provider: 'fal',
      model: process.env.FAL_LIPSYNC_MODEL || 'fal-ai/sync-lipsync/v3',
      state: 'succeeded',
      estimatedUsd,
      sceneId: scene.id,
      shotId: shot.id,
      idempotencyKey,
      outputAsset: outputPath
    });
    return { outputPath, provider: 'fal' };
  } catch (error) {
    await appendSpend(project.id, {
      operation: 'lip-sync',
      provider: 'fal',
      model: process.env.FAL_LIPSYNC_MODEL || 'fal-ai/sync-lipsync/v3',
      state: 'failed-unknown',
      estimatedUsd,
      sceneId: scene.id,
      shotId: shot.id,
      idempotencyKey,
      error: safeErrorMessage(error)
    });
    throw error;
  }
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
