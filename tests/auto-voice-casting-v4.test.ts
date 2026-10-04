import test from 'node:test';
import assert from 'node:assert/strict';
import type { Character } from '../lib/domain/schemas';
import {
  selectDeterministicVoice
} from '../lib/engine/auto-voice-casting-v4';
import type { ElevenLabsAvailableVoice } from '../lib/providers/elevenlabs';

const maria: Character = {
  id: 'maria',
  name: 'María',
  role: 'Madre',
  age: 50,
  appearance: 'Mujer judía de unos 50 años.',
  wardrobe: 'Manto azul',
  personality: 'Serena',
  voiceInstructions: 'Voz femenina contenida',
  voiceProvider: 'elevenlabs',
  imagePrompt: 'María'
};

const juan: Character = {
  id: 'juan',
  name: 'Juan',
  role: 'Discípulo',
  age: 25,
  appearance: 'Hombre judío joven.',
  wardrobe: 'Manto verde',
  personality: 'Protector',
  voiceInstructions: 'Voz masculina joven',
  voiceProvider: 'elevenlabs',
  imagePrompt: 'Juan'
};

const voices: ElevenLabsAvailableVoice[] = [
  { voiceId: 'f-es', name: 'Ana', gender: 'female', languages: ['es'] },
  { voiceId: 'm-es', name: 'Carlos', gender: 'male', languages: ['es'] },
  { voiceId: 'f-en', name: 'Eva', gender: 'female', languages: ['en'] },
  { voiceId: 'm-en', name: 'John', gender: 'male', languages: ['en'] }
];

test('autocasting prefiere español y género coherente', () => {
  assert.equal(
    selectDeterministicVoice(maria, voices, new Set()).voiceId,
    'f-es'
  );
  assert.equal(
    selectDeterministicVoice(juan, voices, new Set()).voiceId,
    'm-es'
  );
});

test('autocasting evita voces ya ocupadas cuando existen alternativas', () => {
  const selected = selectDeterministicVoice(
    maria,
    [
      { voiceId: 'f-es-a', name: 'Ana', gender: 'female', languages: ['es'] },
      { voiceId: 'f-es-b', name: 'Bea', gender: 'female', languages: ['es'] }
    ],
    new Set(['f-es-a'])
  );

  assert.equal(selected.voiceId, 'f-es-b');
});

test('autocasting es determinista para un mismo perfil', () => {
  const first = selectDeterministicVoice(juan, voices, new Set());
  const second = selectDeterministicVoice(juan, voices, new Set());
  assert.equal(first.voiceId, second.voiceId);
});
