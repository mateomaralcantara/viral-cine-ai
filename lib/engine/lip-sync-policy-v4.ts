import type { FilmProject } from '@/lib/domain/schemas';

const COLLECTIVE_LABEL = /\b(multitud|coro|crowd|chorus|audiencia|publico|público|pueblo|grupo|voces)\b/i;

export function requiresLipSyncForSpeaker(project: FilmProject, speakerId: string) {
  if (speakerId === 'narrator') return false;
  if (project.plan?.characters.some((character) => character.id === speakerId)) return true;
  const support = project.supportVoices?.find((voice) => voice.id === speakerId);
  if (!support) return true;
  return !isCollectiveVoiceLabel(support.label);
}

export function isCollectiveVoiceLabel(label: string) {
  return COLLECTIVE_LABEL.test(normalize(label));
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9ñ]+/gi, ' ')
    .trim();
}
