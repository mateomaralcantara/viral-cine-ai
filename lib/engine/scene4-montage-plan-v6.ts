import type { FilmProject, FilmShot } from '@/lib/domain/schemas';

const ELENA = 'char-v5-elena-0001';
const MARIANA = 'char-v5-mariana-0003';

const NARRATION =
  'No fue magia. Fueron quince días levantándome, escribiendo y volviendo a intentarlo.';

export function planScene4MontageV6(project: FilmProject) {
  if (!project.plan) throw new Error('El proyecto no tiene plan.');
  const scene = project.plan.scenes.find((item) => item.order === 4);
  if (!scene) throw new Error('No existe la Escena 4.');

  const hasExistingMedia = scene.shots.some((shot) =>
    Boolean(
      shot.imageAsset ||
      shot.voiceAsset ||
      shot.baseVideoAsset ||
      shot.lipSyncAsset ||
      shot.videoAsset
    )
  );

  if (hasExistingMedia) {
    validateScene4MontageV6(project);
    return scene;
  }

  const previousIds = [...scene.shots]
    .sort((a, b) => a.order - b.order)
    .map((shot) => shot.id);

  const shot = (
    order: number,
    patch: Omit<FilmShot, 'id' | 'order' | 'status' | 'generationCount' | 'estimatedSpendUsd'>
  ): FilmShot => ({
    id:
      previousIds[order - 1] ||
      'scene-15d-short-04-v6-shot-' + String(order).padStart(2, '0'),
    order,
    status: 'pending',
    generationCount: 0,
    estimatedSpendUsd: 0,
    ...patch
  });

  scene.shots = [
    shot(1, {
      title: 'Día 1 — volver al cuaderno',
      durationSeconds: 6,
      visualPrompt:
        'Elena, exactamente la misma mujer de las escenas anteriores, inicia su reconstrucción. Sentada ante una mesa sencilla, abre el cuaderno y comienza a escribir con cansancio pero decisión. El cambio respecto a la calle es mínimo y creíble; todavía se nota agotada. Nadie habla en cámara.',
      camera:
        'Plano medio lateral con dolly muy suave hacia Elena y el cuaderno; una sola toma continua, sin cortes.',
      spokenText: '',
      dialogueLines: [],
      mode: 'video',
      characterIds: [ELENA],
      characterStateIds: {
        [ELENA]: 'elena-c-rebuild'
      },
      pipelineVersion: '6.0-scene4-montage'
    }),
    shot(2, {
      title: 'Día 4 — disciplina',
      durationSeconds: 6,
      visualPrompt:
        'Elena continúa escribiendo temprano. Hay varias páginas usadas y señales de trabajo real. Ella tacha, reescribe y sigue adelante. Su postura mejora apenas; no hay transformación instantánea. Nadie habla en cámara.',
      camera:
        'Plano tres cuartos con movimiento lateral corto que descubre páginas, mano, bolígrafo y rostro concentrado; sin cortes.',
      spokenText: '',
      dialogueLines: [],
      mode: 'video',
      characterIds: [ELENA],
      characterStateIds: {
        [ELENA]: 'elena-c-rebuild'
      },
      pipelineVersion: '6.0-scene4-montage'
    }),
    shot(3, {
      title: 'Día 8 — corregir',
      durationSeconds: 6,
      visualPrompt:
        'Mariana acompaña a Elena en silencio. Mariana señala una página o hace una observación no verbal; Elena escucha, corrige y continúa escribiendo. La relación es de apoyo práctico, no de gurú. Ninguna mueve los labios como si hablara.',
      camera:
        'Plano medio de ambas con leve arco de cámara; Elena domina el cuadro y Mariana queda como presencia de apoyo, una sola toma continua.',
      spokenText: '',
      dialogueLines: [],
      mode: 'video',
      characterIds: [ELENA, MARIANA],
      characterStateIds: {
        [ELENA]: 'elena-c-rebuild',
        [MARIANA]: 'mariana-guide'
      },
      pipelineVersion: '6.0-scene4-montage'
    }),
    shot(4, {
      title: 'Día 12 — publicar',
      durationSeconds: 6,
      visualPrompt:
        'Elena termina una sesión de trabajo frente a una computadora sencilla. Revisa una última vez, respira y hace clic para publicar. La pantalla no debe mostrar texto legible ni marcas inventadas. Nadie habla en cámara.',
      camera:
        'Plano sobre hombro que comienza en las manos y termina en una reacción contenida de Elena; movimiento corto y continuo, sin cortes.',
      spokenText: '',
      dialogueLines: [],
      mode: 'video',
      characterIds: [ELENA],
      characterStateIds: {
        [ELENA]: 'elena-c-rebuild'
      },
      pipelineVersion: '6.0-scene4-montage'
    }),
    shot(5, {
      title: 'Día 15 — primera venta',
      durationSeconds: 6,
      visualPrompt:
        'El teléfono de Elena vibra sobre la mesa. Ella mira una notificación de primera venta sin mostrar texto legible a cámara. Su reacción es pequeña: exhala, sonríe apenas y endereza la postura. No es riqueza instantánea; es una señal de avance. Nadie habla en cámara.',
      camera:
        'Primer plano del teléfono que vibra y rack focus hacia el rostro de Elena; termina en plano medio corto, movimiento físico natural y sin cortes.',
      spokenText: '',
      dialogueLines: [],
      mode: 'video',
      characterIds: [ELENA],
      characterStateIds: {
        [ELENA]: 'elena-c-rebuild'
      },
      pipelineVersion: '6.0-scene4-montage'
    })
  ];

  scene.narration = NARRATION;
  scene.dialogue = '';
  scene.dialogueTurns = [];
  scene.status = 'pending';
  scene.error = undefined;
  scene.imageAsset = undefined;
  scene.voiceAsset = undefined;
  scene.videoAsset = undefined;
  scene.productionStrategy = 'real-cinema-v2';

  project.productionLog.push(
    new Date().toISOString() +
      ' ViralCine 6 Safe: Escena 4 replanificada como montaje 5x6s con narración única en voice-over y cero diálogo visible/lip-sync.'
  );

  validateScene4MontageV6(project);
  return scene;
}

