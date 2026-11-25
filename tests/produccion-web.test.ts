import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateFilmBudget } from '../lib/v7/creation/budget-estimate';
import { normalizeBreakdown, splitToFit } from '../lib/v7/creation/script-breakdown';
import { assignPhotos } from '../lib/v7/production/author-photos';
import { FILM_KEYS, filmKeyFor } from '../lib/v7/presets/film-registry';
import { buildShortFilmBundle } from '../lib/v7/presets/short-film-builder';
import { speechSeconds } from '../lib/v7/production/film-voice-mix';

test('presupuesto: 15 min de Veo a US$0.15/s más fotos, revisión, música y margen', () => {
  const b = estimateFilmBudget({ minutes: 15 });
  assert.equal(b.seconds, 900);
  assert.equal(b.partidas[0].usd, 135);
  assert.ok(b.total > 135 && b.total < 200, String(b.total));
  assert.equal(b.pending, b.total);
  // Con todas las fotos subidas por el autor, no se pagan fotos de continuidad.
  const withPhotos = estimateFilmBudget({ seconds: 900, shots: 160, shotsWithPhoto: 160 });
  assert.equal(withPhotos.partidas[1].usd, 0);
  assert.equal(estimateFilmBudget({ minutes: 15, spentUsd: 50 }).pending, Math.round((b.total - 50) * 100) / 100);
});

test('fotos del autor: «P03» en el nombre va a esa toma; las demás, en orden, a las libres', () => {
  const all = ['E02-P01', 'E02-P02', 'E02-P03', 'E02-P04'];
  const r = assignPhotos(['salon.jpg', 'toma_P03.png', 'martin.webp'], 'E02', ['E02-P01', 'E02-P03', 'E02-P04'], all);
  assert.deepEqual(r.map((x) => x.shotId), ['E02-P01', 'E02-P03', 'E02-P04']);
  assert.equal(assignPhotos(['a.jpg', 'b.jpg'], 'E02', ['E02-P02'], all)[1].shotId, null);
});

test('registro: las películas creadas desde la web funcionan con los agentes por su id', () => {
  assert.equal(FILM_KEYS['film-el-sexto-silencio-v7'], 'film-el-sexto-silencio-v7');
  assert.equal(FILM_KEYS.episodio2, 'film-convidados-ep02-v7');
  assert.equal(FILM_KEYS['../malo'], undefined);
  assert.equal(filmKeyFor('film-convidados-ep02-v7'), 'episodio2');
  assert.equal(filmKeyFor('film-el-sexto-silencio-v7'), 'film-el-sexto-silencio-v7');
});

const RAW = {
  premisa: 'Un hombre escucha un silencio imposible.', estilo: 'Cine de suspenso fotorrealista',
  personajes: [
    { clave: 'Mateo', nombre: 'Mateo', edad: 45, rol: 'Protagonista', apariencia: 'hombre de 45 años, pelo gris corto', voz: 'Voz grave y cansada.', tieneImagen: true },
    { clave: 'voz', nombre: 'La Voz', edad: 99, rol: 'Voz sin cuerpo', apariencia: '', voz: 'Voz profunda.', tieneImagen: false }
  ],
  escenas: [{ titulo: 'El silencio', resumen: 'Mateo despierta.', lugar: 'una habitación vacía de noche', vestuario: 'camisa blanca', reparto: ['mateo', 'voz'],
    musica: 'Tensión', musicaPrompt: 'Dark suspense drone',
    tomas: [
      { titulo: 'Despierta', tipo: 'imagen', personaje: '', frase: '', camara: 'Primer plano', descripcion: 'Mateo abre los ojos', segundos: 5 },
      { titulo: 'Pregunta', tipo: 'dialogo', personaje: 'mateo', frase: '¿Quién anda ahí? No escucho nada, ni siquiera mi propia respiración, y eso no es posible en una casa tan vieja como esta.', camara: 'Plano medio', descripcion: 'Mateo se incorpora en la cama', segundos: 8 },
      { titulo: 'Responde', tipo: 'dialogo', personaje: 'voz', frase: 'Nadie.', camara: 'Plano general', descripcion: 'la habitación vacía', segundos: 4 }
    ] }]
};

