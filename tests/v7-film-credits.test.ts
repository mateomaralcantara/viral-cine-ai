import test from 'node:test';
import assert from 'node:assert/strict';
import { agentCredits, chunk, endCredits, prettyVideoModel, type ProductionFacts } from '../lib/v7/production/film-credits';

const facts: ProductionFacts = {
  title: 'LOS CONVIDADOS AL ÁGAPE', subtitle: 'EPISODIO 1', author: 'Martin Mateo',
  videoModels: ['veo-3.1-fast-generate-001'], videoPlatform: 'vertex',
  voiceCast: [{ character: 'Narrador', voice: 'Brian (ElevenLabs)' }], dialogueOnCamera: true, originalMusic: true,
  qualityReviewed: true, repairedShots: 2, characterIdentities: 2, englishSubtitles: true, spanishSubtitles: true
};

test('prettyVideoModel', () => {
  assert.equal(prettyVideoModel('veo-3.1-fast-generate-001'), 'Google Veo 3.1 Fast');
  assert.equal(prettyVideoModel('veo-3.1-generate-001'), 'Google Veo 3.1');
});

test('agentes: solo se acredita lo que se usó y nunca nombres de proveedores', () => {
  const all = agentCredits(facts).map((c) => c.name).join(' | ');
  for (const s of ['Agente Director', 'Agente de Casting', 'Agente de Cinematografía', 'Agente de Voz', 'Agente Compositor', 'Agente Revisor', 'Agente Reparador', 'Agente Traductor', 'Agente Montador']) assert.ok(all.includes(s), s);
  assert.ok(!/ElevenLabs|Google|Gemini|Veo|Lyria|FFmpeg|Runway/i.test(all), 'sin proveedores: ' + all);
  const bare = agentCredits({ ...facts, voiceCast: [], originalMusic: false, qualityReviewed: false, repairedShots: 0, characterIdentities: 0, englishSubtitles: false, dialogueOnCamera: false })
    .map((c) => c.name).join(' | ');
  for (const s of ['Agente de Voz', 'Compositor', 'Revisor', 'Reparador', 'Casting', 'Traductor']) assert.ok(!bare.includes(s), s);
});

test('créditos finales incluyen autoría, voces y agentes; chunk agrupa', () => {
  const end = endCredits(facts);
  assert.equal(end[0].name, 'Martin Mateo');
  assert.ok(end.some((c) => c.role === 'Voz de Narrador'));
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
