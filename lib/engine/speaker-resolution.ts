import type { FilmShot } from '@/lib/domain/schemas';

export function dialogueSpeakerIds(shot: Pick<FilmShot, 'speakerId' | 'dialogueLines'>) {
  return [...new Set((shot.dialogueLines || []).map((line) => line.speakerId).filter(Boolean))];
}

export function hasMultipleDialogueSpeakers(shot: Pick<FilmShot, 'speakerId' | 'dialogueLines'>) {
  const ids = dialogueSpeakerIds(shot);
  if (ids.length > 1) return true;
  if (shot.speakerId && ids.length === 1 && ids[0] !== shot.speakerId) return true;
  return false;
}

export function resolveSingleSpeakerId(shot: Pick<FilmShot, 'speakerId' | 'dialogueLines'>) {
  if (hasMultipleDialogueSpeakers(shot)) return undefined;
  if (shot.speakerId) return shot.speakerId;
  const ids = dialogueSpeakerIds(shot);
  return ids.length === 1 ? ids[0] : undefined;
}
