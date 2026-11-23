/**
 * ANÁLISIS INICIAL DE PERFECCIÓN (función pura, gratis): revisa cada toma ANTES de gastar en video
 * con lo aprendido en el Episodio 1, y propone el texto corregido.
 */
import { speechSeconds } from '@/lib/v7/production/film-voice-mix';

export type PreflightLevel = 'bloquea' | 'riesgo' | 'aviso';
export type PreflightIssue = { nivel: PreflightLevel; tipo: string; detalle: string; arreglo: string };
export type PreflightShotInput = {
  label: string; prompt: string; seconds: number; onCamera: boolean; spokenText: string;
  /** Vestuario fijado para la escena (se copia igual en todas sus tomas). */
  costume?: string;
  /** Personajes que la toma muestra: con ficha aprobada o no, y si ya tienen foto de continuidad. */
  cast: Array<{ nombre: string; aprobado: boolean }>;
  hasReference: boolean;
  /** Las tomas con personaje exigen foto de continuidad. */
  continuityRequired: boolean;
};
export type PreflightShot = { label: string; nota: number; semaforo: 'verde' | 'amarillo' | 'rojo'; problemas: PreflightIssue[]; promptSugerido: string };

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Objetos que hacen que Veo escriba letras en pantalla. */
const TEXT_OBJECTS: Array<[RegExp, string]> = [
  [/\bpizarra/, 'la pizarra'], [/\bmonitor|\bpantalla(?! (en )?negr)/, 'la pantalla'], [/\bcartel|\bletrero|\brotulo/, 'el cartel'],
  [/\bperiodico|\brevista/, 'el periódico'], [/\bcarta\b|\bnota\b|\bhoja\b|\bpapel/, 'el papel'], [/\blibro/, 'los libros'],
  [/\bportatil|\bordenador|\bmovil|\btelefono/, 'el dispositivo']
];
/** Palabras que suelen disparar el filtro de Google (bloqueo gratis, pero se pierde tiempo). */
const FILTER_WORDS: Array<[RegExp, string]> = [
  [/\bmuert[oa]s?\b|\bmuerte\b|\bfallec/, 'la partida / su ausencia'], [/\bcadaver/, 'su cuerpo inmóvil'], [/\bsangr/, 'una herida'],
  [/\bcancer\b|\btumor/, 'la enfermedad'], [/\bsuicid/, 'la desesperación'], [/\bmatar|\basesin/, 'hacer daño'],
  [/\barma\b|\bpistola|\bcuchillo/, 'un objeto'], [/\bdesnud|\btorso desnudo/, 'vestido'], [/\bnin[oa]s?\b|\bbebe/, 'una figura adulta'],
  [/\bagonia|\bagoniz/, 'el dolor']
];
const HANDS = /\bmanos?\b|\bdedos?\b|\bsostien|\bagarr|\baprieta|\bsujeta|\bentrelaz|\bacaricia|\btoca\b|\bescribe|\bpasa la pagina/;
const CONTACT = /\babraz|\bbes[ao]|\bde la mano|\bse toman|\bapoya la cabeza/;

