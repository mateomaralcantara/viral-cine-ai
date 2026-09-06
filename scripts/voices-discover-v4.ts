import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { discoverElevenLabsVoices } from '@/lib/providers/elevenlabs-voice-discovery';

loadLocalEnvSafely();

const [provider, confirm] = process.argv.slice(2);
if (provider !== 'elevenlabs' || confirm !== '--confirm-readonly') {
  console.log('Uso: npm run voices:discover -- elevenlabs --confirm-readonly');
  process.exit(1);
}

const voices = await discoverElevenLabsVoices();
console.log(`\nElevenLabs Voice Discovery 4.0 — ${voices.length} voces`);
console.log('SOLO LECTURA: GET /v2/voices. No genera audio, no reserva gasto y no modifica project.json.\n');
for (const voice of voices) {
  const labelText = Object.entries(voice.labels)
    .slice(0, 6)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
  console.log([
    `- ${voice.name}`,
    `voiceId=${voice.voiceId}`,
    voice.category ? `category=${voice.category}` : undefined,
    labelText ? `labels=[${labelText}]` : undefined
  ].filter(Boolean).join(' | '));
}
console.log('\nSEGURIDAD: ELEVENLABS_API_KEY no se imprime. Gasto TTS: US$0.');

function loadLocalEnvSafely() {
  for (const name of ['.env.local', '.env']) {
    const file = path.resolve(process.cwd(), name);
    if (!existsSync(file)) continue;
    loadEnvFile(file);
    break;
  }
}
