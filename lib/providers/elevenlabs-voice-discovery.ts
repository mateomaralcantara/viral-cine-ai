import { isUsableCredentialValue } from '@/lib/engine/production-safety';

export type DiscoveredElevenVoice = {
  voiceId: string;
  name: string;
  category?: string;
  description?: string;
  labels: Record<string, string>;
};

type ElevenVoicePayload = {
  voice_id?: string;
  name?: string;
  category?: string;
  description?: string | null;
  labels?: Record<string, string> | null;
};

type ElevenVoiceListPayload = {
  voices?: ElevenVoicePayload[];
  has_more?: boolean;
  next_page_token?: string | null;
};

export async function discoverElevenLabsVoices(apiKey = process.env.ELEVENLABS_API_KEY): Promise<DiscoveredElevenVoice[]> {
  if (!isUsableCredentialValue(apiKey)) {
    throw new Error('ELEVENLABS_API_KEY no está configurada con un valor utilizable.');
  }

  const voices: DiscoveredElevenVoice[] = [];
  let nextPageToken: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const url = new URL('https://api.elevenlabs.io/v2/voices');
    url.searchParams.set('page_size', '100');
    url.searchParams.set('include_total_count', 'false');
    if (nextPageToken) url.searchParams.set('next_page_token', nextPageToken);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'xi-api-key': apiKey }
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 800);
      throw new Error(`ElevenLabs rechazó el listado de voces (${response.status}): ${detail}`);
    }

    const payload = await response.json() as ElevenVoiceListPayload;
    for (const item of payload.voices || []) {
      if (!item.voice_id || !item.name) continue;
      voices.push({
        voiceId: item.voice_id,
        name: item.name,
        category: item.category,
        description: item.description || undefined,
        labels: item.labels || {}
      });
    }

    if (!payload.has_more || !payload.next_page_token) break;
    nextPageToken = payload.next_page_token;
  }

  return voices.sort((a, b) => a.name.localeCompare(b.name));
}
