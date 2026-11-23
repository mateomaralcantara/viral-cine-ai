import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVeoRealMotionPrompt } from '../lib/engine/provider-prompts-v5';
import { estimatedGenerationCost } from '../lib/engine/spend-guard';

const shot: any = {
  id: 'pilot-15d-01',
  order: 1,
  title: 'La moneda',
  durationSeconds: 6,
  visualPrompt:
    'Prompt largo con FACE MASTER, BODY MASTER, Identity Lock y muchas restricciones negativas.',
  camera:
    'Comenzar muy bajo y seguir la mano. Sin cortes. Sin zoom artificial.',
  spokenText: '',
  dialogueLines: [],
  mode: 'video',
  characterIds: ['char-v5-elena-0001'],
  videoModelOverride: 'veo-3.1-lite-generate-preview',
  motionSpec: {
    version: '5.0-real-motion-v1',
    intention: 'Recoger la moneda.',
    startState: 'Elena está agachada junto a la moneda.',
    endState:
      'Elena queda medio incorporada con la moneda visible en la palma.',
    bodyMotion:
      'Una sola acción física: mano derecha alcanza la moneda, pulgar e índice la pinzan, Elena se incorpora lentamente. Prohibido caminar o meter las manos en los bolsillos.',
    environmentMotion:
      'Reflejos de tráfico sutiles.',
    cameraMotion:
      'Seguimiento corto de la mano y ascenso vertical suave sincronizado con Elena; movimiento continuo.',
    shotClass: 'hero',
    preferredProviders: ['veo'],
    minMotionScore: 8,
    minIdentityScore: 9,
    minContinuityScore: 9,
    minAnatomyScore: 9,
    minCameraScore: 9,
    allowStillFallbackFinal: false
  }
};

test('Veo recibe prompt compacto basado en movimiento, no el prompt authored completo', () => {
  const prompt = buildVeoRealMotionPrompt(shot);

  assert.match(prompt, /Animate the approved reference image faithfully/i);
  assert.match(prompt, /mano derecha alcanza la moneda/i);
  assert.match(prompt, /ascenso vertical suave/i);
  assert.doesNotMatch(prompt, /FACE MASTER|BODY MASTER|Identity Lock/i);
  assert.doesNotMatch(prompt, /Prohibido caminar/i);
  assert.ok(prompt.length < 1400);
});

test('Veo Lite reserva US$0.30 para 6 segundos', () => {
  assert.equal(estimatedGenerationCost(shot), 0.3);
});
