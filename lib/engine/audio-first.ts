import { access, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Character, FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import { projectAssetDir } from '@/lib/storage/project-store';
import { generateSpeech } from '@/lib/providers/openai-media';
import { generateElevenLabsSpeech, assertCharacterVoiceReady } from '@/lib/providers/elevenlabs';
import { generateFalLipSync } from '@/lib/providers/fal-media';
import { runFakeProviderStage } from '@/lib/providers/fake-cinema';
import { createSilenceAudio } from '@/lib/media/ffmpeg';
import { hasUsableCredential, safeErrorMessage } from '@/lib/engine/production-safety';
import { appendSpend, estimateOperationCost, voiceCostUnits } from '@/lib/engine/spend-ledger';

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
      speakerId: resolveSpeakerId(shot),
      provider: 'checkpoint'
    };
  }

  const text = shot.spokenText.trim();
  const speakerId = resolveSpeakerId(shot);
  if (!text) {
    await createSilenceAudio(shot.durationSeconds, voicePath);
    return { voicePath, speakerId, provider: 'silence' };
  }

  if (process.env.PRODUCTION_MODE !== 'real') {
    await runFakeProviderStage('voice', voicePath, async () => {
      await createSilenceAudio(shot.durationSeconds, voicePath);
      await writeFile(alignmentPath, `${JSON.stringify({ provider: 'offline', speakerId, text }, null, 2)}\n`, 'utf8');
      return voicePath;
    });
    return { voicePath, alignmentPath, speakerId, provider: 'offline' };
  }

  const character = speakerId && speakerId !== 'narrator'
    ? project.plan?.characters.find((item) => item.id === speakerId)
    : undefined;
  const voiceProvider = character?.voiceProvider || 'elevenlabs';
  const idempotencyKey = `voice:${shot.id}:${speakerId || 'none'}:${text.length}`;
  const estimatedUsd = estimateOperationCost('voice', voiceCostUnits(text));

  if (speakerId === 'narrator' || voiceProvider === 'elevenlabs') {
    if (speakerId !== 'narrator') assertCharacterVoiceReady(character);
    await appendSpend(project.id, {
      operation: 'voice',
      provider: 'elevenlabs',
      model: character?.voiceModel || process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2',
      state: 'reserved',
      estimatedUsd,
      sceneId: scene.id,
      shotId: shot.id,
      characterId: character?.id,
      idempotencyKey
    });
    await appendSpend(project.id, {
      operation: 'voice',
      provider: 'elevenlabs',
      state: 'submitted',
      estimatedUsd,
      sceneId: scene.id,
      shotId: shot.id,
      characterId: character?.id,
      idempotencyKey
    });
    try {
      const result = await generateElevenLabsSpeech(character, text, voicePath, alignmentPath, {
        narrator: speakerId === 'narrator',
        emotion: shot.dialogueLines?.[0]?.emotion
      });
      await appendSpend(project.id, {
        operation: 'voice',
        provider: 'elevenlabs',
        model: character?.voiceModel || process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2',
        state: 'succeeded',
        estimatedUsd,
        sceneId: scene.id,
        shotId: shot.id,
        characterId: character?.id,
        idempotencyKey,
        providerRequestId: result.requestId,
        outputAsset: voicePath
      });
      return { voicePath, alignmentPath, speakerId, provider: 'elevenlabs' };
    } catch (error) {
      await appendSpend(project.id, {
        operation: 'voice',
        provider: 'elevenlabs',
        state: 'failed-unknown',
        estimatedUsd,
        sceneId: scene.id,
        shotId: shot.id,
        characterId: character?.id,
        idempotencyKey,
        error: safeErrorMessage(error)
      });
      throw error;
    }
  }

  if (voiceProvider === 'openai' && character && hasUsableCredential('OPENAI_API_KEY')) {
    await appendSpend(project.id, {
      operation: 'voice',
      provider: 'openai',
      model: process.env.OPENAI_TTS_MODEL,
      state: 'submitted',
      estimatedUsd,
      sceneId: scene.id,
      shotId: shot.id,
      characterId: character.id,
      idempotencyKey
    });
    try {
      await generateSpeech(text, character.voiceInstructions, voicePath);
      await writeFile(alignmentPath, `${JSON.stringify({ provider: 'openai', speakerId, text, alignment: null }, null, 2)}\n`, 'utf8');
      await appendSpend(project.id, {
        operation: 'voice',
        provider: 'openai',
        model: process.env.OPENAI_TTS_MODEL,
        state: 'succeeded',
        estimatedUsd,
        sceneId: scene.id,
        shotId: shot.id,
        characterId: character.id,
        idempotencyKey,
        outputAsset: voicePath
      });
      return { voicePath, alignmentPath, speakerId, provider: 'openai' };
    } catch (error) {
      await appendSpend(project.id, {
        operation: 'voice',
        provider: 'openai',
        state: 'failed-unknown',
        estimatedUsd,
        sceneId: scene.id,
        shotId: shot.id,
        characterId: character.id,
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
  const speakerId = resolveSpeakerId(shot);
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

function resolveSpeakerId(shot: FilmShot) {
  return shot.speakerId || shot.dialogueLines?.[0]?.speakerId;
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
