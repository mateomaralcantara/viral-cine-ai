import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverElevenLabsVoices } from '../lib/providers/elevenlabs-voice-discovery';

test('descubrimiento ElevenLabs pagina, ordena y no necesita generar audio', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  try {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      assert.equal((init?.headers as Record<string, string>)['xi-api-key'], 'test-key-123456');
      if (calls.length === 1) {
        return new Response(JSON.stringify({
          voices: [
            { voice_id: 'voice-z', name: 'Zeta', category: 'premade', labels: { gender: 'male' } }
          ],
          has_more: true,
          next_page_token: 'next-token'
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        voices: [
          { voice_id: 'voice-a', name: 'Alpha', category: 'professional', labels: { gender: 'female' } }
        ],
        has_more: false,
        next_page_token: null
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const voices = await discoverElevenLabsVoices('test-key-123456');
    assert.equal(calls.length, 2);
    assert.match(calls[0], /\/v2\/voices/);
    assert.match(calls[1], /next_page_token=next-token/);
    assert.deepEqual(voices.map((voice) => voice.name), ['Alpha', 'Zeta']);
    assert.deepEqual(voices.map((voice) => voice.voiceId), ['voice-a', 'voice-z']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('descubrimiento ElevenLabs bloquea una clave vacia antes de tocar red', async () => {
  const originalFetch = globalThis.fetch;
  let touched = false;
  try {
    globalThis.fetch = (async () => {
      touched = true;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    await assert.rejects(() => discoverElevenLabsVoices(''), /no está configurada/i);
    assert.equal(touched, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
