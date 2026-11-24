/**
 * DESGLOSE DEL GUION CON IA: un guion pegado en la web se convierte en una película lista
 * para el estudio (escenas, tomas, diálogos en cámara, voces en off, personajes, vestuario, música).
 * El modelo propone el desglose; esta función lo normaliza con las reglas aprendidas en los episodios:
 *  - tomas de 4, 6 u 8 s; una frase dicha en cámara SIEMPRE cabe en su toma (si no, se reparte);
 *  - quien no tiene imagen (narrador, voces) habla en off; bocas cerradas en las tomas sin diálogo;
 *  - cada toma nombra a sus personajes con su aspecto fijo y el vestuario de la escena;
 *  - nunca texto ni subtítulos en pantalla.
 */
import type { GoogleGenAI } from '@google/genai';
import type { ShortFilmBeat, ShortFilmSpec } from '@/lib/v7/presets/short-film-builder';
import { speechSeconds, VOICE_START_SECONDS, VOICE_TAIL_SECONDS } from '@/lib/v7/production/film-voice-mix';

export const BREAKDOWN_SCHEMA = {
  type: 'object',
  properties: {
    premisa: { type: 'string' },
    estilo: { type: 'string' },
    personajes: { type: 'array', items: { type: 'object', properties: {
      clave: { type: 'string' }, nombre: { type: 'string' }, edad: { type: 'number' }, rol: { type: 'string' },
      apariencia: { type: 'string' }, voz: { type: 'string' }, tieneImagen: { type: 'boolean' }
    }, required: ['clave', 'nombre', 'edad', 'rol', 'apariencia', 'voz', 'tieneImagen'] } },
    escenas: { type: 'array', items: { type: 'object', properties: {
      titulo: { type: 'string' }, resumen: { type: 'string' }, lugar: { type: 'string' }, vestuario: { type: 'string' },
      reparto: { type: 'array', items: { type: 'string' } }, musica: { type: 'string' }, musicaPrompt: { type: 'string' },
      tomas: { type: 'array', items: { type: 'object', properties: {
        titulo: { type: 'string' }, tipo: { type: 'string', enum: ['dialogo', 'voz', 'imagen'] }, personaje: { type: 'string' },
        frase: { type: 'string' }, camara: { type: 'string' }, descripcion: { type: 'string' }, segundos: { type: 'number' }
      }, required: ['titulo', 'tipo', 'personaje', 'frase', 'camara', 'descripcion', 'segundos'] } }
    }, required: ['titulo', 'resumen', 'lugar', 'vestuario', 'reparto', 'musica', 'musicaPrompt', 'tomas'] } }
  },
  required: ['premisa', 'estilo', 'personajes', 'escenas']
} as const;

export function buildBreakdownPrompt(input: { title: string; story: string; minutes: number; genre: string }) {
  return [
    `Eres el primer ayudante de dirección de una productora. Desglosa este guion COMPLETO en un plan de rodaje («${input.title}», ${input.genre}).`,
    '- NUNCA resumas ni recortes el guion para que dure menos: cada escena, cada plano y cada diálogo del autor deben estar. La duración final es la que resulte del guion completo' + (input.minutes ? ` (el autor estima unos ${input.minutes} minutos, solo como referencia).` : '.'),
    'REGLAS:',
    '- Respeta el texto del autor: los diálogos se copian tal cual, en orden, sin resumir ni inventar.',
    '- Escenas = secuencias del guion. Tomas de 4, 6 u 8 segundos (segundos).',
    '- MUY IMPORTANTE: si el guion numera o marca planos/tomas (PLANO 1, P01, TOMA 2, SHOT 3, «Plano general:»…), crea EXACTAMENTE una toma por cada plano, en el mismo orden. Nunca juntes dos planos en una toma ni te saltes ninguno.',
    '- tipo «dialogo»: el personaje lo dice EN CÁMARA. tipo «voz»: voz en off (narrador, recuerdos, voces sin cuerpo). tipo «imagen»: sin voz (frase vacía).',
    '- Una frase larga se reparte en varias tomas consecutivas (unas 14 letras por segundo).',
    '- descripcion: solo lo VISIBLE, en una frase, nombrando a los personajes por su nombre. Nada de letras, carteles ni texto legible.',
    '- personajes: clave corta en minúsculas sin acentos (p. ej. «martin»); apariencia física fija y concreta (edad, pelo, rasgos); voz descrita; tieneImagen=false para narrador y voces sin cuerpo. Incluye siempre un «narrador» aunque no hable.',
    '- vestuario: el de los protagonistas en esa escena. musicaPrompt: en inglés, instrumental, sin voces.',
    '\nGUION:\n' + input.story
  ].join('\n');
}

