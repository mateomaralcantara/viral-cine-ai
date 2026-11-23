import type { FilmProject, FilmShot } from '@/lib/domain/schemas';

export const SCENE5_ELENA_ID_V6 = 'char-v5-elena-0001';
export const SCENE5_SOFIA_ID_V6 = 'char-v5-sofia-0004';
export const SCENE5_MATEO_ID_V6 = 'char-v5-mateo-0005';

export const SCENE5_TITLE_V6 = 'De verdad';
export const SCENE5_DURATION_SECONDS_V6 = 30;

export const SCENE5_DIALOGUE_V6 = [
  { order: 3, speakerId: SCENE5_MATEO_ID_V6, text: '¿Esta es nuestra casa?' },
  { order: 4, speakerId: SCENE5_ELENA_ID_V6, text: 'Sí.' },
  { order: 5, speakerId: SCENE5_MATEO_ID_V6, text: '¿De verdad?' },
  { order: 6, speakerId: SCENE5_ELENA_ID_V6, text: 'De verdad.' }
] as const;

export const SCENE5_RUNWAY_SILENT_SECONDS_V6 = 14;
export const SCENE5_WAN_DIALOGUE_SECONDS_V6 = 16;
export const SCENE5_MAX_VIDEO_USD_V6 = 2.04;
export const SCENE5_MAX_VOICE_USD_V6 = 0.01;
export const SCENE5_MAX_REFERENCE_IMAGE_USD_V6 = 0.08;
export const SCENE5_SAFE_MAX_USD_V6 = 2.13;

