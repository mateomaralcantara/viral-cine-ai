import { randomUUID } from 'node:crypto';
import type { Character, FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import { resolveSingleSpeakerId } from '@/lib/engine/speaker-resolution';

const AMBIGUOUS_MIGRATION_ISSUE = 'Migración 4.0: hablante ambiguo. Asigna speakerId manualmente antes de producir este segmento.';

export type SpeakerCandidate = { id: string; name: string };

export type SpeakerSuggestion = {
  sceneId: string;
  sceneOrder: number;
  sceneTitle: string;
  shotId: string;
  shotOrder: number;
  shotTitle: string;
  spokenText: string;
  candidates: SpeakerCandidate[];
  suggestedSpeakerId?: string;
  suggestedSpeakerName?: string;
  confidence: number;
  reason: string;
  existingMedia: boolean;
};

export type CastingState = {
  projectId: string;
  title: string;
  characters: Array<{
    id: string;
    name: string;
    role: string;
    voiceProvider: 'elevenlabs' | 'openai' | 'offline';
    voiceId?: string;
    voiceReady: boolean;
    voiceInstructions: string;
    voiceStability?: number;
    voiceSimilarity?: number;
    voiceStyle?: number;
    voiceSpeed?: number;
  }>;
  unresolved: SpeakerSuggestion[];
  totals: {
    spokenShots: number;
    resolvedShots: number;
    unresolvedShots: number;
    highConfidence: number;
    existingMediaUnresolved: number;
    voicesAssigned: number;
    voicesMissing: number;
  };
};

export function buildCastingState(project: FilmProject): CastingState {
  if (!project.plan) return emptyCastingState(project);

  let spokenShots = 0;
  let resolvedShots = 0;
  const unresolved: SpeakerSuggestion[] = [];

  for (const scene of project.plan.scenes) {
    for (const shot of scene.shots) {
      if (!shot.spokenText.trim()) continue;
      spokenShots += 1;
      if (shotSpeakerId(shot)) resolvedShots += 1;
      else unresolved.push(suggestSpeaker(project, scene, shot));
    }
  }

  const characters: CastingState['characters'] = project.plan.characters.map((character) => {
    const voiceProvider: 'elevenlabs' | 'openai' | 'offline' = character.voiceProvider || 'elevenlabs';
    const voiceReady = voiceProvider === 'openai' || (voiceProvider === 'elevenlabs' && Boolean(character.voiceId?.trim()));
    return {
      id: character.id,
      name: character.name,
      role: character.role,
      voiceProvider,
      voiceId: character.voiceId,
      voiceReady,
      voiceInstructions: character.voiceInstructions,
      voiceStability: character.voiceStability,
      voiceSimilarity: character.voiceSimilarity,
      voiceStyle: character.voiceStyle,
      voiceSpeed: character.voiceSpeed
    };
  });
  const voicesAssigned = characters.filter((character) => character.voiceReady).length;

  return {
    projectId: project.id,
    title: project.input.title,
    characters,
    unresolved,
    totals: {
      spokenShots,
      resolvedShots,
      unresolvedShots: unresolved.length,
      highConfidence: unresolved.filter((item) => Boolean(item.suggestedSpeakerId) && item.confidence >= 0.92).length,
      existingMediaUnresolved: unresolved.filter((item) => item.existingMedia).length,
      voicesAssigned,
      voicesMissing: Math.max(0, characters.length - voicesAssigned)
    }
  };
}

export function suggestSpeaker(project: FilmProject, scene: FilmScene, shot: FilmShot): SpeakerSuggestion {
  if (!project.plan) throw new Error('El proyecto no tiene plan.');

  const byId = new Map<string, Character>();
  for (const character of project.plan.characters) byId.set(character.id, character);

  const candidateIds = unique([...(shot.characterIds || []), ...(scene.characterIds || [])]).filter((id) => byId.has(id));
  const candidates: SpeakerCandidate[] = candidateIds.map((id) => ({ id, name: byId.get(id)!.name }));
  const spoken = normalizeText(shot.spokenText);

  const existingLine = shot.dialogueLines.find((line) => normalizeText(line.text) === spoken && byId.has(line.speakerId));
  if (existingLine) {
    return makeSuggestion(project, scene, shot, candidates, existingLine.speakerId, 0.995, 'Coincidencia exacta con dialogueLines existente.');
  }

  const turnMatches = scene.dialogueTurns
    .filter((turn) => byId.has(turn.speakerId))
    .map((turn) => ({ turn, score: textSimilarity(shot.spokenText, turn.text) }))
    .sort((left, right) => right.score - left.score);
  const topTurn = turnMatches[0];
  const secondTurn = turnMatches[1];
  if (topTurn && topTurn.score >= 0.82 && (!secondTurn || topTurn.score - secondTurn.score >= 0.08)) {
    const confidence = topTurn.score >= 0.98 ? 0.99 : topTurn.score >= 0.9 ? 0.97 : 0.94;
    return makeSuggestion(project, scene, shot, candidates, topTurn.turn.speakerId, confidence, 'El texto coincide con un dialogueTurn estructurado de la escena.');
  }

  const labelled = labelledDialogueMatches(project.plan.characters, scene.dialogue, shot.spokenText)
    .sort((left, right) => right.score - left.score);
  const topLabel = labelled[0];
  const secondLabel = labelled[1];
  if (topLabel && topLabel.score >= 0.78 && (!secondLabel || topLabel.score - secondLabel.score >= 0.08)) {
    const confidence = topLabel.score >= 0.95 ? 0.98 : 0.94;
    return makeSuggestion(project, scene, shot, candidates, topLabel.character.id, confidence, 'El diálogo legado contiene una línea etiquetada con el nombre del personaje.');
  }

  const prefixCharacter = project.plan.characters.find((character) => {
    const prefix = normalizeText(character.name);
    return spoken.startsWith(`${prefix} `) || spoken === prefix;
  });
  if (prefixCharacter) {
    return makeSuggestion(project, scene, shot, candidates, prefixCharacter.id, 0.95, 'El texto hablado comienza con el nombre del personaje.');
  }

  if (candidates.length === 1) {
    return makeSuggestion(project, scene, shot, candidates, candidates[0].id, 0.94, 'Solo existe un personaje elegible en el reparto de la toma/escena.');
  }

  return makeSuggestion(
    project,
    scene,
    shot,
    candidates,
    undefined,
    0,
    candidates.length
      ? 'Hay varios personajes elegibles y no existe evidencia suficiente para decidir automáticamente.'
      : 'La toma no contiene candidatos de reparto válidos; requiere selección manual.'
  );
}

export function applySpeakerAssignment(
  project: FilmProject,
  shotId: string,
  speakerId: string,
  source: 'manual' | 'auto' = 'manual',
  confidence = source === 'manual' ? 1 : 0.92
) {
  if (!project.plan) throw new Error('El proyecto no tiene plan.');
  const character = project.plan.characters.find((item) => item.id === speakerId);
  if (!character) throw new Error(`No existe el personaje '${speakerId}'.`);
  const located = findShot(project, shotId);
  if (!located) throw new Error(`No existe el segmento '${shotId}'.`);
  const { scene, shot } = located;
  if (!shot.spokenText.trim()) throw new Error('El segmento no contiene texto hablado.');

  shot.speakerId = character.id;
  if (!shot.dialogueLines.length) {
    shot.dialogueLines = [{ id: randomUUID(), speakerId: character.id, text: shot.spokenText.trim(), startSeconds: 0 }];
  } else if (shot.dialogueLines.length === 1 && normalizeText(shot.dialogueLines[0].text) === normalizeText(shot.spokenText)) {
    shot.dialogueLines[0].speakerId = character.id;
  }
  shot.preflightIssues = (shot.preflightIssues || []).filter((issue) => issue !== AMBIGUOUS_MIGRATION_ISSUE);
  if (!shot.preflightIssues.length) shot.preflightIssues = undefined;
  shot.promptLocked = false;

  project.productionLog.push(
    `${new Date().toISOString()} Reconciliación de hablante 4.0: escena ${scene.order}, segmento ${shot.order} -> ${character.name} (${source}, confianza ${confidence.toFixed(2)}). Media existente preservada.`
  );
  return { scene, shot, character };
}

export function applySafeSpeakerSuggestions(project: FilmProject, minimumConfidence = 0.92) {
  const state = buildCastingState(project);
  let applied = 0;
  for (const suggestion of state.unresolved) {
    if (!suggestion.suggestedSpeakerId || suggestion.confidence < minimumConfidence) continue;
    applySpeakerAssignment(project, suggestion.shotId, suggestion.suggestedSpeakerId, 'auto', suggestion.confidence);
    applied += 1;
  }
  return applied;
}

export function clearSpeakerAssignment(project: FilmProject, shotId: string) {
  const located = findShot(project, shotId);
  if (!located) throw new Error(`No existe el segmento '${shotId}'.`);
  const { scene, shot } = located;
  shot.speakerId = undefined;
  shot.dialogueLines = [];
  shot.preflightIssues = unique([...(shot.preflightIssues || []), AMBIGUOUS_MIGRATION_ISSUE]);
  shot.promptLocked = false;
  project.productionLog.push(
    `${new Date().toISOString()} Reconciliación de hablante 4.0 revertida: escena ${scene.order}, segmento ${shot.order}. Media existente preservada.`
  );
}

export function setCharacterVoice(
  project: FilmProject,
  characterId: string,
  input: {
    provider: 'elevenlabs' | 'openai' | 'offline';
    voiceId?: string;
    stability?: number;
    similarity?: number;
    style?: number;
    speed?: number;
  }
) {
  if (!project.plan) throw new Error('El proyecto no tiene plan.');
  const character = project.plan.characters.find((item) => item.id === characterId);
  if (!character) throw new Error(`No existe el personaje '${characterId}'.`);

  character.voiceProvider = input.provider;
  character.voiceId = cleanOptional(input.voiceId);
  character.voiceStability = boundedOptional(input.stability, 0, 1, 'stability');
  character.voiceSimilarity = boundedOptional(input.similarity, 0, 1, 'similarity');
  character.voiceStyle = boundedOptional(input.style, 0, 1, 'style');
  character.voiceSpeed = boundedOptional(input.speed, 0.7, 1.2, 'speed');
  project.productionLog.push(
    `${new Date().toISOString()} Voice Casting Manager 4.0: ${character.name} -> ${input.provider}, voiceId ${character.voiceId ? 'configurada' : 'sin asignar'}. No se generó audio.`
  );
  return character;
}

function emptyCastingState(project: FilmProject): CastingState {
  return {
    projectId: project.id,
    title: project.input.title,
    characters: [],
    unresolved: [],
    totals: {
      spokenShots: 0,
      resolvedShots: 0,
      unresolvedShots: 0,
      highConfidence: 0,
      existingMediaUnresolved: 0,
      voicesAssigned: 0,
      voicesMissing: 0
    }
  };
}

function makeSuggestion(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot,
  candidates: SpeakerCandidate[],
  suggestedSpeakerId: string | undefined,
  confidence: number,
  reason: string
): SpeakerSuggestion {
  const character = suggestedSpeakerId ? project.plan?.characters.find((item) => item.id === suggestedSpeakerId) : undefined;
  const expandedCandidates = character && !candidates.some((candidate) => candidate.id === character.id)
    ? [...candidates, { id: character.id, name: character.name }]
    : candidates;
  return {
    sceneId: scene.id,
    sceneOrder: scene.order,
    sceneTitle: scene.title,
    shotId: shot.id,
    shotOrder: shot.order,
    shotTitle: shot.title,
    spokenText: shot.spokenText,
    candidates: expandedCandidates,
    suggestedSpeakerId,
    suggestedSpeakerName: character?.name,
    confidence,
    reason,
    existingMedia: Boolean(shot.videoAsset || shot.voiceAsset || shot.baseVideoAsset || shot.lipSyncAsset)
  };
}

function findShot(project: FilmProject, shotId: string) {
  for (const scene of project.plan?.scenes || []) {
    const shot = scene.shots.find((item) => item.id === shotId);
    if (shot) return { scene, shot };
  }
  return undefined;
}

function labelledDialogueMatches(characters: Character[], dialogue: string, spokenText: string) {
  const target = normalizeText(spokenText);
  const matches: Array<{ character: Character; score: number }> = [];
  for (const rawLine of dialogue.split(/\r?\n/)) {
    const match = rawLine.match(/^\s*([^:]{1,60})\s*:\s*(.+)$/);
    if (!match) continue;
    const label = normalizeText(match[1]);
    const character = characters.find((item) => normalizeText(item.name) === label);
    if (!character) continue;
    const score = textSimilarity(target, match[2]);
    if (score > 0) matches.push({ character, score });
  }
  return matches;
}

function textSimilarity(left: string, right: string) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;

  if (a.includes(b) || b.includes(a)) {
    const shorterText = a.length <= b.length ? a : b;
    const longerText = a.length > b.length ? a : b;
    const ratio = shorterText.length / Math.max(1, longerText.length);
    const tokenCount = shorterText.split(' ').filter(Boolean).length;
    if (ratio >= 0.8) return ratio;
    if (tokenCount >= 4 && ratio >= 0.55) return Math.max(0.84, ratio);
  }

  const aTokens = new Set(a.split(' ').filter(Boolean));
  const bTokens = new Set(b.split(' ').filter(Boolean));
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return union ? intersection / union : 0;
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9ñ]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function shotSpeakerId(shot: FilmShot) {
  return resolveSingleSpeakerId(shot);
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
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
