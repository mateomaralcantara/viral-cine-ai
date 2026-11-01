import type { FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import { parseLegacyDialogue } from '@/lib/engine/legacy-hydration-v4';
import { resolveSingleSpeakerId } from '@/lib/engine/speaker-resolution';

export type LegacyShotClassification = {
  sceneId: string;
  sceneOrder: number;
  sceneTitle: string;
  shotId: string;
  shotOrder: number;
  spokenText: string;
  currentSpeakerId?: string;
  classification: 'silence' | 'narrator' | 'character' | 'ambiguous';
  suggestedSpeakerId?: string;
  suggestedSpeakerName?: string;
  confidence: number;
  reason: string;
  narrationScore: number;
  bestDialogueScore: number;
  speakerLabels: string[];
  existingMedia: string[];
};

export type LegacyShotClassificationReport = {
  projectId: string;
  title: string;
  rows: LegacyShotClassification[];
  totals: {
    shots: number;
    spokenShots: number;
    narrator: number;
    character: number;
    ambiguous: number;
    silence: number;
    existingSpeaker: number;
    spokenWithMedia: number;
  };
};

export function classifyLegacyProjectShots(project: FilmProject): LegacyShotClassificationReport {
  const rows = (project.plan?.scenes || []).flatMap((scene) => classifyScene(project, scene));
  return {
    projectId: project.id,
    title: project.input.title,
    rows,
    totals: {
      shots: rows.length,
      spokenShots: rows.filter((row) => row.spokenText.trim()).length,
      narrator: rows.filter((row) => row.classification === 'narrator').length,
      character: rows.filter((row) => row.classification === 'character').length,
      ambiguous: rows.filter((row) => row.classification === 'ambiguous').length,
      silence: rows.filter((row) => row.classification === 'silence').length,
      existingSpeaker: rows.filter((row) => Boolean(row.currentSpeakerId)).length,
      spokenWithMedia: rows.filter((row) => row.spokenText.trim() && row.existingMedia.length > 0).length
    }
  };
}

function classifyScene(project: FilmProject, scene: FilmScene) {
  const characters = project.plan?.characters || [];
  const parsed = parseLegacyDialogue(characters, scene.dialogue);
  const sceneLabels = extractDialogueLabels(scene.dialogue);
  return scene.shots.map((shot) => classifyShot(scene, shot, parsed.turns, sceneLabels));
}

function classifyShot(
  scene: FilmScene,
  shot: FilmShot,
  turns: ReturnType<typeof parseLegacyDialogue>['turns'],
  sceneLabels: string[]
): LegacyShotClassification {
  const spoken = shot.spokenText.trim();
  const speakerLabels = labelsPresentInShot(spoken, sceneLabels);
  const existingMedia = [
    shot.voiceAsset ? `voice=${shot.voiceAsset}` : '',
    shot.videoAsset ? `video=${shot.videoAsset}` : '',
    shot.baseVideoAsset ? `baseVideo=${shot.baseVideoAsset}` : '',
    shot.lipSyncAsset ? `lipSync=${shot.lipSyncAsset}` : '',
    shot.imageAsset ? `image=${shot.imageAsset}` : ''
  ].filter(Boolean);

  if (!spoken) {
    return row(scene, shot, {
      classification: 'silence', confidence: 1, reason: 'La toma no contiene spokenText.',
      narrationScore: 0, bestDialogueScore: 0, speakerLabels, existingMedia
    });
  }

  const normalizedSpoken = normalize(spoken);
  const normalizedNarration = normalize(scene.narration);
  const narrationExact = containsPhrase(normalizedNarration, normalizedSpoken);
  const narrationScore = narrationExact ? 1 : orderedCoverage(normalizedSpoken, normalizedNarration);

  const dialogueMatches = turns
    .map((turn) => {
      const normalizedTurn = normalize(turn.text);
      const exact = containsPhrase(normalizedTurn, normalizedSpoken) || containsPhrase(normalizedSpoken, normalizedTurn);
      return {
        turn,
        score: exact ? 1 : orderedCoverage(normalizedSpoken, normalizedTurn),
        exact
      };
    })
    .sort((a, b) => b.score - a.score);
  const best = dialogueMatches[0];
  const second = dialogueMatches[1];
  const bestDialogueScore = best?.score || 0;

  if (speakerLabels.length >= 2) {
    return row(scene, shot, {
      classification: 'ambiguous', confidence: 0,
      reason: `La toma contiene varios hablantes etiquetados (${speakerLabels.join(', ')}); debe dividirse antes de asignar speakerId.`,
      narrationScore, bestDialogueScore, speakerLabels, existingMedia
    });
  }

  if (speakerLabels.length === 1) {
    const prefix = textBeforeFirstSpeakerLabel(spoken, speakerLabels[0]);
    if (wordCount(prefix) >= 3 && narrationScore < 0.15) {
      return row(scene, shot, {
        classification: 'ambiguous', confidence: 0,
        reason: `La toma contiene texto previo sin etiqueta antes de ${speakerLabels[0]}; puede ser continuación de otro hablante y debe dividirse antes de asignar speakerId.`,
        narrationScore, bestDialogueScore, speakerLabels, existingMedia
      });
    }
  }

  if (speakerLabels.length === 1 && narrationScore >= 0.15) {
    return row(scene, shot, {
      classification: 'ambiguous', confidence: 0,
      reason: `La toma mezcla narración con diálogo etiquetado de ${speakerLabels[0]}; debe dividirse antes de lip-sync.`,
      narrationScore, bestDialogueScore, speakerLabels, existingMedia
    });
  }

  if (narrationExact && !(best?.exact)) {
    return row(scene, shot, {
      classification: 'narrator', suggestedSpeakerId: 'narrator', suggestedSpeakerName: 'Narrador',
      confidence: 0.995, reason: 'spokenText aparece como frase continua dentro de la narración de la escena.',
      narrationScore, bestDialogueScore, speakerLabels, existingMedia
    });
  }

  if (best?.exact && !narrationExact && !hasDialogueTie(dialogueMatches)) {
    return row(scene, shot, {
      classification: 'character', suggestedSpeakerId: best.turn.speakerId, suggestedSpeakerName: best.turn.speakerName,
      confidence: 0.995, reason: `spokenText coincide directamente con el parlamento legacy de ${best.turn.speakerName}.`,
      narrationScore, bestDialogueScore, speakerLabels, existingMedia
    });
  }

  if (narrationExact && best?.exact) {
    return row(scene, shot, {
      classification: 'ambiguous', confidence: 0, reason: 'El mismo texto aparece tanto en narración como en diálogo; requiere revisión manual.',
      narrationScore, bestDialogueScore, speakerLabels, existingMedia
    });
  }

  const words = wordCount(spoken);
  if (words >= 5 && narrationScore >= 0.92 && narrationScore >= bestDialogueScore + 0.12) {
    return row(scene, shot, {
      classification: 'narrator', suggestedSpeakerId: 'narrator', suggestedSpeakerName: 'Narrador',
      confidence: Math.min(0.97, narrationScore), reason: 'Coincidencia secuencial fuerte con la narración y margen suficiente sobre cualquier parlamento.',
      narrationScore, bestDialogueScore, speakerLabels, existingMedia
    });
  }

  const dialogueMargin = bestDialogueScore - Math.max(narrationScore, second?.score || 0);
  if (words >= 5 && best && bestDialogueScore >= 0.92 && dialogueMargin >= 0.12 && speakerLabels.length <= 1) {
    return row(scene, shot, {
      classification: 'character', suggestedSpeakerId: best.turn.speakerId, suggestedSpeakerName: best.turn.speakerName,
      confidence: Math.min(0.97, bestDialogueScore), reason: `Coincidencia secuencial fuerte y única con el parlamento legacy de ${best.turn.speakerName}.`,
      narrationScore, bestDialogueScore, speakerLabels, existingMedia
    });
  }

  return row(scene, shot, {
    classification: 'ambiguous', confidence: 0,
    reason: 'No existe evidencia textual suficiente para distinguir narrador de personaje sin adivinar.',
    narrationScore, bestDialogueScore, speakerLabels, existingMedia
  });
}

function row(
  scene: FilmScene,
  shot: FilmShot,
  result: Pick<LegacyShotClassification, 'classification' | 'suggestedSpeakerId' | 'suggestedSpeakerName' | 'confidence' | 'reason' | 'narrationScore' | 'bestDialogueScore' | 'speakerLabels' | 'existingMedia'>
): LegacyShotClassification {
  return {
    sceneId: scene.id,
    sceneOrder: scene.order,
    sceneTitle: scene.title,
    shotId: shot.id,
    shotOrder: shot.order,
    spokenText: shot.spokenText,
    currentSpeakerId: resolveSingleSpeakerId(shot),
    ...result
  };
}

function hasDialogueTie(matches: Array<{ score: number; exact: boolean }>) {
  if (matches.length < 2) return false;
  return matches[0].exact && matches[1].exact;
}

function extractDialogueLabels(dialogue: string) {
  const labels: string[] = [];
  const matcher = /(?:^|\n|;|\s)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{0,50})\s*:/g;
  for (const match of dialogue.matchAll(matcher)) {
    const label = match[1].trim();
    if (label && !labels.some((item) => normalize(item) === normalize(label))) labels.push(label);
  }
  return labels;
}

