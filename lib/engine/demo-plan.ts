import { randomUUID } from 'node:crypto';
import type { FilmPlan, ProjectInput, SceneMode } from '@/lib/domain/schemas';
import { evenlyDistributedDurations, sceneCountForDuration } from '@/lib/engine/duration-policy';
import { ensurePlanShots } from '@/lib/engine/shot-plan';

const beats = [
  'La promesa', 'La vida antes del cambio', 'La primera grieta', 'La decisión', 'La resistencia',
  'El descubrimiento', 'La prueba', 'La pérdida', 'El punto de quiebre', 'La nueva estrategia',
  'El precio del avance', 'La revelación', 'La confrontación', 'La transformación', 'El legado'
];

export function createDemoPlan(input: ProjectInput): FilmPlan {
  const targetSeconds = input.durationMinutes * 60;
  const sceneCount = sceneCountForDuration(input.durationMinutes);
  const durations = evenlyDistributedDurations(sceneCount, targetSeconds);

  const protagonistId = randomUUID();
  const guideId = randomUUID();
  const characters = [
    {
      id: protagonistId,
      name: 'Alex',
      role: 'Protagonista',
      age: 32,
      appearance: 'rostro caribeño memorable, mirada intensa, complexión media, rasgos naturales y consistentes',
      wardrobe: 'ropa cotidiana sobria que evoluciona hacia una presencia segura y cinematográfica',
      personality: 'curioso, resiliente, imperfecto y decidido',
      voiceInstructions: 'Español caribeño neutral, íntimo, seguro, ritmo narrativo cinematográfico.',
      voiceProvider: 'offline' as const,
      imagePrompt: `Retrato cinematográfico del protagonista de ${input.title}, estilo ${input.visualStyle}, iluminación de estudio, rostro frontal consistente.`
    },
    {
      id: guideId,
      name: 'Elena',
      role: 'Guía y contrapunto',
      age: 40,
      appearance: 'mujer de presencia serena, mirada inteligente, cabello oscuro, facciones originales',
      wardrobe: 'vestuario elegante y funcional en una paleta complementaria al protagonista',
      personality: 'directa, estratégica y empática',
      voiceInstructions: 'Voz femenina madura, clara, cálida y con autoridad tranquila.',
      voiceProvider: 'offline' as const,
      imagePrompt: `Retrato cinematográfico de una mentora llamada Elena, estilo ${input.visualStyle}, luz suave, identidad visual consistente.`
    }
  ];

  const scenes = Array.from({ length: sceneCount }, (_, index) => {
    const order = index + 1;
    const act = order <= sceneCount * 0.25 ? 1 : order <= sceneCount * 0.75 ? 2 : 3;
    const beat = beats[index % beats.length];
    const mode: SceneMode = order % 5 === 0 ? 'avatar' : 'ai-video';
    const durationSeconds = durations[index];
    const development = `${input.premise} En este momento, ${beat.toLowerCase()} modifica el rumbo del protagonista.`;
    const spoken = mode === 'avatar' ? 'No necesitas otra oportunidad. Necesitas usar de verdad la que ya tienes.' : '';

    return {
      id: randomUUID(),
      order,
      act,
      title: `${beat} · ${order}`,
      durationSeconds,
      summary: development,
      narration: `Toda transformación comienza mucho antes de que los demás puedan verla. En ${input.title}, este instante revela ${beat.toLowerCase()} y obliga al protagonista a mirar de frente aquello que había evitado.`,
      dialogue: mode === 'avatar' ? `Elena: ${spoken}` : '',
      dialogueTurns: mode === 'avatar' ? [{ speakerId: guideId, text: spoken, emotion: 'serena y firme' }] : [],
      visualPrompt: `${input.visualStyle}. ${development} Mismos personajes, vestuario y paleta del proyecto. Composición cinematográfica ${input.aspectRatio}, profundidad de campo, iluminación narrativa, sin texto ni marcas.`,
      negativePrompt: 'rostro diferente, identidad inconsistente, manos deformes, texto, logos, marcas de agua, baja resolución, anatomía rota, duplicados',
      camera: act === 1 ? 'dolly-in lento y planos cerrados' : act === 2 ? 'cámara en movimiento y planos medios' : 'plano amplio, movimiento estable y cierre heroico',
      soundDesign: 'atmósfera cinematográfica sutil, ambiente coherente con la localización y transiciones limpias',
      transition: order === sceneCount ? 'fade to black' : 'disolvencia corta',
      mode,
      characterIds: mode === 'avatar' ? [guideId] : [protagonistId],
      shots: [],
      status: 'pending' as const
    };
  });

  return ensurePlanShots({
    logline: input.premise.slice(0, 240),
    synopsis: `Una producción de ${input.durationMinutes} minutos sobre ${input.premise}`,
    creativeDirection: `${input.visualStyle}; estructura de tres actos; continuidad estricta de personajes; ritmo creciente y final emocionalmente satisfactorio.`,
    musicPrompt: `Banda sonora instrumental cinematográfica para ${input.genre}, inicio íntimo, desarrollo con tensión y final inspirador; sin voces ni melodías reconocibles.`,
    characters,
    scenes
  });
}