export function planScene5ReunionV6(project: FilmProject) {
  if (!project.plan) throw new Error('El proyecto no tiene plan.');

  const scene = project.plan.scenes.find((item) => item.order === 5);
  if (!scene) throw new Error('No existe Escena 5.');

  if (
    project.plan.scenes.length !== 6 ||
    scene.id !== 'scene-15d-short-05'
  ) {
    throw new Error(
      'Este plan solo está autorizado para 15 DÍAS short de 6 escenas.'
    );
  }

  if (scene.title !== SCENE5_TITLE_V6) {
    throw new Error(
      'Escena 5 inesperada. Se esperaba "' +
        SCENE5_TITLE_V6 +
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

  if (
    hasExistingMedia &&
    !scene.shots.every(
      (shot) => shot.pipelineVersion === '6.0-scene5-reunion'
    )
  ) {
    throw new Error(
      'Escena 5 ya contiene media ajena al plan V6. No se sobrescribirá.'
    );
  }

  scene.durationSeconds = SCENE5_DURATION_SECONDS_V6;
  scene.dialogue =
    'Mateo: ¿Esta es nuestra casa?\n' +
    'Elena: Sí.\n' +
    'Mateo: ¿De verdad?\n' +
    'Elena: De verdad.';
  scene.dialogueTurns = [
    {
      speakerId: SCENE5_MATEO_ID_V6,
      text: '¿Esta es nuestra casa?',
      emotion: 'incrédulo y esperanzado'
    },
    {
      speakerId: SCENE5_ELENA_ID_V6,
      text: 'Sí.',
      emotion: 'emocionada y contenida'
    },
    {
      speakerId: SCENE5_MATEO_ID_V6,
      text: '¿De verdad?',
      emotion: 'espontáneo'
    },
    {
      speakerId: SCENE5_ELENA_ID_V6,
      text: 'De verdad.',
      emotion: 'aliviada'
    }
  ];
  scene.productionStrategy = 'real-cinema-v2';
  scene.status = 'pending';
  scene.error = undefined;
  scene.shots = buildShots(scene.id);

  project.productionLog.push(
    new Date().toISOString() +
      ' ViralCine 6 Safe: Escena 5 “De verdad” planificada en 6 tomas / 30s: ' +
      'T1-T2 silenciosas Runway/Grok Lite; T3-T6 diálogo monohablante WAN 3.0 audio-reference; Fal.ai prohibido.'
  );

  return scene;
}

export function validateScene5ReunionV6(project: FilmProject) {
  const scene = project.plan?.scenes.find((item) => item.order === 5);
  if (!scene) throw new Error('No existe Escena 5.');

  if (scene.durationSeconds !== SCENE5_DURATION_SECONDS_V6) {
    throw new Error('Escena 5 debe durar exactamente 30 segundos.');
  }

  const ordered = [...scene.shots].sort((a, b) => a.order - b.order);

  if (ordered.length !== 6) {
    throw new Error('Escena 5 debe tener exactamente 6 tomas.');
  }

  const total = ordered.reduce(
    (sum, shot) => sum + shot.durationSeconds,
    0
  );
  if (total !== SCENE5_DURATION_SECONDS_V6) {
    throw new Error(
      'Las tomas de Escena 5 suman ' + total + 's; se exigen 30s.'
    );
  }

  const visibleDialogue = ordered
    .filter((shot) => shot.spokenText.trim())
    .map((shot) => ({
      order: shot.order,
      speakerId: shot.speakerId,
      text: shot.spokenText
    }));

  if (
    JSON.stringify(visibleDialogue) !==
    JSON.stringify(SCENE5_DIALOGUE_V6)
  ) {
    throw new Error(
      'El diálogo visible de Escena 5 cambió o dejó de ser monohablante.'
    );
  }

  for (const shot of ordered) {
    const providers = shot.motionSpec?.preferredProviders || [];
    if (providers.includes('fal-video')) {
      throw new Error(
        'Fal.ai está prohibido en Escena 5; detectado en E5/T' +
          shot.order +
          '.'
      );
    }

    if (shot.spokenText.trim()) {
      if (providers[0] !== 'wan') {
        throw new Error(
          'E5/T' + shot.order +
          ' tiene diálogo visible y debe priorizar WAN.'
        );
      }
      if (!shot.speakerId) {
        throw new Error(
          'E5/T' + shot.order +
          ' tiene diálogo visible sin speakerId.'
        );
      }
    } else if (providers[0] !== 'runway') {
      throw new Error(
        'E5/T' + shot.order +
        ' es silenciosa y debe priorizar Runway.'
      );
    }
  }

  return {
    shots: ordered.length,
    durationSeconds: total,
    silentShots: ordered.filter((shot) => !shot.spokenText.trim()).length,
    dialogueShots: visibleDialogue.length,
    wanDialogueSeconds: SCENE5_WAN_DIALOGUE_SECONDS_V6,
    runwaySilentSeconds: SCENE5_RUNWAY_SILENT_SECONDS_V6,
    maxVideoUsd: SCENE5_MAX_VIDEO_USD_V6,
    maxVoiceUsd: SCENE5_MAX_VOICE_USD_V6,
    maxTotalUsd: SCENE5_SAFE_MAX_USD_V6
  };
}

function buildShots(sceneId: string): FilmShot[] {
  return [
    shot({
      id: sceneId + '-v6-shot-01',
      order: 1,
      title: 'La puerta',
      durationSeconds: 7,
      visualPrompt:
        'Interior de una casa sencilla, limpia y estable, meses después. Elena, exactamente la misma mujer del estado Vida recuperada, abre la puerta principal desde dentro. Al otro lado esperan Sofía de 10 años y Mateo de 7 con bolsas pequeñas de uso cotidiano. Los tres se reconocen de inmediato. No hay lujo, mansión ni ostentación. Una sola acción: Elena abre la puerta completamente y sostiene la mirada de sus hijos.',
      camera:
        'Plano medio amplio desde el interior, leve dolly-back al abrirse la puerta para revelar a los niños; sin cortes, sin zoom digital, sin movimientos repetidos.',
      spokenText: '',
      speakerId: undefined,
      characterIds: [
        SCENE5_ELENA_ID_V6,
        SCENE5_SOFIA_ID_V6,
        SCENE5_MATEO_ID_V6
      ],
      characterStateIds: {
        [SCENE5_ELENA_ID_V6]: 'elena-d-restored',
        [SCENE5_SOFIA_ID_V6]: 'sofia-main',
        [SCENE5_MATEO_ID_V6]: 'mateo-main'
      },
      provider: 'runway'
    }),
    shot({
      id: sceneId + '-v6-shot-02',
      order: 2,
      title: 'El regreso',
      durationSeconds: 7,
      visualPrompt:
        'Continuidad exacta de la puerta. Sofía y Mateo entran y Elena los recibe en un abrazo realista y contenido. Los niños conservan proporciones infantiles naturales y sus identidades; Elena conserva exactamente edad, rostro y vestuario de Vida recuperada. Una sola acción dominante: entrar y abrazarse. Sin saltos temporales, sin coreografía perfecta ni melodrama.',
      camera:
        'Plano medio a tres con desplazamiento lateral corto que acompaña la entrada y se detiene en el abrazo; sin cortes, sin orbitas completas y sin repetir el abrazo.',
      spokenText: '',
      speakerId: undefined,
      characterIds: [
        SCENE5_ELENA_ID_V6,
        SCENE5_SOFIA_ID_V6,
        SCENE5_MATEO_ID_V6
      ],
      characterStateIds: {
        [SCENE5_ELENA_ID_V6]: 'elena-d-restored',
        [SCENE5_SOFIA_ID_V6]: 'sofia-main',
        [SCENE5_MATEO_ID_V6]: 'mateo-main'
      },
      provider: 'runway'
    }),
    shot({
      id: sceneId + '-v6-shot-03',
      order: 3,
      title: '¿Esta es nuestra casa?',
      durationSeconds: 4,
      visualPrompt:
        'Mateo, niño latino de 7 años, dentro de la casa sencilla y estable, mira alrededor con incredulidad feliz y luego mira a Elena. Su rostro y boca permanecen claramente visibles. Elena puede aparecer solo como hombro o silueta fuera de foco para fijar el eje. Mateo es el único hablante.',
      camera:
        'Primer plano infantil natural a la altura de los ojos de Mateo, cámara estable con microderiva orgánica; boca visible de principio a fin, sin cortes.',
      spokenText: '¿Esta es nuestra casa?',
      speakerId: SCENE5_MATEO_ID_V6,
      characterIds: [SCENE5_MATEO_ID_V6, SCENE5_ELENA_ID_V6],
      characterStateIds: {
        [SCENE5_MATEO_ID_V6]: 'mateo-main',
        [SCENE5_ELENA_ID_V6]: 'elena-d-restored'
      },
      provider: 'wan'
    }),
    shot({
      id: sceneId + '-v6-shot-04',
      order: 4,
      title: 'Sí',
      durationSeconds: 4,
      visualPrompt:
        'Elena responde a Mateo en primer plano íntimo. Mismo rostro, misma edad y mismo vestuario de Vida recuperada. Mateo puede verse solo como hombro infantil desenfocado en primer término. Elena es la única hablante; la emoción está contenida en ojos y respiración.',
      camera:
        'Primer plano estable de Elena a la altura de los ojos, push-in físico de pocos centímetros, labios completamente visibles, sin cortes.',
      spokenText: 'Sí.',
      speakerId: SCENE5_ELENA_ID_V6,
      characterIds: [SCENE5_ELENA_ID_V6, SCENE5_MATEO_ID_V6],
      characterStateIds: {
        [SCENE5_ELENA_ID_V6]: 'elena-d-restored',
        [SCENE5_MATEO_ID_V6]: 'mateo-main'
      },
      provider: 'wan'
    }),
    shot({
      id: sceneId + '-v6-shot-05',
      order: 5,
      title: '¿De verdad?',
      durationSeconds: 4,
      visualPrompt:
        'Mateo vuelve a mirar a Elena, todavía procesando que la casa es de ellos. Rostro infantil natural y reconocible, boca claramente visible, ninguna actuación adulta ni exagerada. Mateo es el único hablante.',
      camera:
        'Primer plano de Mateo conservando exactamente eje, luz y escala de su toma anterior; cámara casi fija, sin cortes.',
      spokenText: '¿De verdad?',
      speakerId: SCENE5_MATEO_ID_V6,
      characterIds: [SCENE5_MATEO_ID_V6, SCENE5_ELENA_ID_V6],
      characterStateIds: {
        [SCENE5_MATEO_ID_V6]: 'mateo-main',
        [SCENE5_ELENA_ID_V6]: 'elena-d-restored'
      },
      provider: 'wan'
    }),
    shot({
      id: sceneId + '-v6-shot-06',
      order: 6,
      title: 'De verdad',
      durationSeconds: 4,
      visualPrompt:
        'Elena sostiene la mirada de Mateo y responde con alivio contenido. Sofía puede aparecer al fondo o junto al borde como presencia silenciosa. Elena es la única hablante. La escena debe terminar en serenidad familiar, no en triunfo ostentoso.',
      camera:
        'Primer plano medio de Elena con Mateo en borde de cuadro y profundidad cálida de la casa; labios visibles, push-in mínimo y cierre estable sin cortes.',
      spokenText: 'De verdad.',
      speakerId: SCENE5_ELENA_ID_V6,
      characterIds: [
        SCENE5_ELENA_ID_V6,
        SCENE5_MATEO_ID_V6,
        SCENE5_SOFIA_ID_V6
      ],
      characterStateIds: {
        [SCENE5_ELENA_ID_V6]: 'elena-d-restored',
        [SCENE5_MATEO_ID_V6]: 'mateo-main',
        [SCENE5_SOFIA_ID_V6]: 'sofia-main'
      },
      provider: 'wan'
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
  characterStateIds: Record<string, string>;
  provider: 'runway' | 'wan';
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
    dialogueLines: input.spokenText && input.speakerId
      ? [{
          id: input.id + '-line',
          speakerId: input.speakerId,
          text: input.spokenText,
          emotion:
            input.speakerId === SCENE5_MATEO_ID_V6
              ? 'natural, infantil y esperanzado'
              : 'emocionada y contenida',
          startSeconds: 0,
          endSeconds: input.durationSeconds
        }]
      : [],
    motionSpec: {
      version: '5.0-real-motion-v1',
      intention:
        input.spokenText
          ? 'Capturar diálogo visible con identidad y sincronización labial precisas.'
          : 'Capturar el reencuentro familiar con movimiento realista y continuidad estricta.',
      startState:
        'Comenzar exactamente desde el frame de continuidad aprobado y mantener identidades, edades, vestuario y geografía.',
      endState:
        'Cerrar una sola acción o una sola frase sin introducir un beat narrativo adicional.',
      bodyMotion:
        input.spokenText
          ? 'Microexpresión, respiración y articulación facial natural; sin gestos grandes ni movimiento corporal que oculte la boca.'
          : 'Movimiento corporal natural y contenido; una sola acción dominante, sin bucles ni repetición.',
      environmentMotion:
        'Movimiento ambiental doméstico mínimo y físicamente coherente; nada compite con los personajes.',
      cameraMotion: input.camera,
      shotClass: input.spokenText ? 'dialogue' : 'hero',
      preferredProviders:
        input.provider === 'wan'
          ? ['wan', 'runway']
          : ['runway', 'wan'],
      minMotionScore: 8,
      minIdentityScore: 9.5,
      minContinuityScore: 9,
      minAnatomyScore: 9,
      minCameraScore: 9,
      allowStillFallbackFinal: false
    },
    mode: 'video',
    characterIds: input.characterIds,
    characterStateIds: input.characterStateIds,
    status: 'pending',
    pipelineVersion: '6.0-scene5-reunion'
  };
}