export function validateScene4MontageV6(project: FilmProject) {
  if (!project.plan) throw new Error('El proyecto no tiene plan.');
  const scene = project.plan.scenes.find((item) => item.order === 4);
  if (!scene) throw new Error('No existe la Escena 4.');

  const shots = [...scene.shots].sort((a, b) => a.order - b.order);

  if (scene.title !== 'Quince días') {
    throw new Error('La Escena 4 debe conservar el título “Quince días”.');
  }
  if (scene.durationSeconds !== 30) {
    throw new Error('La Escena 4 debe durar exactamente 30s.');
  }
  if (shots.length !== 5) {
    throw new Error('La Escena 4 debe tener exactamente 5 tomas.');
  }
  if (shots.some((shot) => shot.durationSeconds !== 6)) {
    throw new Error('La Escena 4 debe ser 5x6s.');
  }
  if (shots.some((shot) => shot.spokenText.trim().length > 0)) {
    throw new Error(
      'Escena 4 usa narración en off: ninguna toma debe tener diálogo visible.'
    );
  }
  if (shots.some((shot) => shot.dialogueLines.length > 0)) {
    throw new Error(
      'Escena 4 no debe activar dialogueLines ni lip-sync por toma.'
    );
  }
  if (scene.narration !== NARRATION) {
    throw new Error('La Escena 4 no conserva la narración exacta aprobada.');
  }

  return {
    sceneOrder: 4,
    title: scene.title,
    durationSeconds: 30,
    shotCount: 5,
    shotDurationSeconds: 6,
    narration: NARRATION,
    visibleDialogue: false,
    lipSyncRequired: false
  };
}

export const SCENE4_NARRATION_V6 = NARRATION;
export const SCENE4_ELENA_ID_V6 = ELENA;
export const SCENE4_MARIANA_ID_V6 = MARIANA;
