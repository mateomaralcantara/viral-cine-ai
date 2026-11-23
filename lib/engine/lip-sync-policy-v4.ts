import type { FilmProject } from '@/lib/domain/schemas';

export type LipSyncProfileKind = 'narrator' | 'character' | 'support' | 'unknown';

export type LipSyncDecision = {
  required: boolean;
  kind: LipSyncProfileKind;
  reason: string;
};

const COLLECTIVE_VOICE =
  /\b(multitud|coro|crowd|chorus|audiencia|publico|público|pueblo|grupo|voces|manifestantes|ejercito|ejército|soldados|guardias)\b/i;

export function decideLipSync(
  project: FilmProject,
  speakerId: string | undefined
): LipSyncDecision {
  if (!speakerId) {
    return { required: false, kind: 'unknown', reason: 'No existe speakerId resuelto.' };
  }

  if (speakerId === 'narrator') {
    return {
      required: false,
      kind: 'narrator',
      reason: 'El Narrador es voz en off y no requiere una cara sincronizada.'
    };
  }

  const character = project.plan?.characters.find((item) => item.id === speakerId);
  if (character) {
    return {
      required: true,
      kind: 'character',
      reason: `El personaje ${character.name} es un hablante individual.`
    };
  }

  const support = project.supportVoices?.find((item) => item.id === speakerId);
  if (support) {
    const searchable = normalize(`${support.label} ${support.voiceInstructions || ''}`);
    if (COLLECTIVE_VOICE.test(searchable)) {
      return {
        required: false,
        kind: 'support',
        reason: `${support.label} representa una voz colectiva; se prohíbe single-face lip-sync.`
      };
    }
    return {
      required: true,
      kind: 'support',
      reason: `${support.label} es un hablante de soporte individual.`
    };
  }

  return {
    required: false,
    kind: 'unknown',
    reason: `El hablante ${speakerId} no tiene perfil conocido; no se autoriza lip-sync pagado.`
  };
}

export function requiresLipSyncForSpeaker(project: FilmProject, speakerId: string | undefined) {
  return decideLipSync(project, speakerId).required;
}

export function isCollectiveVoiceLabel(label: string) {
  return COLLECTIVE_VOICE.test(normalize(label));
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9ñ]+/gi, ' ')
    .trim();
}
