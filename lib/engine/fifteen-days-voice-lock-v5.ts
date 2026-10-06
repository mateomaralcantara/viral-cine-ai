import type { FilmProject } from '@/lib/domain/schemas';

const IDS = {
  elena: 'char-v5-elena-0001',
  raul: 'char-v5-raul-0002'
} as const;

export type VoiceLockEntry = {
  id: string;
  label: string;
  provider: 'openai';
  voiceId: string;
  language: 'es-LATAM';
  exactDialogue: true;
  instructions: string;
};

export const FIFTEEN_DAYS_CORE_VOICE_LOCKS_V5: VoiceLockEntry[] = [
  {
    id: 'narrator',
    label: 'Narrador / voz interior de Elena',
    provider: 'openai',
    voiceId: 'marin',
    language: 'es-LATAM',
    exactDialogue: true,
    instructions:
      'Español latino natural. Voz femenina adulta cálida e íntima, como voz interior de Elena. Habla exactamente el texto de entrada. No traduzcas, no parafrasees, no agregues, no omitas y no sustituyas ninguna palabra. Interpretación cinematográfica contenida, respiración humana realista y sin tono publicitario.'
  },
  {
    id: IDS.elena,
    label: 'Elena',
    provider: 'openai',
    voiceId: 'marin',
    language: 'es-LATAM',
    exactDialogue: true,
    instructions:
      'Español latino natural. Voz femenina adulta cálida, íntima y consistente con Elena. Habla exactamente el texto de entrada. No traduzcas, no parafrasees, no agregues, no omitas y no sustituyas ninguna palabra. Evita tono publicitario, caricaturesco o melodramático.'
  },
  {
    id: IDS.raul,
    label: 'Raúl',
    provider: 'openai',
    voiceId: 'onyx',
    language: 'es-LATAM',
    exactDialogue: true,
    instructions:
      'Español latino neutro. Voz inequívocamente masculina de un hombre latino adulto de unos 40 años, timbre medio-grave, contenido, seguro y natural. Habla exactamente el texto de entrada. No traduzcas, no parafrasees, no agregues, no omitas y no sustituyas ninguna palabra. No uses voz femenina, aniñada, aguda ni caricaturesca.'
  }
];

export function applyFifteenDaysCoreVoiceLocksV5(project: FilmProject) {
  if (!project.plan) throw new Error('El proyecto no tiene plan.');

  for (const lock of FIFTEEN_DAYS_CORE_VOICE_LOCKS_V5) {
    if (lock.id === 'narrator') {
      project.narratorVoice = {
        id: 'narrator',
        label: 'Narrador',
        voiceProvider: lock.provider,
        voiceId: lock.voiceId,
        voiceInstructions: lock.instructions
      };
      continue;
    }

    const character = project.plan.characters.find((item) => item.id === lock.id);
    if (!character) continue;

    character.voiceProvider = lock.provider;
    character.voiceId = lock.voiceId;
    character.voiceInstructions = lock.instructions;
  }

  project.productionLog.push(
    new Date().toISOString() +
      ' Voice Lock 5.0 aplicado: Narrador/Elena=OpenAI marin, Raúl=OpenAI onyx, español latino exacto y traducción/paráfrasis prohibidas.'
  );

  return project;
}