type Raw = {
  premisa?: string; estilo?: string;
  personajes?: Array<{ clave?: string; nombre?: string; edad?: number; rol?: string; apariencia?: string; voz?: string; tieneImagen?: boolean }>;
  escenas?: Array<{ titulo?: string; resumen?: string; lugar?: string; vestuario?: string; reparto?: string[]; musica?: string; musicaPrompt?: string;
    tomas?: Array<{ titulo?: string; tipo?: string; personaje?: string; frase?: string; camara?: string; descripcion?: string; segundos?: number }> }>;
};

export const slugKey = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'personaje';
type Sec = 4 | 6 | 8;
const onCameraSeconds = (line: string): Sec | null => { const n = speechSeconds(line) + 0.6; return n <= 4 ? 4 : n <= 6 ? 6 : n <= 8 ? 8 : null; };
const voiceOverSeconds = (line: string): Sec | null => { const n = speechSeconds(line) + VOICE_START_SECONDS + VOICE_TAIL_SECONDS; return n <= 4 ? 4 : n <= 6 ? 6 : n <= 8 / 0.75 ? 8 : null; };
const snap = (n: number): Sec => (n <= 4 ? 4 : n <= 6 ? 6 : 8);

/** Parte una frase por oraciones, comas o, en último caso, por la mitad, hasta que quepa. */
export function splitToFit(line: string, fits: (s: string) => boolean): string[] {
  if (fits(line)) return [line];
  const pieces = line.match(/[^.!?…]+[.!?…]+[»"]?\s*|[^.!?…]+$/g)?.map((x) => x.trim()).filter(Boolean) ?? [line];
  const parts = pieces.length > 1 ? pieces : line.split(/(?<=,)\s+/);
  const out: string[] = []; let cur = '';
  for (const p of parts) { const next = cur ? cur + ' ' + p : p; if (cur && !fits(next)) { out.push(cur); cur = p; } else cur = next; }
  if (cur) out.push(cur);
  return out.flatMap((p) => {
    if (fits(p) || !p.includes(' ')) return [p];
    const mid = p.length / 2; const spaces = [...p.matchAll(/ /g)].map((m) => m.index!);
    const at = spaces.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
    return splitToFit(p.slice(0, at).trim() + '…', fits).concat(splitToFit(p.slice(at).trim(), fits));
  });
}

/** Convierte la propuesta del modelo en un guion de producción válido (ShortFilmSpec). */
export function normalizeBreakdown(raw: unknown, meta: { filmId: string; title: string; genre: string; serie: string; quality?: string }): ShortFilmSpec {
  const r = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Raw;
  const chars = new Map<string, { key: string; name: string; age: number; role: string; appearance: string; voice: string; image: boolean }>();
  for (const p of r.personajes ?? []) {
    const key = slugKey(p.clave || p.nombre || '');
    if (chars.has(key)) continue;
    chars.set(key, { key, name: (p.nombre || key).trim(), age: Math.max(1, Math.round(Number(p.edad) || 40)), role: (p.rol || '').trim() || 'Personaje',
      appearance: p.tieneImagen === false ? 'Voz en off, sin imagen' : (p.apariencia || '').trim() || 'aspecto según el guion', voice: (p.voz || '').trim() || 'Voz natural.', image: p.tieneImagen !== false });
  }
  if (!chars.has('narrador')) chars.set('narrador', { key: 'narrador', name: 'Narrador', age: 55, role: 'Narrador', appearance: 'Voz en off, sin imagen', voice: 'Voz cinematográfica sobria.', image: false });
  const style = `${(r.estilo || 'Cine dramático de alto presupuesto, fotorrealista').trim().replace(/\.$/, '')}, formato 16:9.`;
  const LIMPIO = 'Sin subtítulos ni texto en pantalla.';

  const scenes = (r.escenas ?? []).filter((s) => (s.tomas ?? []).length).map((s) => {
    const cast = [...new Set((s.reparto ?? []).map(slugKey).filter((k) => chars.has(k)))];
    const visible = (txt: string) => [...chars.values()].filter((c) => c.image && new RegExp('\\b' + c.name.split(/\s+/)[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() + '\\b').test(txt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()));
    const beats: ShortFilmBeat[] = [];
    for (const t of s.tomas ?? []) {
      const camera = (t.camara || 'Plano medio').trim().replace(/\.$/, '');
      const desc = (t.descripcion || '').trim().replace(/\.$/, '');
      const who = slugKey(t.personaje || '');
      const speaker = chars.get(who);
      const line = (t.frase || '').trim();
      if (speaker && !cast.includes(who)) cast.push(who);
      const shown = visible(desc + ' ' + (t.tipo === 'dialogo' && speaker ? speaker.name : ''));
      for (const c of shown) if (!cast.includes(c.key)) cast.push(c.key);
      const looks = shown.map((c) => `${c.name}: ${c.appearance}.`).join(' ');
      const protagonist = [...chars.values()].find((c) => c.image);
      const wardrobe = s.vestuario && protagonist && shown.some((c) => c.key === protagonist.key) ? ` Vestuario: ${s.vestuario.trim().replace(/\.$/, '')}.` : '';
      const base = `En ${(s.lugar || 'el lugar de la escena').trim()}, ${desc}. ${looks}${wardrobe}`.replace(/\s+/g, ' ').trim();
      if (t.tipo === 'dialogo' && line && speaker?.image) {
        for (const [i, part] of splitToFit(line, (x) => onCameraSeconds(x) !== null).entries()) {
          beats.push({ title: `${t.titulo || 'Diálogo'}${i ? ` (${i + 1})` : ''}`, camera, onCamera: true, seconds: onCameraSeconds(part) ?? 8, voice: who, line: part,
            prompt: `${camera}. ${base} ${speaker.name} dice en español, con ${speaker.voice.replace(/\.$/, '').toLowerCase()}: «${part}». ${style} ${LIMPIO}` });
        }
      } else if (line && (t.tipo === 'voz' || t.tipo === 'dialogo')) {
        const voice = speaker ? who : 'narrador';
        for (const [i, part] of splitToFit(line, (x) => voiceOverSeconds(x) !== null).entries()) {
          beats.push({ title: `${t.titulo || 'Voz'}${i ? ` (${i + 1})` : ''}`, camera, seconds: voiceOverSeconds(part) ?? 8, voice, line: part,
            prompt: `${camera}. ${base} Bocas cerradas. ${style} ${LIMPIO}` });
        }
      } else {
        beats.push({ title: t.titulo || 'Imagen', camera, seconds: snap(Number(t.segundos) || 6), voice: 'narrador', line: '',
          prompt: `${camera}. ${base} Bocas cerradas. ${style} ${LIMPIO}` });
      }
    }
    if (!cast.includes('narrador')) cast.push('narrador');
    return { title: (s.titulo || 'Escena').trim(), summary: (s.resumen || '').trim() || (s.titulo || ''), location: (s.lugar || '').trim(), wardrobe: (s.vestuario || '').trim(),
      cast, beats, music: (s.musica || '').trim() || undefined, musicPrompt: (s.musicaPrompt || '').trim() || undefined };
  });
  if (!scenes.length) throw new Error('El desglose no produjo ninguna escena. Revisa que el guion tenga escenas y diálogos.');
  return {
    id: meta.filmId, title: meta.title,
    // El guion guardado exige una premisa de al menos 20 letras y un género de al menos 2.
    premise: [((r.premisa || '').trim()), `${meta.title}: ${scenes[0].summary || scenes[0].title}`].find((x) => x.length >= 20) ?? `${meta.title}, película producida con ViralCine.`,
    genre: meta.genre.trim().length >= 2 ? meta.genre.trim() : 'Drama', audience: 'Público adulto', visualStyle: style,
    continuityNotes: ['Misma cara de cada personaje en todas las tomas (ficha oficial)', 'Sin texto en pantalla'],
    metadata: { serie: meta.serie, format: 'pelicula', creationMode: 'desglose-ia', qualityPreset: meta.quality ?? 'cine', puertaDeCalidad: true, continuidadObligatoria: true },
    characters: [...chars.values()].map((c) => ({ key: c.key, name: c.name, age: c.age, role: c.role, appearance: c.appearance, voice: c.voice })),
    scenes
  };
}

/** Modelos a probar en orden: los de Gemini 3 (los mismos que usan los agentes revisores) y después los 2.5. */
export const BREAKDOWN_MODELS = [...new Set([
  process.env.V7_BREAKDOWN_MODEL?.trim(), process.env.V7_QA_MODEL?.trim(),
  'gemini-3-pro', 'gemini-3-pro-preview', 'gemini-3-flash', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'
].filter((m): m is string => !!m))];

/** Pide el desglose al modelo (unos céntimos). */
export async function requestBreakdown(ai: GoogleGenAI, input: { title: string; story: string; minutes: number; genre: string }) {
  const tried: string[] = [];
  let lastError = '';
  for (const model of BREAKDOWN_MODELS) {
    tried.push(model);
    try {
      const res = await ai.models.generateContent({
        model, contents: [{ role: 'user', parts: [{ text: buildBreakdownPrompt(input) }] }],
        config: { temperature: 0.3, maxOutputTokens: 60000, responseMimeType: 'application/json', responseJsonSchema: BREAKDOWN_SCHEMA }
      });
      return { raw: res.text ?? '', model };
    } catch (e) {
      lastError = String((e as Error)?.message ?? e);
      if (!/404|NOT_FOUND|not found|is not supported/i.test(lastError)) break;
    }
  }
  throw new Error(`No se pudo desglosar el guion (probados: ${tried.join(', ')}): ` + lastError.replace(/\s+/g, ' ').slice(0, 220));
}

/** Planos que el autor marcó en cada escena del guion (PLANO 1, P01, TOMA 2…), para comprobar el desglose. */
export function countMarkedShots(story: string) {
  return (story.match(/^\s*(?:\*\*)?\s*(?:PLANO|TOMA|SHOT)\s*\d+|^\s*P\d{2}\b/gim) ?? []).length;
}

/** Parte un guion largo en trozos que el modelo puede desglosar enteros, cortando antes de cada escena/secuencia. */
export function splitScript(story: string, maxChars = 14000): string[] {
  if (story.length <= maxChars) return [story];
  const lines = story.split(/\r?\n/);
  const heading = /^\s*(#{1,3}\s|ESCENA\b|SECUENCIA\b|SEQ\b|INT\.|EXT\.|INT\/EXT|ESC\.?\s*\d|SCENE\b)/i;
  const out: string[] = [];
  let cur: string[] = [];
  let size = 0;
  for (const line of lines) {
    // Preferencia: cortar justo antes de una escena. Solo si una escena es enorme, se corta en una línea en blanco.
    if (size > maxChars * 0.5 && heading.test(line) && cur.length) { out.push(cur.join('\n')); cur = []; size = 0; }
    cur.push(line); size += line.length + 1;
    if (size > maxChars * 1.5 && line.trim() === '') { out.push(cur.join('\n')); cur = []; size = 0; }
  }
  if (cur.length) out.push(cur.join('\n'));
  return out.filter((x) => x.trim().length);
}

/** Desglose completo, por partes: cada parte reutiliza las claves de personajes ya creadas. */
export async function requestFullBreakdown(ai: GoogleGenAI, input: { title: string; story: string; minutes: number; genre: string }, onProgress?: (msg: string) => void) {
  const parts = splitScript(input.story);
  const merged: Raw = { premisa: '', estilo: '', personajes: [], escenas: [] };
  let model = '';
  for (const [i, part] of parts.entries()) {
    onProgress?.(`parte ${i + 1} de ${parts.length}`);
    const known = (merged.personajes ?? []).map((p) => `${p.clave}=${p.nombre}`).join(', ');
    const story = (parts.length > 1 ? `[Parte ${i + 1} de ${parts.length} del guion. ${known ? 'Usa EXACTAMENTE estas claves para los personajes ya conocidos: ' + known + '.' : ''}]\n` : '') + part;
    const r = await requestBreakdown(ai, { ...input, story });
    model = r.model;
    const raw = JSON.parse(r.raw) as Raw;
    if (!merged.premisa && raw.premisa) merged.premisa = raw.premisa;
    if (!merged.estilo && raw.estilo) merged.estilo = raw.estilo;
    for (const p of raw.personajes ?? []) if (!(merged.personajes ?? []).some((x) => slugKey(x.clave || x.nombre || '') === slugKey(p.clave || p.nombre || ''))) merged.personajes!.push(p);
    merged.escenas!.push(...(raw.escenas ?? []));
  }
  return { raw: merged, model, parts: parts.length };
}
