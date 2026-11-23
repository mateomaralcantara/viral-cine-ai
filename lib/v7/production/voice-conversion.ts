/**
 * Identidad vocal fija en los diálogos en cámara.
 * Veo genera la voz con los labios sincronizados, pero inventa una voz distinta en cada toma.
 * El Agente de Voz convierte ese audio a la voz OFICIAL del personaje (speech-to-speech):
 * se conservan el ritmo, las pausas y la sincronía con los labios; cambia solo el timbre.
 */
import { readFile } from 'node:fs/promises';

export const STS_MODEL = process.env.ELEVENLABS_STS_MODEL?.trim() || 'eleven_multilingual_sts_v2';
/** Coste aproximado del conversor: ~1.000 créditos por minuto de audio. */
export const STS_CREDITS_PER_SECOND = 17;

export async function convertSpeech(apiKey: string, voiceId: string, audioFile: string, settings: Record<string, unknown>): Promise<Buffer> {
  const form = new FormData();
  form.append('audio', new Blob([new Uint8Array(await readFile(audioFile))], { type: 'audio/mpeg' }), 'toma.mp3');
  form.append('model_id', STS_MODEL);
  form.append('remove_background_noise', 'true');
  form.append('voice_settings', JSON.stringify(settings));
  const res = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': apiKey }, body: form, signal: AbortSignal.timeout(120000)
  });
  if (!res.ok) throw new Error('El conversor de voz rechazó el audio (' + res.status + '): ' + (await res.text()).slice(0, 300));
  const audio = Buffer.from(await res.arrayBuffer());
  if (audio.length < 2000) throw new Error('El conversor de voz devolvió un audio vacío.');
  return audio;
}
