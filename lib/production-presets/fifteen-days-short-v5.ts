import type {
  FilmPlan,
  FilmScene,
  FilmShot,
  ProjectInput,
  RealMotionShotSpec,
  SceneDialogueTurn
} from '@/lib/domain/schemas';
import { ensurePlanShots } from '@/lib/engine/shot-plan';
import {
  FIFTEEN_DAYS_CHARACTER_BIBLE_V5,
  FIFTEEN_DAYS_CHARACTERS_V5,
  FIFTEEN_DAYS_PILOT_SHOTS_V5
} from '@/lib/production-presets/fifteen-days-pilot-v5';

const IDS = {
  elena: 'char-v5-elena-0001',
  raul: 'char-v5-raul-0002',
  mariana: 'char-v5-mariana-0003',
  sofia: 'char-v5-sofia-0004',
  mateo: 'char-v5-mateo-0005'
} as const;

export const FIFTEEN_DAYS_SHORT_INPUT_V5: ProjectInput = {
  title: '15 DÍAS',
  premise:
    'Elena, una madre que pierde su hogar y queda separada temporalmente de sus hijos, conserva un cuaderno. Mariana descubre que sigue escribiendo y le propone quince días de disciplina para transformar esa historia en una obra publicable. La primera venta no es el triunfo: el verdadero final es que Elena recupera estabilidad, dignidad y a sus hijos.',
  durationMinutes: 2.5,
  genre: 'Drama contemporáneo de superación',
  audience: 'Público adulto y familiar de habla hispana',
  visualStyle:
    'Cine dramático contemporáneo realista, actuaciones íntimas, cámara orgánica, luz natural, transición progresiva de tonos fríos a cálidos, movimiento humano creíble y continuidad facial estricta',
  language: 'es',
  aspectRatio: '16:9',
  budgetUsd: 20,
  burnSubtitles: false,
  generateMusic: true
};

type ShortSceneDef = {
  title: string;
  durationSeconds: number;
  act: 1 | 2 | 3;
  summary: string;
  narration?: string;
  dialogue?: string;
  dialogueTurns?: SceneDialogueTurn[];
  characterIds: string[];
  states: Record<string, string>;
  usePilotShots?: number;
};