function labelsPresentInShot(spoken: string, sceneLabels: string[]) {
  const normalizedSpoken = normalize(spoken);
  return sceneLabels.filter((label) => {
    const normalizedLabel = normalize(label);
    return new RegExp(`(?:^| )${escapeRegex(normalizedLabel)}(?: |$)`).test(normalizedSpoken) &&
      new RegExp(`${escapeRegex(label)}\\s*:`, 'i').test(spoken);
  });
}

function textBeforeFirstSpeakerLabel(spoken: string, label: string) {
  const match = new RegExp(`${escapeRegex(label)}\\s*:`, 'i').exec(spoken);
  return match ? spoken.slice(0, match.index).trim() : '';
}

function containsPhrase(container: string, phrase: string) {
  return Boolean(container && phrase && container.includes(phrase));
}

function orderedCoverage(target: string, source: string) {
  const targetTokens = tokens(target);
  const sourceTokens = tokens(source);
  if (!targetTokens.length || !sourceTokens.length) return 0;
  let sourceIndex = 0;
  let matched = 0;
  for (const token of targetTokens) {
    while (sourceIndex < sourceTokens.length && sourceTokens[sourceIndex] !== token) sourceIndex += 1;
    if (sourceIndex >= sourceTokens.length) break;
    matched += 1;
    sourceIndex += 1;
  }
  return matched / targetTokens.length;
}

function tokens(value: string) {
  return normalize(value).split(' ').filter(Boolean);
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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}
