import type { FilmShot } from '@/lib/domain/schemas';
import {
  SCENE6_ELENA_ID_V6,
  SCENE6_SOFIA_ID_V6,
  SCENE6_MATEO_ID_V6
} from '@/lib/engine/scene6-closing-plan-v6';

export const SCENE6B_LABEL_V6 = 'Esta es nuestra casa — Repair B';
export const SCENE6B_DURATION_SECONDS_V6 = 12;
export const SCENE6B_MAX_VIDEO_USD_V6 = 0.66;
export const SCENE6B_AUTHORIZED_MAX_USD_V6 = 0.67;
export const SCENE6B_DIALOGUE_V6 =
  '¿Ves? Te lo prometí… esta es nuestra casa.';

export function buildScene6BRepairShotsV6(
  sceneId: string
): FilmShot[] {
  return [
    shot({
      id: sceneId + '-v6b-shot-01',
      order: 1,
      title: 'La pared',
      durationSeconds: 4,
      visualPrompt: [
        'SOLO SOFÍA EN CUADRO.',
        'Sofía es una niña latina de 10 años, claramente infantil, con la identidad exacta de su referencia aprobada.',
        'No aparece Elena. No aparece Mateo. No aparece ninguna mujer adulta.',
        'Sofía entra un paso en la casa recuperada y apoya suavemente una mano sobre la pared, reconociendo que por fin es su hogar.',
        'Luego dirige la mirada hacia su madre FUERA DE CÁMARA.',
        'Boca cerrada, nadie habla.',
        'Prohibido transformar a Sofía en adulta, cambiar edad, rostro, cabello, tono de piel o proporciones.'
      ].join(' '),
      camera:
        'Plano medio individual de Sofía, cámara a altura infantil, leve dolly lateral; una sola persona visible y ningún corte.',
      spokenText: '',
      speakerId: undefined,
      characterIds: [SCENE6_SOFIA_ID_V6],
      provider: 'runway'
    }),
    shot({
      id: sceneId + '-v6b-shot-02',
      order: 2,
      title: 'La promesa',
      durationSeconds: 4,
      visualPrompt: [
        'SOLO ELENA EN CUADRO.',
        'Elena es una mujer latina adulta de 36 años con la identidad exacta de su referencia aprobada.',
        'Sofía y Mateo permanecen completamente FUERA DE CÁMARA.',
        'Elena mira ligeramente fuera de eje hacia Sofía y contiene la emoción antes de hablar.',
        'No aparece ningún rostro infantil ni otra persona.',
        'Mantener exactamente rostro, edad adulta, cabello, tono de piel y proporciones de Elena.',
        'Prohibido mezclar rasgos de Elena con Sofía.'
      ].join(' '),
      camera:
        'Primer plano individual de Elena, encuadre pecho-cabeza, fondo de casa sencilla desenfocado, push-in mínimo y labios siempre visibles.',
      spokenText: SCENE6B_DIALOGUE_V6,
      speakerId: SCENE6_ELENA_ID_V6,
      characterIds: [SCENE6_ELENA_ID_V6],
      provider: 'wan'
    }),
    shot({
      id: sceneId + '-v6b-shot-03',
      order: 3,
      title: 'Tres siluetas, un hogar',
      durationSeconds: 4,
      visualPrompt: [
        'ABRAZO FAMILIAR VISTO DESDE ATRÁS.',
        'Elena adulta está en el centro y es claramente más alta.',
        'Sofía, niña de 10 años, está a la izquierda y es más baja que Elena.',
        'Mateo, niño de 7 años, está a la derecha y es el más pequeño.',
        'Elena rodea a cada niño con un brazo y los tres permanecen unidos mirando el interior luminoso de su casa.',
        'Ningún rostro debe ser visible en ningún momento: solo nucas, cabello, espalda y siluetas.',
        'Nadie gira hacia la cámara. Nadie habla.',
        'Una sola acción: abrazo quieto y sincero.',
        'Prohibido intercambiar cuerpos, edades, alturas, cabello o posiciones; prohibido fusionar personas o crear una cuarta persona.'
      ].join(' '),
      camera:
        'Plano general desde detrás de la familia; dolly-out muy lento revelando la casa, composición simétrica, sin cortes y sin mostrar rostros.',
      spokenText: '',
      speakerId: undefined,
      characterIds: [
        SCENE6_ELENA_ID_V6,
        SCENE6_SOFIA_ID_V6,
        SCENE6_MATEO_ID_V6
      ],
      provider: 'runway'
    })
  ];
}

