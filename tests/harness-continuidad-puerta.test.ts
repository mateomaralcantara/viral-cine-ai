import assert from 'node:assert/strict';
import { test } from 'node:test';
import { qualityGate, gateEnabled } from '../lib/v7/qa/quality-gate';
import { preflightScene, preflightShot, type PreflightShotInput } from '../lib/v7/qa/scene-preflight';
import { anchorCandidates, castInShot, continuityKeyframePrompt, continuityRequired } from '../lib/v7/production/continuity-chain';
import type { CharacterSheet } from '../lib/v7/production/character-identity';

const good = { puntuacion: 9, coincideConGuion: 9, identidad: 9, textoEnPantalla: false, bocasHablando: false, problemas: [], veredicto: 'aprobar' as const };

test('puerta: una toma perfecta pasa', () => {
  assert.deepEqual(qualityGate({ review: good, onCamera: false, showsCharacter: true }), { pass: true, reasons: [] });
});

test('puerta: sin revisión, nunca pasa', () => {
  assert.equal(qualityGate({ review: null, onCamera: false, showsCharacter: false }).pass, false);
});

test('puerta: un solo problema crítico la para aunque la nota sea alta', () => {
  const r = qualityGate({ review: { ...good, problemas: [{ tipo: 'anatomía', gravedad: 'critico', descripcion: 'dedos fusionados' }] }, onCamera: false, showsCharacter: false });
  assert.equal(r.pass, false);
  assert.match(r.reasons.join(' '), /dedos fusionados/);
});

test('puerta: vestuario o identidad «medio» también la paran; un defecto leve no', () => {
  assert.equal(qualityGate({ review: { ...good, problemas: [{ tipo: 'vestuario', gravedad: 'medio', descripcion: 'capucha puesta' }] }, onCamera: false, showsCharacter: true }).pass, false);
  assert.equal(qualityGate({ review: { ...good, problemas: [{ tipo: 'luz', gravedad: 'leve', descripcion: 'algo oscura' }] }, onCamera: false, showsCharacter: true }).pass, true);
});

test('puerta: cara que no coincide con la ficha no pasa', () => {
  assert.equal(qualityGate({ review: { ...good, identidad: 6 }, onCamera: false, showsCharacter: true }).pass, false);
  assert.equal(qualityGate({ review: { ...good, identidad: null }, onCamera: false, showsCharacter: true }).pass, false);
  assert.equal(qualityGate({ review: { ...good, identidad: null }, onCamera: false, showsCharacter: false }).pass, true);
});

test('puerta: un diálogo exige haberlo escuchado y que se entienda ≥ 85 %', () => {
  assert.equal(qualityGate({ review: good, onCamera: true, showsCharacter: true }).pass, false);
  assert.equal(qualityGate({ review: good, onCamera: true, showsCharacter: true, listenCoverage: 0.7 }).pass, false);
  assert.equal(qualityGate({ review: good, onCamera: true, showsCharacter: true, listenCoverage: 0.95 }).pass, true);
});

test('puerta y continuidad activas por defecto; solo se apagan explícitamente', () => {
  assert.equal(gateEnabled({}), true);
  assert.equal(gateEnabled({ metadata: { puertaDeCalidad: false } }), false);
  assert.equal(continuityRequired({}), true);
  assert.equal(continuityRequired({ metadata: { continuidadObligatoria: false } }), false);
});

const base: PreflightShotInput = {
  label: 'E01-P01', prompt: 'Plano medio. Martin camina por la cumbre nevada, capucha bajada sobre los hombros, chaqueta azul oscuro.',
  seconds: 6, onCamera: false, spokenText: '', costume: 'chaqueta técnica azul oscuro, capucha bajada sobre los hombros',
  cast: [{ nombre: 'Martin', aprobado: true }], hasReference: true, continuityRequired: true
};

test('análisis inicial: una toma limpia sale en verde', () => {
  const r = preflightShot(base);
  assert.equal(r.semaforo, 'verde');
});

test('análisis inicial: sin foto de continuidad la toma queda en rojo (bloquea)', () => {
  const r = preflightShot({ ...base, hasReference: false });
  assert.equal(r.semaforo, 'rojo');
  assert.ok(r.problemas.some((p) => p.tipo === 'continuidad'));
});

