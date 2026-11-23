import type { Character, FilmProject, NarratorVoice, SupportVoice } from '@/lib/domain/schemas';

export type VoiceProvider = 'elevenlabs' | 'openai' | 'offline';
export type VoiceProfileKind = 'narrator' | 'character' | 'support';

export type VoiceProfileView = {
  id: string;
  label: string;
  kind: VoiceProfileKind;
  role?: string;
  voiceProvider: VoiceProvider;
  voiceId?: string;
  voiceReady: boolean;
  voiceInstructions: string;
  voiceModel?: string;
  voiceStability?: number;
  voiceSimilarity?: number;
  voiceStyle?: number;
  voiceSpeed?: number;
};

export type VoiceCastingState = {
  projectId: string;
  title: string;
  profiles: VoiceProfileView[];
  totals: {
    profiles: number;
    ready: number;
    missing: number;
    narratorReady: boolean;
    characterReady: number;
    characterTotal: number;
    supportReady: number;
    supportTotal: number;
  };
};

export type VoiceProfileInput = {
  provider: VoiceProvider;
  voiceId?: string;
  model?: string;
  instructions?: string;
  stability?: number;
  similarity?: number;
  style?: number;
  speed?: number;
};

export function buildVoiceCastingState(project: FilmProject): VoiceCastingState {
  const narrator = narratorProfile(project);
  const characters = (project.plan?.characters || []).map((character) => characterView(character));
  const supports = (project.supportVoices || []).map((voice) => supportView(voice));
  const profiles = [narratorView(narrator), ...characters, ...supports];
  const ready = profiles.filter((profile) => profile.voiceReady).length;
  return {
    projectId: project.id,
    title: project.input.title,
    profiles,
    totals: {
      profiles: profiles.length,
      ready,
      missing: Math.max(0, profiles.length - ready),
      narratorReady: profiles[0]?.voiceReady || false,
      characterReady: characters.filter((profile) => profile.voiceReady).length,
      characterTotal: characters.length,
      supportReady: supports.filter((profile) => profile.voiceReady).length,
      supportTotal: supports.length
    }
  };
}

export function setVoiceProfile(project: FilmProject, profileId: string, input: VoiceProfileInput) {
  const mediaBefore = mediaReferenceSnapshot(project);
  const target = locateVoiceProfile(project, profileId);
  if (!target) throw new Error(`No existe el perfil vocal '${profileId}'.`);

  applySettings(target.profile, input);
  if (target.kind === 'narrator') project.narratorVoice = target.profile as NarratorVoice;

  const mediaAfter = mediaReferenceSnapshot(project);
  if (mediaBefore !== mediaAfter) {
    throw new Error('Protección de media: actualizar el casting vocal cambió una referencia de asset.');
  }

  project.productionLog.push(
    `${new Date().toISOString()} Voice Casting 4.0: ${target.label} (${target.kind}) -> ${input.provider}, ` +
    `voiceId ${target.profile.voiceId ? 'configurada' : 'sin asignar'}. No se generó audio ni se modificó media.`
  );
  return target.profile;
}

export function narratorProfile(project: FilmProject): NarratorVoice {
  return project.narratorVoice || {
    id: 'narrator',
    label: 'Narrador',
    voiceInstructions: 'Narración cinematográfica, clara, sobria y consistente entre escenas.',
    voiceProvider: 'elevenlabs'
  };
}

export function voiceProfileReady(profile: Pick<VoiceProfileView, 'voiceProvider' | 'voiceId'>) {
  if (profile.voiceProvider === 'openai') return true;
  if (profile.voiceProvider === 'elevenlabs') return Boolean(profile.voiceId?.trim());
  return false;
}

export function locateVoiceProfile(project: FilmProject, profileId: string): {
  kind: VoiceProfileKind;
  label: string;
  profile: NarratorVoice | Character | SupportVoice;
} | undefined {
  if (profileId === 'narrator') {
    const profile = narratorProfile(project);
    return { kind: 'narrator', label: 'Narrador', profile };
  }
  const character = project.plan?.characters.find((item) => item.id === profileId);
  if (character) return { kind: 'character', label: character.name, profile: character };
  const support = project.supportVoices?.find((item) => item.id === profileId);
  if (support) return { kind: 'support', label: support.label, profile: support };
  return undefined;
}

function narratorView(profile: NarratorVoice): VoiceProfileView {
  return baseView(profile, 'Narrador', 'narrator');
}

function characterView(profile: Character): VoiceProfileView {
  return { ...baseView(profile, profile.name, 'character'), role: profile.role };
}

function supportView(profile: SupportVoice): VoiceProfileView {
  return baseView(profile, profile.label, 'support');
}

function baseView(
  profile: NarratorVoice | Character | SupportVoice,
  label: string,
  kind: VoiceProfileKind
): VoiceProfileView {
  const view: VoiceProfileView = {
    id: profile.id,
    label,
    kind,
    voiceProvider: profile.voiceProvider || 'elevenlabs',
    voiceId: profile.voiceId,
    voiceReady: false,
    voiceInstructions: profile.voiceInstructions || '',
    voiceModel: profile.voiceModel,
    voiceStability: profile.voiceStability,
    voiceSimilarity: profile.voiceSimilarity,
    voiceStyle: profile.voiceStyle,
    voiceSpeed: profile.voiceSpeed
  };
  view.voiceReady = voiceProfileReady(view);
  return view;
}

function applySettings(
  profile: NarratorVoice | Character | SupportVoice,
  input: VoiceProfileInput
) {
  profile.voiceProvider = input.provider;
  profile.voiceId = cleanOptional(input.voiceId);
  if (input.model !== undefined) profile.voiceModel = cleanOptional(input.model);
  if (input.instructions !== undefined) profile.voiceInstructions = input.instructions.trim();
  profile.voiceStability = boundedOptional(input.stability, 0, 1, 'stability');
  profile.voiceSimilarity = boundedOptional(input.similarity, 0, 1, 'similarity');
  profile.voiceStyle = boundedOptional(input.style, 0, 1, 'style');
  profile.voiceSpeed = boundedOptional(input.speed, 0.7, 1.2, 'speed');
}

function cleanOptional(value?: string) {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function boundedOptional(value: number | undefined, minimum: number, maximum: number, label: string) {
  if (value === undefined || Number.isNaN(value)) return undefined;
  if (value < minimum || value > maximum) throw new Error(`${label} debe estar entre ${minimum} y ${maximum}.`);
  return value;
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
