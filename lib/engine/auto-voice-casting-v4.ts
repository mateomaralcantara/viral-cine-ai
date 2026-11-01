import { createHash } from 'node:crypto';
import type { Character, FilmProject, NarratorVoice, SupportVoice } from '@/lib/domain/schemas';
import { locateVoiceProfile } from '@/lib/engine/voice-casting-v4';
import { isUsableCredentialValue } from '@/lib/engine/production-safety';
import {
  listAvailableElevenLabsVoices,
  type ElevenLabsAvailableVoice
} from '@/lib/providers/elevenlabs';

type VoiceProfile = Character | SupportVoice | NarratorVoice;

export type AutoVoiceAssignment = {
  speakerId: string;
  label: string;
  voiceId: string;
  voiceName: string;
  gender?: string;
  languages: string[];
};

export function canAutoCastElevenLabsProfile(
  project: FilmProject,
  speakerId: string
) {
  const located = locateVoiceProfile(project, speakerId);
  if (!located) return false;

  const provider = located.profile.voiceProvider || 'elevenlabs';
  if (provider !== 'elevenlabs') return false;

  if (
    speakerId === 'narrator' &&
    isUsableCredentialValue(process.env.ELEVENLABS_NARRATOR_VOICE_ID)
  ) {
    return false;
  }

  return !isUsableCredentialValue(located.profile.voiceId);
}

export function selectDeterministicVoice(
  profile: VoiceProfile,
  voices: ElevenLabsAvailableVoice[],
  excludedVoiceIds: Set<string>
) {
  const inferredGender = inferGender(profile);
  const preferredLanguage = 'es';

  const unused = voices.filter((voice) => !excludedVoiceIds.has(voice.voiceId));
  const base = unused.length ? unused : voices;

  const spanish = base.filter((voice) =>
    voice.languages.some((language) => normalizeLanguage(language) === preferredLanguage)
  );
  const languagePool = spanish.length ? spanish : base;

  const genderPool = inferredGender
    ? languagePool.filter((voice) => normalizeGender(voice.gender) === inferredGender)
    : [];

  const pool = (genderPool.length ? genderPool : languagePool)
    .slice()
    .sort((a, b) =>
      a.name.localeCompare(b.name, 'en') ||
      a.voiceId.localeCompare(b.voiceId)
    );

  if (!pool.length) {
    throw new Error('No hay voces de ElevenLabs disponibles para autocasting.');
  }

  const index = stableIndex(profile.id, pool.length);
  return pool[index];
}

export async function ensureElevenLabsAutoCastingReal(
  project: FilmProject,
  speakerIds: string[]
) {
  const uniqueIds = [...new Set(speakerIds.filter(Boolean))];
  const pending = uniqueIds
    .map((speakerId) => ({ speakerId, located: locateVoiceProfile(project, speakerId) }))
    .filter((entry) => {
      if (!entry.located) return false;
      const provider = entry.located.profile.voiceProvider || 'elevenlabs';
      if (provider !== 'elevenlabs') return false;

      const existing = entry.located.profile.voiceId;
      if (isUsableCredentialValue(existing)) return false;

      if (
        entry.speakerId === 'narrator' &&
        isUsableCredentialValue(process.env.ELEVENLABS_NARRATOR_VOICE_ID)
      ) {
        return false;
      }

      return true;
    });

  if (!pending.length) {
    return { assignments: [] as AutoVoiceAssignment[], changed: false };
  }

  const voices = await listAvailableElevenLabsVoices();
  const used = collectUsedVoiceIds(project);
  const narratorFallback = process.env.ELEVENLABS_NARRATOR_VOICE_ID;
  if (isUsableCredentialValue(narratorFallback)) used.add(narratorFallback!);

  const assignments: AutoVoiceAssignment[] = [];

  for (const entry of pending) {
    const located = entry.located!;
    const selected = selectDeterministicVoice(located.profile, voices, used);
    located.profile.voiceId = selected.voiceId;
    used.add(selected.voiceId);

    if (entry.speakerId === 'narrator') {
      project.narratorVoice = located.profile as NarratorVoice;
    }

    assignments.push({
      speakerId: entry.speakerId,
      label: located.label,
      voiceId: selected.voiceId,
      voiceName: selected.name,
      gender: selected.gender,
      languages: selected.languages
    });
  }

  if (assignments.length) {
    project.productionLog.push(
      new Date().toISOString() +
      ' Voice Casting 4.2 AUTO: ' +
      assignments.map((item) => item.label + ' -> ' + item.voiceName).join(' | ') +
      '. Solo metadata; no se generó audio durante el casting.'
    );
  }

  return { assignments, changed: assignments.length > 0 };
}

function collectUsedVoiceIds(project: FilmProject) {
  const values = [
    project.narratorVoice?.voiceId,
    ...(project.plan?.characters || []).map((item) => item.voiceId),
    ...(project.supportVoices || []).map((item) => item.voiceId)
  ].filter((value): value is string => isUsableCredentialValue(value));

  return new Set(values);
}

function inferGender(profile: VoiceProfile): 'male' | 'female' | undefined {
  const text = normalizeText(
    ('name' in profile ? profile.name : profile.label) + ' ' +
    ('appearance' in profile ? profile.appearance : '') + ' ' +
    ('role' in profile ? profile.role : '') + ' ' +
    (profile.voiceInstructions || '')
  );

  if (/\b(mujer|madre|femenin[ao]|female|woman|girl)\b/.test(text)) {
    return 'female';
  }
  if (/\b(hombre|padre|masculin[ao]|male|man|boy)\b/.test(text)) {
    return 'male';
  }
  return undefined;
}

function normalizeGender(value: string | undefined) {
  const normalized = normalizeText(value || '');
  if (/female|femenin|mujer|woman/.test(normalized)) return 'female';
  if (/male|masculin|hombre|man/.test(normalized)) return 'male';
  return undefined;
}

function normalizeLanguage(value: string) {
  return value.trim().toLowerCase().split(/[-_]/)[0];
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function stableIndex(value: string, length: number) {
  const digest = createHash('sha256').update(value).digest();
  return digest.readUInt32BE(0) % length;
}
