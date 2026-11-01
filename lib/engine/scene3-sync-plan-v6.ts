import type { FilmProject, FilmShot } from '@/lib/domain/schemas';

const ELENA = 'char-v5-elena-0001';
const MARIANA = 'char-v5-mariana-0003';
const DIALOGUE =
  'Si todavía estás escribiendo, todavía no llegaste al final. Dame quince días.';

export function planScene3SynchronizedV6(project: FilmProject) {
  if (!project.plan) throw new Error('El proyecto no tiene plan.');
  const scene = project.plan.scenes.find((item) => item.order === 3);
  if (!scene) throw new Error('No existe la Escena 3.');

  const hasExistingMedia = scene.shots.some(
    (shot) =>
      shot.imageAsset ||
      shot.voiceAsset ||
      shot.baseVideoAsset ||
      shot.lipSyncAsset ||
      shot.videoAsset
  );

  if (hasExistingMedia) {
    validateScene3SynchronizedV6(project);
    return scene;
  }

  const previousIds = [...scene.shots]
    .sort((a, b) => a.order - b.order)
    .map((shot) => shot.id);

  const shot = (
    order: number,
    patch: Omit<FilmShot, 'id' | 'order' | 'status' | 'generationCount' | 'estimatedSpendUsd'>
  ): FilmShot => ({
    id: previousIds[order - 1] || 'scene-15d-short-03-v6-shot-' + String(order).padStart(2, '0'),
    order,
    status: 'pending',
    generationCount: 0,
    estimatedSpendUsd: 0,
    ...patch
  });

  scene.shots = [
    shot(1, {
      title: 'Mariana se detiene',
      durationSeconds: 8,
      visualPrompt:
        'Elena está sentada escribiendo en su cuaderno. Mariana se acerca con calma, se detiene y se sienta a una distancia respetuosa. Ninguna de las dos habla todavía. Mantener identidades, vestuario y continuidad de la calle.',
      camera:
        'Plano medio de dos personajes, aproximación física muy suave y continua, sin cortes; Elena permanece escribiendo y Mariana entra en cuadro.',
      spokenText: '',
      dialogueLines: [],
      mode: 'video',
      characterIds: [ELENA, MARIANA],
      characterStateIds: {
        [ELENA]: 'elena-b-street',
        [MARIANA]: 'mariana-guide'
      },
      pipelineVersion: '6.0-scene-plan-sync'
    }),
    shot(2, {
      title: 'La propuesta',
      durationSeconds: 8,
      visualPrompt:
        'Plano medio corto de Mariana como única hablante visible. Mariana mira a Elena con empatía firme y habla de forma serena y directa. Boca completamente visible, rostro estable, sin que Elena hable.',
      camera:
        'Plano medio corto frontal de Mariana, leve push-in continuo, sin cortes; labios y mandíbula completamente visibles durante todo el parlamento.',
      spokenText: DIALOGUE,
      speakerId: MARIANA,
      dialogueLines: [{
        id: 'scene-15d-short-03-line-mariana-v6',
        speakerId: MARIANA,
        text: DIALOGUE,
        emotion: 'serena y directa',
        startSeconds: 0
      }],
      mode: 'video',
      characterIds: [MARIANA],
      characterStateIds: {
        [MARIANA]: 'mariana-guide'
      },
      pipelineVersion: '6.0-audio-driven-dialogue'
    }),
    shot(3, {
      title: 'Elena escucha',
      durationSeconds: 8,
      visualPrompt:
        'Regresamos a Elena y Mariana. Elena levanta lentamente la mirada del cuaderno y procesa la propuesta. Mariana espera en silencio. No hay diálogo adicional.',
      camera:
        'Plano medio de reacción con Elena dominante y Mariana presente a distancia respetuosa, movimiento de cámara mínimo y continuo, sin cortes.',
      spokenText: '',
      dialogueLines: [],
      mode: 'video',
      characterIds: [ELENA, MARIANA],
      characterStateIds: {
        [ELENA]: 'elena-b-street',
        [MARIANA]: 'mariana-guide'
      },
      pipelineVersion: '6.0-scene-plan-sync'
    })
  ];

  scene.status = 'pending';
  scene.error = undefined;
  scene.imageAsset = undefined;
  scene.voiceAsset = undefined;
  scene.videoAsset = undefined;
  scene.productionStrategy = 'real-cinema-v2';

  project.productionLog.push(
    new Date().toISOString() +
      ' ViralCine 6 Safe: Escena 3 replanificada en 3x8s: setup silencioso, diálogo audio-driven de Mariana y reacción silenciosa.'
  );

  validateScene3SynchronizedV6(project);
  return scene;
}

export function validateScene3SynchronizedV6(project: FilmProject) {
  if (!project.plan) throw new Error('El proyecto no tiene plan.');
  const scene = project.plan.scenes.find((item) => item.order === 3);
  if (!scene) throw new Error('No existe la Escena 3.');

  const shots = [...scene.shots].sort((a, b) => a.order - b.order);
  if (shots.length !== 3) {
    throw new Error('Escena 3 debe tener exactamente 3 tomas.');
  }
  if (shots.some((shot) => shot.durationSeconds !== 8)) {
    throw new Error('Escena 3 debe ser 3x8s.');
  }
  if (shots.reduce((sum, shot) => sum + shot.durationSeconds, 0) !== 24) {
    throw new Error('Escena 3 debe durar exactamente 24s.');
  }

  const speaking = shots.filter((shot) => shot.spokenText.trim());
  if (speaking.length !== 1 || speaking[0].order !== 2) {
    throw new Error('Solo E3/T2 puede contener diálogo.');
  }
  if (speaking[0].speakerId !== MARIANA) {
    throw new Error('E3/T2 debe pertenecer a Mariana.');
  }
  if (speaking[0].spokenText !== DIALOGUE) {
    throw new Error('E3/T2 no conserva el diálogo exacto aprobado.');
  }
  if (!/labios|boca/i.test(speaking[0].camera + ' ' + speaking[0].visualPrompt)) {
    throw new Error('E3/T2 debe exigir visibilidad facial para sincronía labial.');
  }

  return {
    sceneOrder: 3,
    durationSeconds: 24,
    shotCount: 3,
    dialogueShot: 2,
    speakerId: MARIANA,
    exactDialogue: DIALOGUE
  };
}

export const SCENE3_DIALOGUE_V6 = DIALOGUE;
export const SCENE3_MARIANA_ID_V6 = MARIANA;
export const SCENE3_ELENA_ID_V6 = ELENA;
