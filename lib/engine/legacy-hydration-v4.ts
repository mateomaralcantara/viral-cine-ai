import type { Character, FilmProject, FilmScene } from '@/lib/domain/schemas';

export type LegacyDialogueTurnPreview = {
  speakerId: string;
  speakerName: string;
  text: string;
  words: number;
};

export type LegacySceneHydrationPreview = {
  sceneId: string;
  sceneOrder: number;
  sceneTitle: string;
  durationSeconds: number;
  narrationWords: number;
  dialogueWords: number;
  parsedTurns: LegacyDialogueTurnPreview[];
  unresolvedDialogue: string[];
  currentShots: number;
  legacyMedia: string[];
  estimatedSpokenSegments: number;
  maximumSegments: number;
  fitsDuration: boolean;
};

export type LegacyHydrationPreview = {
  projectId: string;
  title: string;
  scenes: LegacySceneHydrationPreview[];
  totals: {
    scenes: number;
    scenesWithoutShots: number;
    scenesWithLegacyMedia: number;
    parsedDialogueTurns: number;
    unresolvedDialogueFragments: number;
    estimatedSpokenSegments: number;
    scenesOverCapacity: number;
  };
};

const MAX_WORDS_PER_SEGMENT = Math.floor(8 * 2.8);

export function buildLegacyHydrationPreview(project: FilmProject): LegacyHydrationPreview {
  const scenes = (project.plan?.scenes || []).map((scene) => previewScene(project.plan?.characters || [], scene));
  return {
    projectId: project.id,
    title: project.input.title,
    scenes,
    totals: {
      scenes: scenes.length,
      scenesWithoutShots: scenes.filter((scene) => scene.currentShots === 0).length,
      scenesWithLegacyMedia: scenes.filter((scene) => scene.legacyMedia.length > 0).length,
      parsedDialogueTurns: scenes.reduce((sum, scene) => sum + scene.parsedTurns.length, 0),
      unresolvedDialogueFragments: scenes.reduce((sum, scene) => sum + scene.unresolvedDialogue.length, 0),
      estimatedSpokenSegments: scenes.reduce((sum, scene) => sum + scene.estimatedSpokenSegments, 0),
      scenesOverCapacity: scenes.filter((scene) => !scene.fitsDuration).length
    }
  };
}

export function parseLegacyDialogue(characters: Character[], dialogue: string) {
  const text = dialogue.trim();
  if (!text) return { turns: [] as LegacyDialogueTurnPreview[], unresolved: [] as string[] };

  const byName = new Map(characters.map((character) => [normalize(character.name), character] as const));
  const names = characters.map((character) => escapeRegex(character.name)).sort((a, b) => b.length - a.length);
  const boundary = names.length ? new RegExp(`(?=\\b(?:${names.join('|')})\\s*:)`, 'gi') : null;
  const roughParts = text
    .split(/\r?\n|;/)
    .flatMap((part) => boundary ? part.split(boundary) : [part])
    .map((part) => part.trim())
    .filter(Boolean);

  const turns: LegacyDialogueTurnPreview[] = [];
  const unresolved: string[] = [];
  for (const fragment of roughParts) {
    const match = fragment.match(/^\s*([^:]{1,80})\s*:\s*(.+)$/s);
    if (!match) {
      unresolved.push(fragment);
      continue;
    }
    const character = byName.get(normalize(match[1]));
    const spoken = match[2].trim();
    if (!character || !spoken) {
      unresolved.push(fragment);
      continue;
    }
    turns.push({
      speakerId: character.id,
      speakerName: character.name,
      text: spoken,
      words: wordCount(spoken)
    });
  }
  return { turns, unresolved };
}

function previewScene(characters: Character[], scene: FilmScene): LegacySceneHydrationPreview {
  const parsed = parseLegacyDialogue(characters, scene.dialogue);
  const narrationWords = wordCount(scene.narration);
  const dialogueWords = parsed.turns.reduce((sum, turn) => sum + turn.words, 0);
  const narrationSegments = segmentsForWords(narrationWords);
  const dialogueSegments = parsed.turns.reduce((sum, turn) => sum + segmentsForWords(turn.words), 0);
  const estimatedSpokenSegments = narrationSegments + dialogueSegments;
  const maximumSegments = Math.max(1, Math.floor(scene.durationSeconds / 4));
  const legacyMedia = [
    scene.imageAsset ? `image=${scene.imageAsset}` : '',
    scene.voiceAsset ? `voice=${scene.voiceAsset}` : '',
    scene.videoAsset ? `video=${scene.videoAsset}` : '',
    scene.qualityReportAsset ? `quality=${scene.qualityReportAsset}` : ''
  ].filter(Boolean);

  return {
    sceneId: scene.id,
    sceneOrder: scene.order,
    sceneTitle: scene.title,
    durationSeconds: scene.durationSeconds,
    narrationWords,
    dialogueWords,
    parsedTurns: parsed.turns,
    unresolvedDialogue: parsed.unresolved,
    currentShots: scene.shots.length,
    legacyMedia,
    estimatedSpokenSegments,
    maximumSegments,
    fitsDuration: estimatedSpokenSegments <= maximumSegments
  };
}

function segmentsForWords(words: number) {
  return words > 0 ? Math.ceil(words / MAX_WORDS_PER_SEGMENT) : 0;
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}