export function preflightShot(i: PreflightShotInput): PreflightShot {
  const p = plain(i.prompt);
  // Las prohibiciones («sin subtítulos ni texto en pantalla») no cuentan como objetos que aparecen.
  const seen = p.replace(/\b(sin|ni)\s+(subtitulos|texto|letras|logotipos|marcas)[^.,;]*/g, ' ');
  const issues: PreflightIssue[] = [];
  const add = (nivel: PreflightLevel, tipo: string, detalle: string, arreglo: string) => issues.push({ nivel, tipo, detalle, arreglo });
  const extra: string[] = [];
  let suggested = i.prompt.trim();

  // 1. Personajes y continuidad
  for (const c of i.cast) {
    if (!c.aprobado) add('bloquea', 'personaje', `${c.nombre} no tiene ficha ni retrato aprobado.`, 'Apruébalo en PERSONAJES · IDENTIDAD antes de generar.');
  }
  if (i.cast.length && !i.hasReference) {
    add(i.continuityRequired ? 'bloquea' : 'riesgo', 'continuidad', 'Sin foto de continuidad: Veo inventaría la cara (pasó en el Episodio 1).', 'Crea la foto con el Harness de Continuidad (npm run continuidad).');
  }
  if (i.costume && i.cast.length) {
    const words = plain(i.costume).split(/[^a-z0-9]+/).filter((w) => w.length > 4);
    const hits = words.filter((w) => p.includes(w)).length;
    if (words.length && hits / words.length < 0.5) {
      add('riesgo', 'vestuario', 'El texto no repite el vestuario fijado de la escena.', 'Se añade el vestuario igual que en las demás tomas.');
      extra.push(`Vestuario: ${i.costume.trim().replace(/\.$/, '')}.`);
    }
  }
  // Ropa técnica: Veo suele inventar logotipos en chaquetas y mochilas (pasó en el Episodio 1).
  if (/\bmochila|\bchaqueta|\bcamiseta|\babrigo/.test(seen) && i.cast.length) {
    add('aviso', 'logotipos', 'Ropa técnica: Veo a veces inventa logotipos o marcas.', 'Se pide ropa sin logotipos.');
    if (!/sin logotipos/.test(p)) extra.push('Ropa lisa, sin logotipos ni marcas.');
  }

  // 2. Texto en pantalla
  const objects = TEXT_OBJECTS.filter(([re]) => re.test(seen)).map(([, name]) => name);
  if (objects.length) {
    add('riesgo', 'texto en pantalla', `Aparece ${objects.join(', ')}: Veo tiende a escribir letras o logotipos.`, 'Se pide que no tengan escritura ni marcas.');
    extra.push(`Sin ninguna escritura, letras, números ni logotipos en ${objects.join(', ')}.`);
  }
  if (i.onCamera) {
    add('aviso', 'subtítulos', 'Con diálogo, Veo a veces graba subtítulos inventados.', 'Se recuerda: sin subtítulos.');
    if (!/sin subtitulos/.test(p)) extra.push('Sin subtítulos ni texto en pantalla.');
  }

  // 3. Filtro de Google
  for (const [re, alt] of FILTER_WORDS) {
    const m = re.exec(seen);
    if (m) add('riesgo', 'filtro de Google', `«${m[0]}» suele bloquearse.`, `Usa algo como «${alt}».`);
  }

  // 4. Diálogo
  if (i.onCamera) {
    const line = i.spokenText.trim();
    if (!line) add('bloquea', 'diálogo', 'Toma de diálogo sin frase.', 'Escribe la frase del personaje.');
    else {
      const need = speechSeconds(line) + 0.6;
      if (need > i.seconds) add('bloquea', 'diálogo', `La frase necesita ~${need.toFixed(1)} s y la toma dura ${i.seconds} s: se cortaría o hablaría atropellado.`, i.seconds < 8 ? 'Sube la toma a 8 s o acorta la frase.' : 'Acorta la frase o pártela en dos tomas.');
      if (/\.\.\.|…/.test(line)) add('aviso', 'diálogo', 'Los «…» hacen que Veo invente palabras.', 'Se cambian por comas al enviar (automático).');
      if (line.split(/[.!?¿¡]+/).filter((s) => s.trim()).length > 2) add('riesgo', 'diálogo', 'Más de dos frases en una toma: suele perderse la sincronía labial.', 'Parte el diálogo en dos tomas.');
    }
  }

  // 5. Manos y contacto
  if (HANDS.test(seen)) add('riesgo', 'manos', 'La acción depende de las manos: es el defecto más repetido (dedos fusionados).', 'Encuadre que deje las manos fuera, o una acción simple y lenta.');
  if (CONTACT.test(p) && i.cast.length > 1) add('riesgo', 'contacto', 'Contacto físico entre personajes: Veo suele fusionar los cuerpos.', 'Plano más abierto o contacto mínimo.');
  if (!/bocas cerradas|boca cerrada/.test(p) && !i.onCamera && i.cast.length) extra.push('Bocas cerradas.');

  if (extra.length) suggested = (suggested.replace(/\s+$/, '') + ' ' + extra.join(' ')).trim();
  const penalty = issues.reduce((n, x) => n + (x.nivel === 'bloquea' ? 4 : x.nivel === 'riesgo' ? 1.5 : 0.5), 0);
  const nota = Math.max(0, Math.round((10 - penalty) * 10) / 10);
  const semaforo = issues.some((x) => x.nivel === 'bloquea') ? 'rojo' : nota >= 8 ? 'verde' : 'amarillo';
  return { label: i.label, nota, semaforo, problemas: issues, promptSugerido: suggested === i.prompt.trim() ? '' : suggested };
}

export function preflightScene(shots: PreflightShotInput[]) {
  const results = shots.map(preflightShot);
  const nota = results.length ? Math.round(results.reduce((n, r) => n + r.nota, 0) / results.length * 10) / 10 : 10;
  const bloqueadas = results.filter((r) => r.semaforo === 'rojo').map((r) => r.label);
  return { nota, listaParaGenerar: bloqueadas.length === 0, bloqueadas, tomas: results };
}
