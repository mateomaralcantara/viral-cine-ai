import type { VoiceProfile } from '@/lib/v7/domain/voice-profile';

export type VoiceContinuityAudit = {
  passed: boolean;
  issues: string[];
};

export function auditVoiceContinuity(
  previous: VoiceProfile | undefined,
  current: VoiceProfile
): VoiceContinuityAudit {
  if (!previous) return { passed: current.approved, issues: current.approved ? [] : ['Voice Profile no aprobado.'] };
  const issues: string[] = [];
  if (previous.characterId && current.characterId && previous.characterId !== current.characterId) {
    issues.push('characterId cambió.');
  }
  if (previous.language !== current.language) issues.push('Idioma cambió.');
  if (previous.provider !== current.provider) issues.push('Proveedor de voz cambió.');
  if (previous.providerVoiceId && current.providerVoiceId && previous.providerVoiceId !== current.providerVoiceId) {
    issues.push('Voice ID canónico cambió.');
  }
  if (current.voiceVersion < previous.voiceVersion) issues.push('Regresión de voiceVersion.');
  if (!current.approved) issues.push('Voice Profile actual no aprobado.');
  return { passed: issues.length === 0, issues };
}
