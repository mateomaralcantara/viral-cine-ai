import { VoiceProfileSchema, type VoiceProfile } from '@/lib/v7/domain/voice-profile';
export type VoiceVault = ReadonlyArray<VoiceProfile>;
export function registerVoiceProfile(vault: VoiceVault, candidate: VoiceProfile): VoiceVault {
  const parsed = VoiceProfileSchema.parse(candidate);
  const sameId = vault.filter((voice) => voice.id === parsed.id);
  if (!sameId.length) return Object.freeze([...vault, parsed]);
  const latest = [...sameId].sort((a, b) => b.voiceVersion - a.voiceVersion)[0];
  if (parsed.voiceVersion <= latest.voiceVersion) {
    throw new Error('Voice Vault es append-only: voiceVersion debe ser mayor que la versión existente.');
  }
  return Object.freeze([...vault, parsed]);
}
export function canonicalVoice(vault: VoiceVault, characterId: string) {
  return [...vault].filter((voice) => voice.characterId === characterId && voice.approved)
    .sort((a, b) => b.voiceVersion - a.voiceVersion)[0];
}
