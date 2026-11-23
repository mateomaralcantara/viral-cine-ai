import type { Character, FilmProject, FilmScene, FilmShot, SupportVoice } from '@/lib/domain/schemas';
import { classifyLegacyProjectShots } from '@/lib/engine/legacy-shot-classifier-v4';
import { parseLegacyDialogue } from '@/lib/engine/legacy-hydration-v4';

export type PlannedLegacyTurnKind = 'narrator' | 'character' | 'support' | 'unresolved';

export type PlannedLegacyTurn = {
  kind: PlannedLegacyTurnKind;
  speakerId?: string;
  speakerName: string;
  text: string;
  confidence: number;
  source: 'label' | 'carryover-narration' | 'carryover-dialogue' | 'ambiguous-unlabeled';
  estimatedStartSeconds: number;
  estimatedEndSeconds: number;
};

export type MixedShotTurnPlan = {
  sceneId: string;
  sceneOrder: number;
  sceneTitle: string;
  shotId: string;
  shotOrder: number;
  durationSeconds: number;
  originalSpokenText: string;
  originalMedia: string[];
  turns: PlannedLegacyTurn[];
  supportVoiceLabels: string[];
  unresolvedTurns: number;
  requiresShotSplit: boolean;
};

export type MixedTurnPlanReport = {
  projectId: string;
  title: string;
  rows: MixedShotTurnPlan[];
  totals: {
    mixedShots: number;
    plannedTurns: number;
    narratorTurns: number;
    characterTurns: number;
    supportTurns: number;
    unresolvedTurns: number;
    supportVoiceLabels: string[];
  };
};

type RawTurn = Omit<PlannedLegacyTurn, 'estimatedStartSeconds' | 'estimatedEndSeconds'>;

export function buildLegacyMixedTurnPlan(project: FilmProject): MixedTurnPlanReport {
  const classification = classifyLegacyProjectShots(project);
  const ambiguousShotIds = new Set(
    classification.rows
      .filter((row) => row.classification === 'ambiguous' && row.spokenText.trim() && !row.currentSpeakerId)
      .map((row) => row.shotId)
  );
  const supportVoices = project.supportVoices || [];

  const rows = (project.plan?.scenes || []).flatMap((scene) =>
    scene.shots
      .filter((shot) => ambiguousShotIds.has(shot.id))
      .map((shot) => planMixedShot(project.plan?.characters || [], supportVoices, scene, shot))
  );
  const supportVoiceLabels = [...new Set(rows.flatMap((row) => row.supportVoiceLabels))].sort();

  return {
    projectId: project.id,
    title: project.input.title,
    rows,
    totals: {
      mixedShots: rows.length,
      plannedTurns: rows.reduce((sum, row) => sum + row.turns.length, 0),
      narratorTurns: rows.reduce((sum, row) => sum + row.turns.filter((turn) => turn.kind === 'narrator').length, 0),
      characterTurns: rows.reduce((sum, row) => sum + row.turns.filter((turn) => turn.kind === 'character').length, 0),
      supportTurns: rows.reduce((sum, row) => sum + row.turns.filter((turn) => turn.kind === 'support').length, 0),
      unresolvedTurns: rows.reduce((sum, row) => sum + row.unresolvedTurns, 0),
      supportVoiceLabels
    }
  };
}

function planMixedShot(
  characters: Character[],
  supportVoices: SupportVoice[],
  scene: FilmScene,
  shot: FilmShot
): MixedShotTurnPlan {
  const rawTurns = splitIntoRawTurns(characters, supportVoices, scene, shot.spokenText);
  const turns = addEstimatedTiming(rawTurns, shot.durationSeconds);
  const originalMedia = [
    shot.imageAsset ? `image=${shot.imageAsset}` : '',
    shot.voiceAsset ? `voice=${shot.voiceAsset}` : '',
    shot.videoAsset ? `video=${shot.videoAsset}` : '',
    shot.baseVideoAsset ? `baseVideo=${shot.baseVideoAsset}` : '',
    shot.lipSyncAsset ? `lipSync=${shot.lipSyncAsset}` : '',
    shot.alignmentAsset ? `alignment=${shot.alignmentAsset}` : ''
  ].filter(Boolean);

  return {
    sceneId: scene.id,
    sceneOrder: scene.order,
    sceneTitle: scene.title,
    shotId: shot.id,
    shotOrder: shot.order,
    durationSeconds: shot.durationSeconds,
    originalSpokenText: shot.spokenText,
    originalMedia,
    turns,
    supportVoiceLabels: [...new Set(turns.filter((turn) => turn.kind === 'support').map((turn) => turn.speakerName))],
    unresolvedTurns: turns.filter((turn) => turn.kind === 'unresolved').length,
    requiresShotSplit: turns.length > 1 || turns.some((turn) => turn.kind === 'support' || turn.kind === 'unresolved')
  };
}

