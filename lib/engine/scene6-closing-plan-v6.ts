import type { FilmProject, FilmShot } from '@/lib/domain/schemas';

export const SCENE6_ELENA_ID_V6 = 'char-v5-elena-0001';
export const SCENE6_SOFIA_ID_V6 = 'char-v5-sofia-0004';
export const SCENE6_MATEO_ID_V6 = 'char-v5-mateo-0005';

export const SCENE6_TITLE_V6 = 'Esta es nuestra casa';
export const SCENE6_DURATION_SECONDS_V6 = 12;

export const SCENE6_DIALOGUE_V6 = [
  {
    order: 2,
    speakerId: SCENE6_ELENA_ID_V6,
    text: '¿Ves? Te lo prometí… esta es nuestra casa.'
  }
] as const;

export const SCENE6_WAN_DIALOGUE_SECONDS_V6 = 4;
export const SCENE6_RUNWAY_SILENT_SECONDS_V6 = 8;
export const SCENE6_MAX_VIDEO_USD_V6 = 0.66;
export const SCENE6_MAX_VOICE_USD_V6 = 0.01;
export const SCENE6_SAFE_MAX_USD_V6 = 0.67;

export function planScene6ClosingV6(project: FilmProject) {
  if (!project.plan) throw new Error('El proyecto no tiene plan.');

  const scene = project.plan.scenes.find((item) => item.order === 6);
  if (!scene) throw new Error('No existe Escena 6.');

  if (
    project.plan.scenes.length !== 6 ||
    scene.id !== 'scene-15d-short-06'
  ) {
    throw new Error(
      'Este plan solo está autorizado para 15 DÍAS short de 6 escenas.'
    );
  }

  if (
    scene.title !== SCENE6_TITLE_V6 &&
    scene.title !== 'Ese capítulo sí'
  ) {
    throw new Error(
      'Escena 6 inesperada. Se esperaba "' +
        SCENE6_TITLE_V6 +
        '" y llegó "' +
        scene.title +
        '".'
    );
  }

  const hasExistingMedia = scene.shots.some(
    (shot) =>
      shot.imageAsset ||
      shot.voiceAsset ||
      shot.videoAsset ||
      shot.baseVideoAsset ||
      shot.lipSyncAsset
  );

  if (hasExistingMedia) {
    throw new Error(
      'Escena 6 ya contiene media. No se sobrescribirá.'
    );
  }

  scene.title = SCENE6_TITLE_V6;
  scene.durationSeconds = 12;
  scene.summary =
    'Sofía observa en silencio el hogar recuperado. Elena cumple su promesa y los tres se abrazan dentro de la casa.';
  scene.dialogue =
    'Elena: ¿Ves? Te lo prometí… esta es nuestra casa.';
  scene.dialogueTurns = [
    {
      speakerId: SCENE6_ELENA_ID_V6,
      text: '¿Ves? Te lo prometí… esta es nuestra casa.',
      emotion: 'emocionada, serena y contenida'
    }
  ];
  scene.productionStrategy = 'real-cinema-v2';
  scene.status = 'pending';
  scene.error = undefined;
  scene.shots = buildShots(scene.id);

  project.productionLog.push(
    new Date().toISOString() +
      ' ViralCine 6 Safe: Escena 6 “Esta es nuestra casa” planificada en 3 tomas / 12s; T1 reacción silenciosa Runway, T2 Elena WAN audio-reference, T3 abrazo familiar silencioso Runway; Fal.ai prohibido.'
  );

  return scene;
}

export function validateScene6ClosingV6(project: FilmProject) {
  const scene = project.plan?.scenes.find((item) => item.order === 6);
  if (!scene) throw new Error('No existe Escena 6.');

  const ordered = [...scene.shots].sort((a, b) => a.order - b.order);

  if (ordered.length !== 3) {
    throw new Error('Escena 6 debe tener exactamente 3 tomas.');
  }

  const total = ordered.reduce(
    (sum, shot) => sum + shot.durationSeconds,
    0
  );
  if (total !== 12) {
    throw new Error('Escena 6 debe sumar exactamente 12 segundos.');
  }

  const dialogue = ordered
    .filter((shot) => shot.spokenText.trim())
    .map((shot) => ({
      order: shot.order,
      speakerId: shot.speakerId,
      text: shot.spokenText
    }));

  if (JSON.stringify(dialogue) !== JSON.stringify(SCENE6_DIALOGUE_V6)) {
    throw new Error('El diálogo visible de Escena 6 cambió.');
  }

  for (const shot of ordered) {
    const providers = shot.motionSpec?.preferredProviders || [];
    if (providers.includes('fal-video')) {
      throw new Error('Fal.ai está prohibido en Escena 6.');
    }
  }

  return {
    shots: 3,
    durationSeconds: 12,
    dialogueShots: 1,
    silentShots: 2,
    maxVideoUsd: SCENE6_MAX_VIDEO_USD_V6,
    maxVoiceUsd: SCENE6_MAX_VOICE_USD_V6,
    maxTotalUsd: SCENE6_SAFE_MAX_USD_V6
  };
}

