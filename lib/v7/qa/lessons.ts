/**
 * LECCIONES APRENDIDAS: errores ya vistos que el sistema previene solo en cada toma nueva.
 *
 * - Lecciones fijas: salieron del piloto del Episodio 1 (subtítulos incrustados, pantallas con
 *   números, manos deformes, glitches de luz del monitor, bocas que no sincronizan…).
 * - Lecciones aprendidas: el agente Pulir cuenta cada defecto del revisor en
 *   .data/v7/lecciones.json; cuando un defecto se repite 2 veces, su lección se ACTIVA y desde
 *   entonces se aplica a todas las tomas de todas las películas.
 * Se aplican al ENVIAR (no cambian el texto que tú guardas) y quedan anotadas en el registro.
 * Nunca tocan el diálogo entre «comillas».
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { v7DataRoot } from '@/lib/v7/storage/film-store';

export type Lesson = {
  id: string;
  title: string;
  /** Defectos del revisor que cuentan para esta lección. */
  defect: RegExp;
  /** La lección solo aplica a tomas cuyo texto cumple esto (si no, a todas). */
  when?: RegExp;
  /** Instrucción que se añade al prompt. */
  guidance: string;
  /** Términos que se añaden al prompt negativo de Veo. */
  negative?: string;
  /** Activa desde el principio (vista en el piloto). */
  fixed?: boolean;
};

export const LESSONS: Lesson[] = [
  { id: 'subtitulos', title: 'Veo incrusta subtítulos cuando hay diálogo', fixed: true,
    defect: /subt[ií]tul|texto en pantalla|letras|caracteres/i, when: /«/,
    guidance: 'La imagen es limpia, como una película sin subtítulos: el diálogo solo se oye.', negative: 'subtítulos incrustados, texto inferior' },
  { id: 'pantallas', title: 'Monitores y pantallas aparecen con números, letras o interfaz', fixed: true,
    defect: /monitor|pantalla|n[uú]meros|interfaz|\bUI\b/i, when: /monitor|pantalla|tel[eé]fono|ordenador|televis/i,
    guidance: 'Cualquier pantalla o monitor se ve oscuro o desenfocado, sin números, letras ni gráficos legibles; su luz solo tiñe el ambiente.', negative: 'números en monitores, gráficos de electrocardiograma superpuestos' },
  { id: 'luz-monitor', title: 'La línea del monitor se dibuja sobre la cortina, la almohada o la cara', fixed: true,
    defect: /superpuest|proyecta|l[ií]nea del (electro|monitor)|ondas del monitor/i, when: /monitor/i,
    guidance: 'La luz del monitor es un resplandor suave y uniforme; ninguna línea ni onda aparece fuera de la pantalla.' },
  { id: 'manos', title: 'Manos y dedos deformes o fusionados', fixed: true,
    defect: /mano|dedo|anatom/i, when: /mano|sostiene|acaricia|aprieta|toca|abraza|agarra/i,
    guidance: 'Las manos se mueven poco y con naturalidad, con cinco dedos bien definidos; si es posible quedan parcialmente fuera de cuadro.', negative: 'dedos fusionados, manos extra' },
  { id: 'labios', title: 'Labios que no sincronizan o palabras inventadas', fixed: true,
    defect: /sincron|labial|ininteligible|gibberish|sin sentido/i, when: /«/,
    guidance: 'Habla despacio y con claridad, articulando cada palabra; la boca se mueve con naturalidad y el resto de la cara permanece estable.' },
  { id: 'dirigido', title: 'El personaje habla al vacío en lugar de a quien escucha', fixed: true,
    defect: /mira a c[aá]mara|no mira|dirige|interlocutor/i, when: /«[\s\S]*(su esposa|esposa|ella|Martin)|(su esposa|esposa|ella)[\s\S]*«/,
    guidance: 'Quien habla le dice la frase a la otra persona de la escena, mirándola a los ojos, nunca a cámara.' },
  { id: 'parpadeo', title: 'Parpadeos, glitches y saltos de imagen',
    defect: /parpade|flicker|glitch|salto|morphing|deforma(ci[oó]n)? facial/i,
    guidance: 'Movimiento de cámara mínimo y suave, iluminación estable y sin cortes dentro del plano.' },
  { id: 'contacto', title: 'Contacto físico mal resuelto entre personajes',
    defect: /contacto|fusiona|toca el rostro|se fusionan/i, when: /\by\b.*\b(su esposa|ella)\b|ambos|pareja/i,
    guidance: 'Si hay contacto físico entre personajes, es mínimo, lento y claramente separado.' },
  { id: 'caminar', title: 'Caminar deslizándose sin peso',
    defect: /desliz|pisada|sin peso|camina/i, when: /camina|avanza|sube|asciende/i,
    guidance: 'Al caminar, cada pisada tiene peso real y contacto claro con el suelo.' }
];

