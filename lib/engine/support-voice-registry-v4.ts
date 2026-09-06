import { createHash } from 'node:crypto';
import type { FilmProject, SupportVoice } from '@/lib/domain/schemas';
import { buildLegacyMixedTurnPlan } from '@/lib/engine/legacy-mixed-turns-v4';

export type SupportVoiceRegistryPreview = {
  projectId: string;
  title: string;
  detectedLabels: string[];
  existing: SupportVoice[];
  missingLabels: string[];
  readyCount: number;
  missingVoiceIds: string[];
};

export function previewSupportVoiceRegistry(project: FilmProject): SupportVoiceRegistryPreview {
  const plan = buildLegacyMixedTurnPlan(project);
  const existing = project.supportVoices || [];
  const detectedLabels = plan.totals.supportVoiceLabels;
  const missingLabels = detectedLabels.filter((label) =>
    !existing.some((voice) => normalize(voice.label) === normalize(label))
  );
  const relevant = existing.filter((voice) =>
    detectedLabels.some((label) => normalize(label) === normalize(voice.label))
  );
  return {
    projectId: project.id,
    title: project.input.title,
    detectedLabels,
    existing: relevant,
    missingLabels,
    readyCount: relevant.filter(isVoiceReady).length,
    missingVoiceIds: relevant.filter((voice) => !isVoiceReady(voice)).map((voice) => voice.label)
  };
}

export function applySupportVoiceRegistry(project: FilmProject) {
  const preview = previewSupportVoiceRegistry(project);
  const mediaBefore = mediaReferenceSnapshot(project);
  const current = project.supportVoices || [];
  let created = 0;

  for (const label of preview.missingLabels) {
    current.push(createSupportVoice(label));
    created += 1;
  }
  project.supportVoices = current;

  const mediaAfter = mediaReferenceSnapshot(project);
  if (mediaBefore !== mediaAfter) {
    throw new Error('Protección de media: registrar voces secundarias cambió una referencia de asset.');
  }
  project.productionLog.push(
    `${new Date().toISOString()} Casting 4.0: ${created} voz/ces secundaria(s) registrada(s) como metadata. ` +
    'No se generó audio ni se modificó media existente.'
  );
  return { created, preview: previewSupportVoiceRegistry(project) };
}

export function supportVoiceId(label: string) {
  const digest = createHash('sha256').update(normalize(label)).digest('hex').slice(0, 12);
  return `support-${digest}`;
}

export function findVoiceProfile(project: FilmProject, speakerId: string | undefined) {
  if (!speakerId || speakerId === 'narrator') return undefined;
  return project.plan?.characters.find((item) => item.id === speakerId)
    || project.supportVoices?.find((item) => item.id === speakerId);
}

export function isVoiceReady(voice: Pick<SupportVoice, 'voiceProvider' | 'voiceId'>) {
  return voice.voiceProvider === 'openai' || (voice.voiceProvider === 'elevenlabs' && Boolean(voice.voiceId));
}

function createSupportVoice(label: string): SupportVoice {
  return {
    id: supportVoiceId(label),
    label,
    voiceInstructions: `Voz secundaria persistente para ${label}. Mantener identidad vocal consistente entre escenas.`,
    voiceProvider: 'elevenlabs',
    source: 'legacy-support'
  };
}

function mediaReferenceSnapshot(project: FilmProject) {
  return JSON.stringify((project.plan?.scenes || []).map((scene) => ({
    sceneId: scene.id,
    imageAsset: scene.imageAsset,
    voiceAsset: scene.voiceAsset,
    videoAsset: scene.videoAsset,
    qualityReportAsset: scene.qualityReportAsset,
    shots: scene.shots.map((shot) => ({
      id: shot.id,
      imageAsset: shot.imageAsset,
      voiceAsset: shot.voiceAsset,
      videoAsset: shot.videoAsset,
      baseVideoAsset: shot.baseVideoAsset,
      lipSyncAsset: shot.lipSyncAsset,
      alignmentAsset: shot.alignmentAsset
    }))
  })));
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9ñ]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