function splitIntoRawTurns(
  characters: Character[],
  supportVoices: SupportVoice[],
  scene: FilmScene,
  spokenText: string
): RawTurn[] {
  const labelMatches = [...spokenText.matchAll(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{0,50})\s*:/g)];
  const turns: RawTurn[] = [];

  const firstLabelStart = labelMatches[0]?.index ?? spokenText.length;
  const prefix = spokenText.slice(0, firstLabelStart).trim();
  if (prefix) turns.push(resolveUnlabeledPrefix(characters, scene, prefix));

  for (let index = 0; index < labelMatches.length; index += 1) {
    const match = labelMatches[index];
    const label = match[1].trim();
    const textStart = (match.index || 0) + match[0].length;
    const textEnd = labelMatches[index + 1]?.index ?? spokenText.length;
    const text = spokenText.slice(textStart, textEnd).trim();
    if (!text) continue;
    turns.push(resolveLabeledTurn(characters, supportVoices, label, text));
  }

  if (!turns.length && spokenText.trim()) {
    turns.push(resolveUnlabeledPrefix(characters, scene, spokenText.trim()));
  }
  return turns;
}

function resolveLabeledTurn(
  characters: Character[],
  supportVoices: SupportVoice[],
  label: string,
  text: string
): RawTurn {
  if (normalize(label) === 'narrador') {
    return {
      kind: 'narrator', speakerId: 'narrator', speakerName: 'Narrador', text,
      confidence: 1, source: 'label'
    };
  }
  const character = characters.find((item) => normalize(item.name) === normalize(label));
  if (character) {
    return {
      kind: 'character', speakerId: character.id, speakerName: character.name, text,
      confidence: 1, source: 'label'
    };
  }
  const supportVoice = supportVoices.find((item) => normalize(item.label) === normalize(label));
  return {
    kind: 'support', speakerId: supportVoice?.id, speakerName: supportVoice?.label || canonicalLabel(label), text,
    confidence: 1, source: 'label'
  };
}

function resolveUnlabeledPrefix(characters: Character[], scene: FilmScene, text: string): RawTurn {
  const normalizedText = normalize(text);
  const narrationMatch = containsPhrase(normalize(scene.narration), normalizedText);
  const parsed = parseLegacyDialogue(characters, scene.dialogue);
  const dialogueMatches = parsed.turns.filter((turn) => containsPhrase(normalize(turn.text), normalizedText));

  if (narrationMatch && dialogueMatches.length) {
    return {
      kind: 'unresolved', speakerName: 'Sin resolver', text,
      confidence: 0, source: 'ambiguous-unlabeled'
    };
  }
  if (narrationMatch) {
    return {
      kind: 'narrator', speakerId: 'narrator', speakerName: 'Narrador', text,
      confidence: 0.995, source: 'carryover-narration'
    };
  }
  if (dialogueMatches.length === 1) {
    const match = dialogueMatches[0];
    return {
      kind: 'character', speakerId: match.speakerId, speakerName: match.speakerName, text,
      confidence: 0.995, source: 'carryover-dialogue'
    };
  }
  return {
    kind: 'unresolved', speakerName: 'Sin resolver', text,
    confidence: 0, source: 'ambiguous-unlabeled'
  };
}

function addEstimatedTiming(turns: RawTurn[], durationSeconds: number): PlannedLegacyTurn[] {
  const weights = turns.map((turn) => Math.max(1, wordCount(turn.text)));
  const total = Math.max(1, weights.reduce((sum, value) => sum + value, 0));
  let cursor = 0;
  return turns.map((turn, index) => {
    const start = cursor;
    const end = index === turns.length - 1
      ? durationSeconds
      : Math.min(durationSeconds, cursor + (durationSeconds * weights[index]) / total);
    cursor = end;
    return {
      ...turn,
      estimatedStartSeconds: round3(start),
      estimatedEndSeconds: round3(end)
    };
  });
}

function containsPhrase(container: string, phrase: string) {
  return Boolean(container && phrase && container.includes(phrase));
}

function canonicalLabel(value: string) {
  const lower = value.trim().toLocaleLowerCase();
  return lower ? lower.charAt(0).toLocaleUpperCase() + lower.slice(1) : value.trim();
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

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}