test('análisis inicial: pizarra y palabras sensibles se detectan y se propone el arreglo', () => {
  const r = preflightShot({ ...base, prompt: base.prompt + ' Detrás, una pizarra. Recuerda la muerte de su esposa.' });
  assert.ok(r.problemas.some((p) => p.tipo === 'texto en pantalla'));
  assert.ok(r.problemas.some((p) => p.tipo === 'filtro de Google'));
  assert.match(r.promptSugerido, /sin ninguna escritura/);
});

test('análisis inicial: una frase que no cabe en la toma bloquea', () => {
  const r = preflightShot({ ...base, onCamera: true, seconds: 4, spokenText: '¿Dónde estabas cuando ella tenía miedo? ¿Cuando me preguntó si iba a morir?' });
  assert.equal(r.semaforo, 'rojo');
  assert.ok(r.problemas.some((p) => p.tipo === 'diálogo' && p.nivel === 'bloquea'));
});

test('análisis inicial: el vestuario de la escena se añade si el texto no lo repite', () => {
  const r = preflightShot({ ...base, prompt: 'Plano medio. Martin mira el horizonte.' });
  assert.ok(r.problemas.some((p) => p.tipo === 'vestuario'));
  assert.match(r.promptSugerido, /Vestuario: chaqueta técnica azul oscuro/);
});

test('análisis de escena: lista para generar solo si ninguna toma está en rojo', () => {
  assert.equal(preflightScene([base]).listaParaGenerar, true);
  const s = preflightScene([base, { ...base, label: 'E01-P02', hasReference: false }]);
  assert.equal(s.listaParaGenerar, false);
  assert.deepEqual(s.bloqueadas, ['E01-P02']);
});

const martin = { key: 'martin', nombre: 'Martin', descripcion: 'hombre de 42 años, barba entrecana', vestuarios: {}, voz: null, notas: '', aprobado: { maestroSha256: 'x', fecha: 'x' } } as CharacterSheet;
const esposa = { ...martin, key: 'esposa', nombre: 'Elena', descripcion: 'mujer de 40 años' } as CharacterSheet;

test('continuidad: solo cuentan los personajes nombrados en el texto y en el reparto', () => {
  const shot = { characterIds: ['f-character-martin', 'f-character-esposa'] };
  assert.deepEqual(castInShot(shot, 'Martin mira la foto.', [martin, esposa]).map((c) => c.key), ['martin']);
  assert.deepEqual(castInShot(shot, 'Una taza sobre la mesa.', [martin, esposa]), []);
});

test('continuidad: el ancla es la toma anterior más cercana con el mismo personaje (cruza escenas)', () => {
  const sh = (label: string, prompt: string) => ({ label, shot: { characterIds: ['f-character-martin'], visualPrompt: prompt } });
  const scenes = [
    { label: 'E01', shots: [sh('E01-P01', 'Martin en el hospital.'), sh('E01-P02', 'Un monitor.')] },
    { label: 'E02', shots: [sh('E02-P01', 'Una calle vacía.'), sh('E02-P02', 'Martin camina.'), sh('E02-P03', 'Martin se sienta.')] }
  ];
  const promptOf = (s: { shot: { visualPrompt?: string } }) => s.shot.visualPrompt ?? '';
  assert.deepEqual(anchorCandidates(scenes, 'E02-P03', ['martin'], promptOf, [martin]), ['E02-P02', 'E01-P01']);
  assert.deepEqual(anchorCandidates(scenes, 'E01-P01', ['martin'], promptOf, [martin]), []);
});

test('continuidad: la instrucción fija cara, ropa y luz de la toma anterior sin copiar su encuadre', () => {
  const t = continuityKeyframePrompt([{ nombre: 'Martin', descripcion: 'barba entrecana' }], 'Primer plano de Martin.', { anchorLabel: 'E02-P02', costume: 'chaqueta azul' });
  assert.match(t, /EXACTAMENTE esas mismas personas/);
  assert.match(t, /E02-P02/);
  assert.match(t, /NO copies su encuadre/);
  assert.match(t, /VESTUARIO FIJO DE LA ESCENA: chaqueta azul/);
});

test('análisis inicial: «sin subtítulos ni texto en pantalla» no cuenta como una pantalla', () => {
  const r = preflightShot({ ...base, prompt: base.prompt + ' Sin subtítulos ni texto en pantalla.' });
  assert.ok(!r.problemas.some((p) => p.detalle.includes('la pantalla')));
});