test('desglose: diálogos en cámara que caben, voces sin imagen en off y personajes con su aspecto fijo', () => {
  const spec = normalizeBreakdown(RAW, { filmId: 'film-el-sexto-silencio-v7', title: 'EL SEXTO SILENCIO', genre: 'Suspenso', serie: 'el-sexto-silencio' });
  const beats = spec.scenes[0].beats;
  const onCam = beats.filter((b) => b.onCamera);
  assert.ok(onCam.length >= 2, 'la frase larga se reparte en varias tomas');
  for (const b of onCam) assert.ok(speechSeconds(b.line) + 0.6 <= (b.seconds ?? 8), b.line);
  assert.ok(onCam.every((b) => /Mateo: hombre de 45 años/.test(b.prompt) && /Vestuario: camisa blanca/.test(b.prompt)));
  const voz = beats.find((b) => b.voice === 'voz')!;
  assert.notEqual(voz.onCamera, true, 'quien no tiene imagen habla en off');
  assert.ok(beats.every((b) => /Sin subtítulos ni texto en pantalla/.test(b.prompt)));
  assert.equal(beats[0].seconds, 6);
  assert.ok(spec.characters.some((c) => c.key === 'narrador'));
  assert.equal(spec.metadata?.puertaDeCalidad, true);
  assert.ok(buildShortFilmBundle(spec).film.acts.length > 0, 'el bundle es válido para el estudio');
});

test('desglose: una frase sin pausas que no cabe se parte por la mitad', () => {
  const parts = splitToFit('palabra '.repeat(30).trim(), (x) => x.length <= 100);
  assert.ok(parts.length >= 3 && parts.every((p) => p.length <= 101));
});

test('material del autor: las fotos reparten el tiempo que dejan los videos (mínimo 2 s cada una)', async () => {
  const { photoSeconds, isVideoName } = await import('../lib/v7/production/author-photos');
  assert.equal(photoSeconds(8, 2, 0), 4);
  assert.equal(photoSeconds(8, 2, 5), 2);
  assert.equal(photoSeconds(6, 0, 3), 0);
  assert.equal(isVideoName('crimen.MOV'), true);
  assert.equal(isVideoName('foto.jpg', 'image/jpeg'), false);
});

test('desglose por partes: un guion largo se corta antes de una escena, sin perder texto', async () => {
  const { splitScript } = await import('../lib/v7/creation/script-breakdown');
  const scene = (n: number) => `ESCENA ${n}\n` + 'Mateo habla con Ross sobre el caso.\n'.repeat(120);
  const story = [1, 2, 3, 4, 5].map(scene).join('\n');
  const parts = splitScript(story, 8000);
  assert.ok(parts.length > 1);
  assert.equal(parts.join('\n'), story);
  assert.ok(parts.slice(1).every((p) => /^ESCENA \d/.test(p)));
});

test('importar tomas: el mismo diálogo se reconoce aunque cambie la descripción; distinto diálogo no', async () => {
  const { shotSimilarity } = await import('../lib/v7/production/import-shots');
  const a = { title: 'Reporte policial', line: 'Central, necesitamos a investigaciones especiales.', prompt: 'Primer plano del policía junto al coche patrulla bajo la lluvia' };
  const b = { title: 'El policía llama', line: 'Central, necesitamos a investigaciones especiales.', prompt: 'Plano medio: un agente uniformado habla por radio' };
  const c = { title: 'La llamada', line: 'Ha aparecido otro.', prompt: 'Ross contesta el teléfono' };
  assert.ok(shotSimilarity(a, b) >= 0.7);
  assert.ok(shotSimilarity(a, c) < 0.35);
});

test('revisor: «guion 1» y «cara 1» con nota 9.5 son la escala 0–1, no un suspenso', async () => {
  const { normalizeReview } = await import('../lib/v7/qa/shot-vision-review');
  const base = { textoEnPantalla: false, bocasHablando: false, problemas: [], veredicto: 'aprobar', motivo: '', promptSugerido: '' };
  const r = normalizeReview({ ...base, puntuacion: 9.5, coincideConGuion: 1, identidad: 1 }, { onCamera: true });
  assert.equal(r.coincideConGuion, 10);
  assert.equal(r.identidad, 10);
  const bad = normalizeReview({ ...base, puntuacion: 4, coincideConGuion: 1, identidad: 0 }, { onCamera: true });
  assert.equal(bad.coincideConGuion, 1, 'una toma mala sigue suspendiendo');
  assert.equal(normalizeReview({ ...base, puntuacion: 9, coincideConGuion: 8, identidad: 9 }).coincideConGuion, 8);
});
