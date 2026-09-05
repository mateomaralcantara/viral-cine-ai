import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { FilmPlanSchema, type FilmPlan, type ProjectInput } from '@/lib/domain/schemas';
import { createDemoPlan } from '@/lib/engine/demo-plan';
import { MAX_SCENES, normalizeSceneDurations, sceneCountForDuration } from '@/lib/engine/duration-policy';
import { ensurePlanShots } from '@/lib/engine/shot-plan';

const AiCharacterSchema = z.object({
  name: z.string(),
  role: z.string(),
  age: z.number().int(),
  appearance: z.string(),
  wardrobe: z.string(),
  personality: z.string(),
  voiceInstructions: z.string(),
  imagePrompt: z.string()
});

const AiDialogueTurnSchema = z.object({
  speakerName: z.string(),
  text: z.string(),
  emotion: z.string().optional()
});

const AiSceneSchema = z.object({
  order: z.number().int(),
  act: z.number().int(),
  title: z.string(),
  durationSeconds: z.number().int(),
  summary: z.string(),
  narration: z.string(),
  dialogue: z.string(),
  dialogueTurns: z.array(AiDialogueTurnSchema),
  visualPrompt: z.string(),
  negativePrompt: z.string(),
  camera: z.string(),
  soundDesign: z.string(),
  transition: z.string(),
  mode: z.enum(['ai-video', 'avatar']),
  characterNames: z.array(z.string())
});

const AiFilmPlanSchema = z.object({
  logline: z.string(),
  synopsis: z.string(),
  creativeDirection: z.string(),
  musicPrompt: z.string(),
  characters: z.array(AiCharacterSchema),
  scenes: z.array(AiSceneSchema)
});

export async function generateFilmPlan(input: ProjectInput): Promise<FilmPlan> {
  if (process.env.PRODUCTION_MODE !== 'real') return createDemoPlan(input);
  if (!process.env.OPENAI_API_KEY) throw new Error('Falta OPENAI_API_KEY para crear el guion real.');

  const sceneCount = sceneCountForDuration(input.durationMinutes);
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.parse({
    model: process.env.OPENAI_SCRIPT_MODEL || 'gpt-5.6-terra',
    store: false,
    input: [
      {
        role: 'system',
        content: [
          'Eres director, guionista y supervisor de continuidad para una productora audiovisual profesional.',
          'Entrega un plan filmable, original y coherente. Mantén identidades, vestuario y localizaciones consistentes.',
          'Distribuye el relato en tres actos. En produccion real todo debe ser video autentico y cada escena debe usar ai-video.',
          'No uses animated-image. El sistema puede dividir internamente una escena en segmentos continuos de 4 a 8 segundos.',
          'Cada personaje narrativamente importante, incluso antagonistas y autoridades, debe existir en characters con rostro, vestuario y personalidad vocal exclusivos.',
          'En characterNames y dialogueTurns.speakerName usa exclusivamente nombres exactos definidos en characters.',
          'dialogueTurns debe contener cada parlamento por separado, con un solo hablante por turno. No mezcles dos personajes en un mismo turno.',
          'dialogue conserva una version humana legible del dialogo; dialogueTurns es la fuente tecnica para voz y lip-sync.',
          'Si una escena no tiene dialogo, devuelve dialogueTurns vacio.',
          'Incluye como maximo los personajes realmente necesarios en cada escena; las multitudes y extras no pertenecen a characterNames.',
          'Ordena characterNames segun su aparicion narrativa; los dos primeros son los sujetos del plano de establecimiento.',
          'visualPrompt describe lugar, iluminacion, accion y continuidad, pero nunca debe pedir alternar planos, montaje, varios angulos ni cambios de escala.',
          'camera contiene un solo movimiento continuo compatible con toda la escena; nunca enumeres plano general, medio, detalle y primer plano juntos.',
          'La narración debe sostener la duración indicada a un ritmo aproximado de 135 palabras por minuto.',
          'No imites personajes protegidos, artistas vivos ni marcas. No incluyas instrucciones fuera del esquema.'
        ].join(' ')
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: 'Crear biblia de producción, personajes, voces narrativas y plan completo de escenas',
          exactSceneCount: sceneCount,
          targetTotalSeconds: input.durationMinutes * 60,
          project: input
        })
      }
    ],
    text: { format: zodTextFormat(AiFilmPlanSchema, 'film_plan') }
  });

  if (!response.output_parsed) throw new Error('El modelo no devolvió un plan cinematográfico válido.');
  const raw = AiFilmPlanSchema.parse(response.output_parsed);
  if (raw.scenes.length !== sceneCount) {
    throw new Error(`El modelo devolvió ${raw.scenes.length} escenas, pero la duración requiere ${sceneCount}. Vuelve a generar el guion.`);
  }

  const characters = raw.characters.slice(0, 8).map((character) => ({
    ...character,
    id: randomUUID(),
    voiceProvider: 'elevenlabs' as const
  }));
  const characterIdByName = new Map<string, string>(
    characters.map((character) => [character.name.toLocaleLowerCase(), String(character.id)])
  );

  const plan: FilmPlan = {
    ...raw,
    characters,
    scenes: raw.scenes.slice(0, MAX_SCENES).map((rawScene, index) => {
      const { characterNames, dialogueTurns, ...scene } = rawScene;
      const mappedTurns = dialogueTurns
        .map((turn) => ({
          speakerId: characterIdByName.get(turn.speakerName.toLocaleLowerCase()),
          text: turn.text.trim(),
          emotion: turn.emotion?.trim() || undefined
        }))
        .filter((turn): turn is { speakerId: string; text: string; emotion?: string } => Boolean(turn.speakerId && turn.text));
      return {
        ...scene,
        id: randomUUID(),
        order: index + 1,
        act: Math.max(1, Math.min(5, scene.act)),
        durationSeconds: Math.max(5, Math.min(90, scene.durationSeconds)),
        dialogueTurns: mappedTurns,
        characterIds: characterNames
          .map((name) => characterIdByName.get(name.toLocaleLowerCase()))
          .filter((id): id is string => typeof id === 'string'),
        shots: [],
        status: 'pending'
      };
    })
  };

  for (const scene of plan.scenes) if (!scene.characterIds.length && characters[0]) scene.characterIds = [characters[0].id];
  return ensurePlanShots(normalizeSceneDurations(FilmPlanSchema.parse(plan), input.durationMinutes * 60));
}