export function validateScene6BRepairShotsV6(
  shots: FilmShot[]
) {
  const ordered = [...shots].sort(
    (a, b) => a.order - b.order
  );

  if (ordered.length !== 3) {
    throw new Error('Scene 6B debe tener exactamente 3 tomas.');
  }

  const total = ordered.reduce(
    (sum, shot) => sum + shot.durationSeconds,
    0
  );
  if (total !== SCENE6B_DURATION_SECONDS_V6) {
    throw new Error('Scene 6B debe sumar exactamente 12 segundos.');
  }

  if (
    ordered[0].characterIds.length !== 1 ||
    ordered[0].characterIds[0] !== SCENE6_SOFIA_ID_V6 ||
    ordered[0].spokenText
  ) {
    throw new Error('Scene 6B/T1 debe aislar únicamente a Sofía y ser silenciosa.');
  }

  if (
    ordered[1].characterIds.length !== 1 ||
    ordered[1].characterIds[0] !== SCENE6_ELENA_ID_V6 ||
    ordered[1].speakerId !== SCENE6_ELENA_ID_V6 ||
    ordered[1].spokenText !== SCENE6B_DIALOGUE_V6
  ) {
    throw new Error('Scene 6B/T2 debe aislar únicamente a Elena con el diálogo aprobado.');
  }

  if (
    ordered[2].spokenText ||
    ordered[2].characterIds.length !== 3
  ) {
    throw new Error('Scene 6B/T3 debe ser un abrazo familiar silencioso de tres personajes.');
  }

  for (const shot of ordered) {
    const providers =
      shot.motionSpec?.preferredProviders || [];
    if (providers.includes('fal-video')) {
      throw new Error('Fal.ai está prohibido en Scene 6B.');
    }
  }

  return {
    shots: 3,
    durationSeconds: 12,
    dialogueShots: 1,
    silentShots: 2,
    maxVideoUsd: SCENE6B_MAX_VIDEO_USD_V6,
    authorizedMaxUsd: SCENE6B_AUTHORIZED_MAX_USD_V6
  };
}

function shot(input: {
  id: string;
  order: number;
  title: string;
  durationSeconds: number;
  visualPrompt: string;
  camera: string;
  spokenText: string;
  speakerId?: string;
  characterIds: string[];
  provider: 'wan' | 'runway';
}): FilmShot {
  return {
    id: input.id,
    order: input.order,
    title: input.title,
    durationSeconds: input.durationSeconds,
    visualPrompt: input.visualPrompt,
    camera: input.camera,
    spokenText: input.spokenText,
    speakerId: input.speakerId,
    dialogueLines:
      input.spokenText && input.speakerId
        ? [{
            id: input.id + '-line',
            speakerId: input.speakerId,
            text: input.spokenText,
            emotion: 'emocionada, serena y contenida',
            startSeconds: 0,
            endSeconds: input.durationSeconds
          }]
        : [],
    motionSpec: {
      version: '5.0-real-motion-v1',
      intention:
        input.spokenText
          ? 'Aislar a Elena para diálogo visible sin mezcla de identidad.'
          : input.order === 1
            ? 'Aislar a Sofía y preservar edad/rostro infantil.'
            : 'Cerrar con abrazo de espaldas evitando exposición facial y morphing.',
      startState:
        'Usar únicamente las referencias aprobadas indicadas para esta toma.',
      endState:
        'Completar una sola acción sin introducir otro personaje o beat.',
      bodyMotion:
        input.spokenText
          ? 'Microexpresión y articulación facial natural de Elena únicamente.'
          : 'Movimiento corporal mínimo, natural y sin loops.',
      environmentMotion:
        'Interior de hogar sencillo con movimiento ambiental mínimo.',
      cameraMotion: input.camera,
      shotClass: input.spokenText ? 'dialogue' : 'hero',
      preferredProviders:
        input.provider === 'wan'
          ? ['wan']
          : ['runway'],
      minMotionScore: 8,
      minIdentityScore: 10,
      minContinuityScore: 9,
      minAnatomyScore: 9.5,
      minCameraScore: 9,
      allowStillFallbackFinal: false
    },
    mode: 'video',
    characterIds: input.characterIds,
    characterStateIds: {
      [SCENE6_ELENA_ID_V6]: 'elena-d-restored',
      [SCENE6_SOFIA_ID_V6]: 'sofia-main',
      [SCENE6_MATEO_ID_V6]: 'mateo-main'
    },
    status: 'pending',
    pipelineVersion: '6.0-scene6b-repair'
  };
}
