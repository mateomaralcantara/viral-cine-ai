import { createHash } from 'node:crypto';
import type { FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import { AssetSchema, type Asset } from '@/lib/v7/domain/asset';
import { FilmV7Schema, type FilmV7 } from '@/lib/v7/domain/film';
import type { Take } from '@/lib/v7/domain/take';
import { VoiceProfileSchema, type VoiceProfile } from '@/lib/v7/domain/voice-profile';

export type LegacyV7Bundle = {
  film: FilmV7;
  assets: Asset[];
  voiceProfiles: VoiceProfile[];
};

function legacyId(kind: string, value: string) {
  return 'v7-' + kind + '-' + createHash('sha256').update(value).digest('hex').slice(0, 20);
}

function mediaAsset(
  project: FilmProject,
  type: Asset['type'],
  storagePath: string,
  context: { sceneId?: string; shotId?: string; takeId?: string; characterId?: string },
  createdAt: string
) {
  return AssetSchema.parse({
    id: legacyId('asset', project.id + '|' + type + '|' + storagePath),
    filmId: legacyId('film', project.id),
    type,
    storagePath,
    source: 'legacy-v6',
    ...context,
    version: 1,
    approved: true,
    createdAt
  });
}

function adaptShot(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot,
  sceneId: string,
  assets: Asset[]
) {
  const shotId = legacyId('shot', project.id + '|' + scene.id + '|' + shot.id);
  const takeId = legacyId('take', shotId + '|1');
  const takes: Take[] = [];

  let videoAssetId: string | undefined;
  let audioAssetId: string | undefined;
  let imageAssetId: string | undefined;

  if (shot.videoAsset) {
    const asset = mediaAsset(project, 'video', shot.videoAsset, { sceneId, shotId, takeId }, project.updatedAt);
    assets.push(asset);
    videoAssetId = asset.id;
  }
  if (shot.voiceAsset) {
    const asset = mediaAsset(project, 'voice', shot.voiceAsset, { sceneId, shotId, takeId }, project.updatedAt);
    assets.push(asset);
    audioAssetId = asset.id;
  }
  if (shot.imageAsset) {
    const asset = mediaAsset(project, 'image', shot.imageAsset, { sceneId, shotId, takeId }, project.updatedAt);
    assets.push(asset);
    imageAssetId = asset.id;
  }

  const approved = Boolean(shot.videoAsset && shot.status === 'ready');
  if (shot.videoAsset || shot.voiceAsset || shot.imageAsset) {
    takes.push({
      id: takeId,
      shotId,
      version: 1,
      status: approved
        ? 'approved'
        : shot.status === 'review-required'
          ? 'review-required'
          : 'succeeded',
      provider: shot.lastProvider,
      providerModel: shot.videoModelOverride,
      videoAssetId,
      audioAssetId,
      imageAssetId,
      estimatedCostUsd: shot.estimatedSpendUsd || 0,
      qualityScore: shot.qualityScore,
      qualityReportId: shot.qualityReportAsset
        ? legacyId('quality', project.id + '|' + shot.qualityReportAsset)
        : undefined,
      createdAt: shot.lastGenerationAt || project.updatedAt,
      approvedAt: approved ? project.updatedAt : undefined,
      legacyVideoAssetPath: shot.videoAsset
    });
  }

  return {
    id: shotId,
    sceneId,
    order: shot.order,
    title: shot.title || 'Toma ' + shot.order,
    intention: shot.motionSpec?.intention || '',
    durationSeconds: shot.durationSeconds,
    visualPrompt: shot.visualPrompt,
    camera: shot.camera,
    spokenText: shot.spokenText,
    speakerId: shot.speakerId,
    characterIds: [...shot.characterIds],
    characterStateIds: { ...(shot.characterStateIds || {}) },
    strategy: shot.pipelineVersion || 'legacy-v6',
    selectedTakeId: approved ? takeId : undefined,
    takes,
    metadata: {
      legacyShotId: shot.id,
      legacyStatus: shot.status,
      pipelineVersion: shot.pipelineVersion
    }
  };
}

function voiceProfilesFromLegacy(project: FilmProject) {
  const profiles: VoiceProfile[] = [];
  if (!project.plan) return profiles;

  for (const character of project.plan.characters) {
    profiles.push(VoiceProfileSchema.parse({
      id: legacyId('voice', project.id + '|' + character.id),
      characterId: character.id,
      provider: character.voiceProvider,
      providerVoiceId: character.voiceId,
      providerModel: character.voiceModel,
      language: project.input.language,
      timbre: character.voiceInstructions,
      speed: character.voiceSpeed || 1,
      stability: character.voiceStability,
      similarity: character.voiceSimilarity,
      emotionPresets: {},
      pronunciationDictionary: {},
      voiceVersion: 1,
      rightsStatus: 'unknown',
      approved: Boolean(character.voiceId || character.voiceProvider === 'openai')
    }));
  }

  if (project.narratorVoice) {
    profiles.push(VoiceProfileSchema.parse({
      id: legacyId('voice', project.id + '|narrator'),
      provider: project.narratorVoice.voiceProvider,
      providerVoiceId: project.narratorVoice.voiceId,
      providerModel: project.narratorVoice.voiceModel,
      language: project.input.language,
      timbre: project.narratorVoice.voiceInstructions,
      speed: project.narratorVoice.voiceSpeed || 1,
      stability: project.narratorVoice.voiceStability,
      similarity: project.narratorVoice.voiceSimilarity,
      emotionPresets: {},
      pronunciationDictionary: {},
      voiceVersion: 1,
      rightsStatus: 'unknown',
      approved: Boolean(project.narratorVoice.voiceId || project.narratorVoice.voiceProvider === 'openai')
    }));
  }

  for (const voice of project.supportVoices || []) {
    profiles.push(VoiceProfileSchema.parse({
      id: legacyId('voice', project.id + '|' + voice.id),
      provider: voice.voiceProvider,
      providerVoiceId: voice.voiceId,
      providerModel: voice.voiceModel,
      language: project.input.language,
      timbre: voice.voiceInstructions,
      speed: voice.voiceSpeed || 1,
      stability: voice.voiceStability,
      similarity: voice.voiceSimilarity,
      emotionPresets: {},
      pronunciationDictionary: {},
      voiceVersion: 1,
      rightsStatus: 'unknown',
      approved: Boolean(voice.voiceId || voice.voiceProvider === 'openai')
    }));
  }
  return profiles;
}

export function adaptLegacyProjectToV7(project: FilmProject): LegacyV7Bundle {
  if (!project.plan) throw new Error('El proyecto V6 no tiene plan.');
  const snapshot = JSON.stringify(project);
  const filmId = legacyId('film', project.id);
  const assets: Asset[] = [];
  const voiceProfiles = voiceProfilesFromLegacy(project);

  const actNumbers = [...new Set(project.plan.scenes.map((scene) => scene.act))].sort((a, b) => a - b);
  const acts = actNumbers.map((actNumber) => {
    const actId = legacyId('act', filmId + '|' + actNumber);
    const sequenceId = legacyId('sequence', actId + '|1');
    const scenes = project.plan!.scenes
      .filter((scene) => scene.act === actNumber)
      .map((scene) => {
        const sceneId = legacyId('scene', project.id + '|' + scene.id);
        return {
          id: sceneId,
          sequenceId,
          order: scene.order,
          title: scene.title,
          summary: scene.summary,
          durationSeconds: scene.durationSeconds,
          timeIndex: Math.max(0, scene.order - 1),
          characterIds: [...scene.characterIds],
          narrativeGoal: scene.summary,
          emotionalGoal: '',
          continuityNotes: [],
          shots: scene.shots.map((shot) => adaptShot(project, scene, shot, sceneId, assets)),
          metadata: {
            legacySceneId: scene.id,
            legacyStatus: scene.status,
            productionStrategy: scene.productionStrategy
          }
        };
      });

    return {
      id: actId,
      filmId,
      order: actNumber,
      title: 'Acto ' + actNumber,
      dramaticObjective: '',
      sequences: [{
        id: sequenceId,
        actId,
        order: 1,
        title: 'Secuencia ' + actNumber + '.1',
        objective: '',
        scenes
      }]
    };
  });

  const film = FilmV7Schema.parse({
    id: filmId,
    title: project.input.title,
    premise: project.input.premise,
    durationMinutes: project.input.durationMinutes,
    genre: project.input.genre,
    audience: project.input.audience,
    visualStyle: project.input.visualStyle,
    language: project.input.language,
    aspectRatio: project.input.aspectRatio,
    budgetUsd: project.input.budgetUsd,
    acts,
    characters: project.plan.characters.map((character) => ({
      id: character.id,
      filmId,
      name: character.name,
      role: character.role,
      age: character.age,
      appearance: character.appearance,
      personality: character.personality,
      identityLock: character.appearance,
      immutableTraits: [],
      voiceProfileId: voiceProfiles.find((voice) => voice.characterId === character.id)?.id,
      metadata: {
        legacyReferenceAsset: character.referenceAsset,
        legacyWardrobe: character.wardrobe
      }
    })),
    legacyProjectId: project.id,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    metadata: {
      source: 'viralcine-6',
      originalFinalVideoAsset: project.finalVideoAsset
    }
  });

  if (JSON.stringify(project) !== snapshot) {
    throw new Error('El adaptador V6→V7 modificó el proyecto V6 de entrada.');
  }

  return { film, assets, voiceProfiles };
}
