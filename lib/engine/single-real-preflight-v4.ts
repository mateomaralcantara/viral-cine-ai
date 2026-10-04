import { access } from 'node:fs/promises';
import type { FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import { locateVoiceProfile } from '@/lib/engine/voice-casting-v4';
import { estimateOperationCost, voiceCostUnits } from '@/lib/engine/spend-ledger';
import { hasUsableCredential, isUsableCredentialValue } from '@/lib/engine/production-safety';
import { inspectSingleVisualSource } from '@/lib/engine/single-visual-source-v4';
import { singleVoiceCheckpointPath } from '@/lib/engine/single-real-renderer-v4';
import { requiresLipSyncForSpeaker } from '@/lib/engine/lip-sync-policy-v4';

export type SingleRealPreflight = {
  projectId: string;
  title: string;
  sceneOrder: number;
  shotOrder: number;
  shotId: string;
  text: string;
  speakerId: string;
  speakerLabel: string;
  provider: 'elevenlabs' | 'openai' | 'offline' | 'unknown';
  voiceIdReady: boolean;
  credentialVisible: boolean;
  visualReady: boolean;
  voiceCheckpointReady: boolean;
  voiceEstimatedUsd: number;
  requiresLipSync: boolean;
  lipSyncEstimatedUsd: number;
  blockers: string[];
};

export async function buildSingleRealPreflight(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot
): Promise<SingleRealPreflight> {
  const blockers: string[] = [];
  const text = shot.spokenText.trim();
  const speakerId = shot.speakerId || shot.dialogueLines[0]?.speakerId || '';
  if (!text) blockers.push('La toma no contiene texto hablado.');
  if (!speakerId) blockers.push('La toma no tiene speakerId resuelto.');
  if (shot.dialogueLines.length > 1) blockers.push('La toma es multihablante; usa el piloto segmentado.');

  const visual = await inspectSingleVisualSource(project, scene, shot);
  const visualReady = visual.referenceReady && visual.videoReady;
  if (!visualReady) blockers.push('La referencia/video single 4.1 no están listos.');

  const located = speakerId ? locateVoiceProfile(project, speakerId) : undefined;
  const speakerLabel = located?.label || speakerId || 'desconocido';
  const provider = located?.profile.voiceProvider || 'elevenlabs';
  let voiceIdReady = false;
  let credentialVisible = false;

  if (!located) {
    blockers.push(speakerLabel + ': no existe perfil vocal persistente.');
  } else if (provider === 'elevenlabs') {
    voiceIdReady = isUsableCredentialValue(located.profile.voiceId) ||
      (speakerId === 'narrator' && isUsableCredentialValue(process.env.ELEVENLABS_NARRATOR_VOICE_ID));
    credentialVisible = hasUsableCredential('ELEVENLABS_API_KEY');
    if (!voiceIdReady) blockers.push(speakerLabel + ': falta voiceId persistente/fallback.');
    if (!credentialVisible) blockers.push(speakerLabel + ': falta ELEVENLABS_API_KEY.');
  } else if (provider === 'openai') {
    voiceIdReady = true;
    credentialVisible = hasUsableCredential('OPENAI_API_KEY');
    if (!credentialVisible) blockers.push(speakerLabel + ': falta OPENAI_API_KEY.');
  } else {
    blockers.push(speakerLabel + ': proveedor vocal ' + provider + ' no válido para render real.');
  }

  const checkpointPath = singleVoiceCheckpointPath(project, scene, shot);
  const voiceCheckpointReady = await fileExists(checkpointPath);
  const voiceEstimatedUsd = voiceCheckpointReady || !text
    ? 0
    : estimateOperationCost('voice', voiceCostUnits(text));

  const requiresLipSync = requiresLipSyncForSpeaker(project, speakerId);
  const lipSyncEstimatedUsd = requiresLipSync
    ? estimateOperationCost('lip-sync', shot.durationSeconds)
    : 0;

  if (requiresLipSync && process.env.ENABLE_LIPSYNC === 'false') {
    blockers.push(speakerLabel + ': ENABLE_LIPSYNC=false.');
  }
  if (requiresLipSync && !hasUsableCredential('FAL_KEY')) {
    blockers.push(speakerLabel + ': falta FAL_KEY para lip-sync.');
  }

  return {
    projectId: project.id,
    title: project.input.title,
    sceneOrder: scene.order,
    shotOrder: shot.order,
    shotId: shot.id,
    text,
    speakerId,
    speakerLabel,
    provider: provider as SingleRealPreflight['provider'],
    voiceIdReady,
    credentialVisible,
    visualReady,
    voiceCheckpointReady,
    voiceEstimatedUsd,
    requiresLipSync,
    lipSyncEstimatedUsd,
    blockers: [...new Set(blockers)]
  };
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
