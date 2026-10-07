import type { FilmProject } from '@/lib/domain/schemas';

const IDS = {
  elena: 'char-v5-elena-0001',
  raul: 'char-v5-raul-0002',
  mariana: 'char-v5-mariana-0003',
  sofia: 'char-v5-sofia-0004',
  mateo: 'char-v5-mateo-0005'
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
  },
  {
    id: IDS.mariana,
    label: 'Mariana',
    provider: 'openai',
    voiceId: 'shimmer',
    language: 'es-LATAM',
    exactDialogue: true,
    instructions:
      'Español latino natural. Voz inequívocamente femenina de una mujer adulta de unos 48 años, natural, cálida y clara, con registro femenino medio y autoridad tranquila. Evita por completo un timbre masculino, grave o andrógino. Habla exactamente el texto de entrada. No traduzcas, no parafrasees, no agregues, no omitas y no sustituyas ninguna palabra. Ritmo conversacional, pausas naturales, sin tono de gurú, publicitario ni melodramático.'
  },
  {
    id: IDS.sofia,
    label: 'Sofía',
    provider: 'openai',
    voiceId: 'coral',
    language: 'es-LATAM',
    exactDialogue: true,
    instructions:
      'Español latino natural. Interpretar como niña latina de 10 años: voz infantil femenina, espontánea, clara y cálida, sin impostación adulta. Habla exactamente el texto de entrada. No traduzcas, no parafrasees, no agregues, no omitas y no sustituyas ninguna palabra. Evita tono de locutora, dramatización excesiva y cualquier sensualización o madurez vocal impropia de su edad.'
  },
  {
    id: IDS.mateo,
    label: 'Mateo',
    provider: 'openai',
    voiceId: 'alloy',
    language: 'es-LATAM',
    exactDialogue: true,
    instructions:
      'Español latino natural. Mateo es un niño latino PREPUBESCENTE de 7 años y debe sonar inequívocamente como niño real: timbre pequeño, ligero, juvenil, masculino infantil, espontáneo, curioso y cálido. Prohibida cualquier resonancia de pecho adulta, voz grave masculina, tono de adolescente, locutor o impostación adulta. Habla exactamente el texto de entrada. No traduzcas, no parafrasees, no agregues, no omitas y no sustituyas ninguna palabra. Las preguntas deben sonar genuinas, simples e inocentes, nunca teatrales. En masters finales de Mateo se exige además el remaster local true-child aprobado.'
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
      ' Voice Lock 5.1 aplicado: Narrador/Elena=OpenAI marin, Raúl=OpenAI onyx, Mariana=OpenAI shimmer, Sofía=OpenAI coral, Mateo=OpenAI alloy + true-child remaster obligatorio; español latino exacto y traducción/paráfrasis prohibidas.'
  );

  return project;
}