type Counts = Record<string, number> & { _vistos?: never };
type Store = { counts: Counts; vistos: string[] };
const file = () => path.join(v7DataRoot(), 'lecciones.json');

async function readStore(): Promise<Store> {
  try { const s = JSON.parse(await readFile(file(), 'utf8')) as Partial<Store>; return { counts: s.counts ?? {}, vistos: s.vistos ?? [] }; }
  catch { return { counts: {}, vistos: [] }; }
}
export async function readCounts(): Promise<Counts> { return (await readStore()).counts; }

/** Cuenta los defectos de un informe del revisor (una sola vez por video). Lo llama el agente Pulir. */
export async function learnFromDefects(defects: string[], videoId: string) {
  const store = await readStore();
  if (store.vistos.includes(videoId)) return store.counts;
  for (const l of LESSONS) if (defects.some((d) => l.defect.test(d))) store.counts[l.id] = (store.counts[l.id] ?? 0) + 1;
  store.vistos = [...store.vistos, videoId].slice(-5000);
  await mkdir(path.dirname(file()), { recursive: true });
  await writeFile(file(), JSON.stringify(store, null, 2) + '\n', 'utf8');
  return store.counts;
}

export function activeLessons(counts: Counts) {
  return LESSONS.filter((l) => l.fixed || (counts[l.id] ?? 0) >= 2);
}

/** Aplica las lecciones activas a un prompt. Puro: no toca el diálogo «…». */
export function applyLessons(prompt: string, lessons: Lesson[]) {
  const marker = 'Sin subtítulos ni texto en pantalla.';
  // La condición se mira sobre la escena, sin la frase final de reglas ni las propias lecciones.
  const scene = lessons.reduce((t, l) => t.split(l.guidance).join(''), prompt.split(marker).join(''));
  const apply = lessons.filter((l) => !l.when || l.when.test(scene));
  const extra = apply.map((l) => l.guidance).filter((g) => !prompt.includes(g));
  const text = !extra.length ? prompt
    : prompt.includes(marker) ? prompt.replace(marker, extra.join(' ') + ' ' + marker) : prompt + ' ' + extra.join(' ');
  const negative = apply.map((l) => l.negative).filter(Boolean) as string[];
  return { text, applied: apply.map((l) => l.id), negative };
}

/** Pronunciación de nombres extranjeros que Veo dice mal en español (se añade como pista). */
export const PRONUNCIATION: Record<string, string> = {
  Kant: 'Kant (se pronuncia "Kant", una sola sílaba, como en alemán)',
  Leibniz: 'Leibniz (se pronuncia "Láibnits")',
  Camus: 'Camus (se pronuncia "Camí", a la francesa)',
  Nietzsche: 'Nietzsche (se pronuncia "Niche")',
  Sartre: 'Sartre (se pronuncia "Sartr", a la francesa)',
  Descartes: 'Descartes (se pronuncia "Decart", a la francesa)'
};

/**
 * Prepara el diálogo «…» para Veo: los puntos suspensivos se vuelven una pausa con coma
 * (Veo rellenaba esas pausas con palabras inventadas) y se añade cómo pronunciar los nombres
 * extranjeros. El guion y los subtítulos NO cambian: solo lo que se envía a Veo.
 */
export function speakableDialogue(prompt: string) {
  const names = new Set<string>();
  const text = prompt.replace(/«([^»]*)»/g, (_m, line: string) => {
    for (const n of Object.keys(PRONUNCIATION)) if (new RegExp('\\b' + n + '\\b').test(line)) names.add(n);
    const spoken = line.replace(/\s*(\.\.\.|…)\s*/g, ', ').replace(/,\s*([¿¡]?[A-ZÁÉÍÓÚÑ])/g, (_x, c: string) => ', ' + c.toLowerCase()).replace(/,\s*$/, '').trim();
    return '«' + spoken + '»';
  });
  if (!names.size) return text;
  const hint = 'Pronunciación: ' + [...names].map((n) => PRONUNCIATION[n]).join('; ') + '. Dice la frase de corrido, con una pausa breve en la coma, sin añadir ninguna otra palabra.';
  const marker = 'Sin subtítulos ni texto en pantalla.';
  return text.includes(marker) ? text.replace(marker, hint + ' ' + marker) : text + ' ' + hint;
}
