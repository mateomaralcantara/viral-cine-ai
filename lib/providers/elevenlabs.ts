import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Character } from '@/lib/domain/schemas';
import { assertPaidGenerationAllowed } from '@/lib/engine/production-safety';

export type VoiceGenerationResult = {
  audioPath: string;
  alignmentPath: string;
  requestId?: string;
  characterCost?: number;
  provider: 'elevenlabs';
  voiceId: string;
};

type ElevenAlignment = {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
};

type ElevenTimingResponse = {
  audio_base64?: string;
  alignment?: ElevenAlignment;
  normalized_alignment?: ElevenAlignment;
};

export async function generateElevenLabsSpeech(
  character: Character | undefined,
  text: string,
  audioPath: string,
  alignmentPath: string,
  options?: { narrator?: boolean; emotion?: string }
): Promise<VoiceGenerationResult> {
  assertPaidGenerationAllowed('generar voz con ElevenLabs', 'ELEVENLABS_API_KEY');
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('Falta ELEVENLABS_API_KEY.');

  const narrator = options?.narrator === true;
  const voiceId = narrator ? process.env.ELEVENLABS_NARRATOR_VOICE_ID : character?.voiceId;
  if (!voiceId) {
    throw new Error(
      narrator
        ? 'Falta ELEVENLABS_NARRATOR_VOICE_ID para la narración.'
        : `El personaje ${character?.name || 'desconocido'} no tiene voiceId de ElevenLabs asignado.`
    );
  }

  const modelId = character?.voiceModel || process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2';
  const decoratedText = options?.emotion ? `[${options.emotion}] ${text}` : text;
  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      text: decoratedText,
      model_id: modelId,
      voice_settings: {
        stability: character?.voiceStability ?? numberEnv('ELEVENLABS_STABILITY', 0.5),
        similarity_boost: character?.voiceSimilarity ?? numberEnv('ELEVENLABS_SIMILARITY_BOOST', 0.8),
        style: character?.voiceStyle ?? numberEnv('ELEVENLABS_STYLE', 0.25),
        speed: character?.voiceSpeed ?? numberEnv('ELEVENLABS_SPEED', 1),
        use_speaker_boost: true
      }
    })
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1200);
    throw new Error(`ElevenLabs rechazó la voz (${response.status}): ${detail}`);
  }

  const payload = await response.json() as ElevenTimingResponse;
  if (!payload.audio_base64) throw new Error('ElevenLabs respondió sin audio_base64.');
  await Promise.all([
    mkdir(path.dirname(audioPath), { recursive: true }),
    mkdir(path.dirname(alignmentPath), { recursive: true })
  ]);
  await writeFile(audioPath, Buffer.from(payload.audio_base64, 'base64'));
  await writeFile(alignmentPath, `${JSON.stringify({
    provider: 'elevenlabs',
    voiceId,
    modelId,
    alignment: payload.normalized_alignment || payload.alignment || null
  }, null, 2)}\n`, 'utf8');

  return {
    audioPath,
    alignmentPath,
    requestId: response.headers.get('request-id') || undefined,
    characterCost: parseOptionalNumber(response.headers.get('character-cost')),
    provider: 'elevenlabs',
    voiceId
  };
}

export function assertCharacterVoiceReady(character: Character | undefined) {
  if (!character) throw new Error('No existe el personaje asociado al parlamento.');
  if (character.voiceProvider !== 'elevenlabs') return;
  if (!character.voiceId) {
    throw new Error(`Casting vocal incompleto: ${character.name} no tiene voiceId. Asigna una voz persistente antes de producir.`);
  }
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function parseOptionalNumber(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