function buildShots(sceneId: string): FilmShot[] {
  return [
    shot({
      id: sceneId + '-v6-shot-01',
      order: 1,
      title: 'La mirada de Sofía',
      durationSeconds: 4,
      visualPrompt:
        'Continuidad exacta de la casa recuperada. Sofía, niña latina de 10 años, recorre con la mirada el interior de la casa y luego mira a Elena con emoción contenida. Elena permanece cerca y Mateo al fondo. Nadie habla. Una sola acción emocional, natural y realista.',
      camera:
        'Primer plano natural de Sofía a la altura de sus ojos; cámara estable con desplazamiento mínimo, sin cortes y sin articulación de diálogo.',
      spokenText: '',
      speakerId: undefined,
      characterIds: [SCENE6_SOFIA_ID_V6, SCENE6_ELENA_ID_V6, SCENE6_MATEO_ID_V6],
      provider: 'runway'
    }),
    shot({
      id: sceneId + '-v6-shot-02',
      order: 2,
      title: 'Esta es nuestra casa',
      durationSeconds: 4,
      visualPrompt:
        'Elena mira directamente a Sofía dentro del hogar recuperado. Elena es la única hablante. Su expresión mezcla alivio, orgullo y emoción contenida. Mantener exactamente rostro, edad, vestuario y luz de Vida recuperada.',
      camera:
        'Primer plano íntimo de Elena, push-in físico mínimo, labios visibles, sin cortes.',
      spokenText: '¿Ves? Te lo prometí… esta es nuestra casa.',
      speakerId: SCENE6_ELENA_ID_V6,
      characterIds: [SCENE6_ELENA_ID_V6, SCENE6_SOFIA_ID_V6],
      provider: 'wan'
    }),
    shot({
      id: sceneId + '-v6-shot-03',
      order: 3,
      title: 'Hogar',
      durationSeconds: 4,
      visualPrompt:
        'Elena reúne a Sofía y Mateo y los tres se abrazan dentro de la casa recuperada. Nadie habla. Una sola acción: abrazo familiar sincero y contenido. La cámara revela el hogar alrededor de ellos; sin triunfo ostentoso.',
      camera:
        'Plano medio que se abre suavemente a plano amplio, pequeño dolly hacia atrás, sin cortes.',
      spokenText: '',
      speakerId: undefined,
      characterIds: [SCENE6_ELENA_ID_V6, SCENE6_SOFIA_ID_V6, SCENE6_MATEO_ID_V6],
      provider: 'runway'
    })
  ];
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
          ? 'Capturar diálogo visible con identidad y sincronización labial precisas.'
          : 'Cerrar la historia con movimiento familiar natural y continuidad estricta.',
      startState:
        'Continuar exactamente desde la casa y las identidades aprobadas de Escena 5.',
      endState:
        'Cerrar una sola frase o una sola acción sin introducir un nuevo beat.',
      bodyMotion:
        input.spokenText
          ? 'Microexpresión, respiración y articulación facial natural.'
          : 'Caminar juntos de forma natural y contenida, sin bucles.',
      environmentMotion:
        'Movimiento doméstico mínimo y realista.',
      cameraMotion: input.camera,
      shotClass: input.spokenText ? 'dialogue' : 'hero',
      preferredProviders:
        input.provider === 'wan'
          ? ['wan', 'runway']
          : ['runway', 'wan'],
      minMotionScore: 8,
      minIdentityScore: 9.5,
      minContinuityScore: 9.5,
      minAnatomyScore: 9,
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
    pipelineVersion: '6.0-scene6-closing'
  };
}