const defs: ShortSceneDef[] = [
  {
    title: 'La caída',
    durationSeconds: 30,
    act: 1,
    summary:
      'Abrimos con Elena en la calle recogiendo una moneda y saltamos a la última imagen de la vida que perdió: una mesa, una maleta y Raúl terminando la relación.',
    narration: 'Hace seis meses yo también tenía una mesa.',
    dialogue: 'Elena: ¿Adónde vas?\nRaúl: Esto se terminó, Elena.',
    characterIds: [IDS.elena, IDS.raul],
    states: {
      [IDS.elena]: 'elena-b-street',
      [IDS.raul]: 'raul-a-control'
    },
    usePilotShots: 5
  },
  {
    title: 'La primera página',
    durationSeconds: 24,
    act: 1,
    summary:
      'Tras perder vivienda y convivencia con sus hijos, Elena pasa una noche en la calle y escribe en su cuaderno en lugar de rendirse.',
    narration:
      'Pensé que lo peor era perder a mi esposo. Después perdí mi casa. Y después, a mis hijos.',
    characterIds: [IDS.elena],
    states: { [IDS.elena]: 'elena-b-street' }
  },
  {
    title: 'Alguien se detuvo',
    durationSeconds: 24,
    act: 2,
    summary:
      'Mariana ve a Elena escribir, se sienta a una distancia respetuosa y le ofrece una idea concreta: quince días para terminar y publicar esa historia.',
    dialogue:
      'Mariana: Si todavía estás escribiendo, todavía no llegaste al final. Dame quince días.',
    dialogueTurns: [{
      speakerId: IDS.mariana,
      text: 'Si todavía estás escribiendo, todavía no llegaste al final. Dame quince días.',
      emotion: 'serena y directa'
    }],
    characterIds: [IDS.elena, IDS.mariana],
    states: {
      [IDS.elena]: 'elena-b-street',
      [IDS.mariana]: 'mariana-guide'
    }
  },
  {
    title: 'Quince días',
    durationSeconds: 30,
    act: 2,
    summary:
      'Elena escribe, corrige y publica. La transformación se cuenta en varias tomas breves: cansancio, disciplina, una primera venta y una postura que empieza a cambiar.',
    narration:
      'No fue magia. Fueron quince días levantándome, escribiendo y volviendo a intentarlo.',
    characterIds: [IDS.elena, IDS.mariana],
    states: {
      [IDS.elena]: 'elena-c-rebuild',
      [IDS.mariana]: 'mariana-guide'
    }
  },
  {
    title: 'De verdad',
    durationSeconds: 30,
    act: 3,
    summary:
      'Meses después Elena abre la puerta de una casa sencilla y estable. Sofía y Mateo entran. El reencuentro con sus hijos es el verdadero clímax.',
    dialogue:
      'Mateo: ¿Esta es nuestra casa?\nElena: Sí.\nMateo: ¿De verdad?\nElena: De verdad.',
    dialogueTurns: [
      { speakerId: IDS.mateo, text: '¿Esta es nuestra casa?', emotion: 'incrédulo y esperanzado' },
      { speakerId: IDS.elena, text: 'Sí.', emotion: 'emocionada y contenida' },
      { speakerId: IDS.mateo, text: '¿De verdad?', emotion: 'espontáneo' },
      { speakerId: IDS.elena, text: 'De verdad.', emotion: 'aliviada' }
    ],
    characterIds: [IDS.elena, IDS.sofia, IDS.mateo],
    states: {
      [IDS.elena]: 'elena-d-restored',
      [IDS.sofia]: 'sofia-main',
      [IDS.mateo]: 'mateo-main'
    }
  },
  {
    title: 'Ese capítulo sí',
    durationSeconds: 12,
    act: 3,
    summary:
      'Elena guarda el cuaderno original, toma a sus hijos de la mano y sale. No cerró su historia; cerró solamente aquel capítulo.',
    dialogue: 'Sofía: Mami, ¿ya terminaste?\nElena: Ese capítulo sí.',
    dialogueTurns: [
      { speakerId: IDS.sofia, text: 'Mami, ¿ya terminaste?', emotion: 'natural y curiosa' },
      { speakerId: IDS.elena, text: 'Ese capítulo sí.', emotion: 'serena' }
    ],
    characterIds: [IDS.elena, IDS.sofia, IDS.mateo],
    states: {
      [IDS.elena]: 'elena-d-restored',
      [IDS.sofia]: 'sofia-main',
      [IDS.mateo]: 'mateo-main'
    }
  }
];

function scene(def: ShortSceneDef, index: number): FilmScene {
  const pilotShots = def.usePilotShots
    ? FIFTEEN_DAYS_PILOT_SHOTS_V5.slice(0, def.usePilotShots).map((shot) => ({
        ...shot,
        motionSpec: shot.motionSpec ? {
          ...shot.motionSpec,
          preferredProviders: ['fal-video']
        } : undefined
      }))
    : [];

  return {
    id: 'scene-15d-short-' + String(index + 1).padStart(2, '0'),
    order: index + 1,
    act: def.act,
    title: def.title,
    durationSeconds: def.durationSeconds,
    summary: def.summary,
    narration: def.narration || '',
    dialogue: def.dialogue || '',
    dialogueTurns: def.dialogueTurns || [],
    visualPrompt:
      FIFTEEN_DAYS_SHORT_INPUT_V5.visualStyle + '. ' + def.summary +
      ' Una sola acción principal por toma; continuidad de identidad y vestuario; sin texto incrustado.',
    negativePrompt:
      'still image, frozen person, slideshow, poster pose, morphing face, identity drift, deformed hands, duplicated people, artificial glamour, text artifacts, watermark',
    camera:
      'Una sola toma continua con movimiento físico de cámara motivado por la acción, sin cortes.',
    soundDesign:
      'Ambiente diegético realista, respiración, tela, pasos y espacio real según localización.',
    transition:
      index === defs.length - 1 ? 'fade to black' : 'corte motivado por acción o sonido',
    mode: 'ai-video',
    characterIds: def.characterIds,
    shots: pilotShots,
    status: 'pending'
  };
}

