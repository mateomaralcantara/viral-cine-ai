import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSingleVisualPlan } from '../lib/engine/single-visual-plan-v4';

const project: any = {
  id: 'project-1',
  input: { aspectRatio: '16:9' },
  plan: {
    creativeDirection: 'Drama histórico sobrio.',
    characters: [
      {
        id: 'jesus',
        name: 'Jesús',
        appearance: 'Hombre judío de 33 años.',
        wardrobe: 'Túnica marfil gastada.'
      }
    ]
  }
};

const scene: any = {
  id: 'scene-2',
  order: 2,
  visualPrompt: 'Salida del pretorio hacia una calle estrecha de Jerusalén siglo I.',
  negativePrompt: 'sin anacronismos',
  characterIds: ['jesus']
};

test('single visual prioriza la acción dominante explícita y respeta la cámara de la toma', () => {
  const shot: any = {
    id: 'shot-2',
    order: 2,
    durationSeconds: 7,
    visualPrompt:
      'Calle estrecha de Jerusalén del siglo I a la salida del pretorio, luz fría de mañana y polvo suspendido. ' +
      'Jesús ya lleva el gran madero sobre los hombros y comienza a avanzar. ' +
      'Una sola acción dominante: el inicio de la marcha bajo el peso del madero. ' +
      'Sin montaje, sin POV.',
    camera:
      'Plano medio lateral de seguimiento, una sola toma continua; cámara acompaña los primeros pasos de Jesús.',
    spokenText:
      'áspera, por el cansancio acumulado y por todo lo que significaba. Los soldados abrieron paso entre la',
    speakerId: 'narrator',
    dialogueLines: [{ id: 'l1', speakerId: 'narrator', text: 'texto', startSeconds: 0 }],
    characterIds: ['jesus']
  };

  const plan = buildSingleVisualPlan(project, scene, shot);

  assert.match(plan.prompt, /Narrative action for this frame: el inicio de la marcha bajo el peso del madero/i);
  assert.match(plan.videoPrompt, /Continue only this immediate action: el inicio de la marcha bajo el peso del madero/i);
  assert.match(plan.prompt, /Camera direction: Plano medio lateral de seguimiento/i);
  assert.match(plan.videoPrompt, /Camera direction: Plano medio lateral de seguimiento/i);
  assert.doesNotMatch(plan.prompt, /Narration context only:/i);
  assert.doesNotMatch(plan.videoPrompt, /Continue only this immediate action: Calle estrecha/i);
});

test('single visual acepta una idea visual explícita como beat dominante', () => {
  const shot: any = {
    id: 'shot-5',
    order: 5,
    durationSeconds: 7,
    visualPrompt:
      'Calle de Jerusalén del siglo I. ' +
      'Desde detrás de María y Juan, la cámara observa a Jesús alejándose. ' +
      'Una sola idea visual: la distancia física y emocional entre una madre y su hijo.',
    camera: 'Contraplano cinematográfico desde detrás de María y Juan.',
    spokenText: 'fragmento narrado',
    speakerId: 'narrator',
    dialogueLines: [{ id: 'l1', speakerId: 'narrator', text: 'fragmento narrado', startSeconds: 0 }],
    characterIds: ['jesus']
  };

  const plan = buildSingleVisualPlan(project, scene, shot);

  assert.match(plan.prompt, /Narrative action for this frame: la distancia física y emocional entre una madre y su hijo/i);
  assert.match(plan.videoPrompt, /Continue only this immediate action: la distancia física y emocional entre una madre y su hijo/i);
});


test('single visual video bloquea luminarias modernas y deriva de identidad', () => {
  const shot: any = {
    id: 'shot-5b',
    order: 5,
    durationSeconds: 7,
    visualPrompt:
      'Calle de Jerusalén del siglo I. ' +
      'Una sola acción dominante: María y Juan permanecen de espaldas mientras Jesús se aleja cargando un solo madero.',
    camera: 'Contraplano continuo desde detrás de María y Juan.',
    spokenText: 'fragmento narrado',
    speakerId: 'narrator',
    dialogueLines: [{ id: 'l1', speakerId: 'narrator', text: 'fragmento narrado', startSeconds: 0 }],
    characterIds: ['jesus']
  };

  const plan = buildSingleVisualPlan(project, scene, shot);

  assert.match(plan.videoPrompt, /Do not add anachronistic or modern street furniture/i);
  assert.match(plan.videoPrompt, /wall lamps/i);
  assert.match(plan.videoPrompt, /Do not change established age, facial hair or recognizable identity/i);
});