function genericMotion(scene: FilmScene, shot: FilmShot): RealMotionShotSpec {
  return {
    version: '5.0-real-motion-v1',
    intention: shot.spokenText.trim() || scene.summary,
    startState: 'Comenzar exactamente desde el primer frame aprobado y mantener identidad, vestuario y geografía.',
    endState: 'Terminar la acción de esta toma sin introducir un nuevo beat narrativo.',
    bodyMotion: 'Movimiento corporal natural, físicamente plausible y contenido; una sola acción dominante.',
    environmentMotion: 'Movimiento ambiental leve y coherente con la localización; nada compite con el sujeto principal.',
    cameraMotion: shot.camera,
    shotClass: shot.spokenText.trim() ? 'dialogue' : 'standard',
    preferredProviders: ['fal-video'],
    minMotionScore: 8,
    minIdentityScore: 9,
    minContinuityScore: 9,
    minAnatomyScore: 8,
    minCameraScore: 8,
    allowStillFallbackFinal: false
  };
}

export function buildFifteenDaysShortPlanV5(): FilmPlan {
  const plan: FilmPlan = {
    logline:
      'Una madre que lo pierde casi todo transforma un cuaderno escrito en la calle en el primer paso para recuperar su voz y a sus hijos.',
    synopsis:
      'En dos minutos y medio, Elena pasa de recoger una moneda en la calle a recordar la ruptura que inició su caída. Cuando Mariana descubre que aún escribe, le propone quince días de disciplina. Elena termina y publica su historia; la primera venta simboliza una posibilidad, no riqueza. Meses después, el verdadero triunfo llega cuando sus hijos vuelven a casa. El corto termina con Elena guardando el cuaderno y aceptando que terminó aquel capítulo, no su historia.',
    creativeDirection:
      'Cortometraje de 150 segundos. Ritmo emocional rápido pero no videoclipero. Cada toma debe comunicar una sola acción clara. La transformación de Elena ocurre mediante postura, vestuario, luz y actuación, nunca cambiando de actriz. El reencuentro familiar es el clímax.',
    musicPrompt:
      'Drama contemporáneo íntimo de 150 segundos: piano felt y cello, inicio frío y mínimo, crecimiento moderado durante los quince días, resolución cálida únicamente en el reencuentro, sin voces ni fanfarria.',
    realMotion: {
      version: '5.0-real-motion-v1',
      finalMode: 'real-motion',
      allowStillFallbackFinal: false,
      providerOrder: ['fal-video'],
      circuitBreaker: { failureThreshold: 3, cooldownSeconds: 900 },
      pilotShotIds: [],
      characterBible: FIFTEEN_DAYS_CHARACTER_BIBLE_V5,
      qualityRule:
        'Cada toma FINAL debe provenir de video temporal real y superar movimiento, identidad, continuidad, anatomía y cámara.'
    },
    characters: FIFTEEN_DAYS_CHARACTERS_V5,
    scenes: defs.map(scene)
  };

  const withShots = ensurePlanShots(plan);

  withShots.scenes.forEach((filmScene, index) => {
    const stateMap = defs[index].states;
    filmScene.shots.forEach((shot) => {
      if (
        !shot.characterStateIds ||
        Object.keys(shot.characterStateIds).length === 0
      ) {
        shot.characterStateIds = Object.fromEntries(
          shot.characterIds
            .filter((id) => stateMap[id])
            .map((id) => [id, stateMap[id]])
        );
      }
      shot.motionSpec = shot.motionSpec || genericMotion(filmScene, shot);
      shot.motionSpec = {
        ...shot.motionSpec,
        preferredProviders: ['fal-video'],
        allowStillFallbackFinal: false
      };
      shot.pipelineVersion = '5.0-real-motion-short';
    });
  });

  withShots.realMotion!.pilotShotIds =
    withShots.scenes.flatMap((filmScene) => filmScene.shots.map((shot) => shot.id));

  return withShots;
}
