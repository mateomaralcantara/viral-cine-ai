/**
 * «LOS CONVIDADOS AL ÁGAPE» · EPISODIO 2 — EL UMBRAL DEL ÁGAPE (≈15 min).
 * Adaptación de los capítulos «El umbral del Ágape» y «Los primeros convidados» de la novela de Martin Mateo.
 * Los diálogos están dramatizados para cine: no son citas históricas literales.
 *
 * Reglas de producción (aprendidas en el Episodio 1):
 * - Diálogos EN CÁMARA (Martin y los filósofos): Veo genera voz y labios en español.
 *   Si una frase no cabe en una toma (máx. 8 s), se reparte sola en varias tomas (plano y contraplano).
 * - El Heraldo NO tiene rostro (capucha con oscuridad, ficha oficial): habla en VOZ EN OFF, siempre la misma voz.
 * - El Fiscal oculta parte del rostro: su voz también es en off (voz de barítono suave estable).
 * - La esposa es un recuerdo: solo voz en off.
 * - Un solo decorado con continuidad absoluta: el salón del Ágape (SALON), vestuario fijo por escena.
 * - Nada de letras en pantalla: las «inscripciones» son símbolos de luz abstractos.
 * - Tomas de 4, 6 u 8 s. Títulos y créditos en posproducción.
 */
import { buildShortFilmBundle, shortFilmStats, type ShortFilmBeat, type ShortFilmSpec } from '@/lib/v7/presets/short-film-builder';
import { CONVIDADOS_REPARTO, CONVIDADOS_SERIE } from '@/lib/v7/presets/convidados-reparto';
import { speechSeconds, VOICE_START_SECONDS, VOICE_TAIL_SECONDS } from '@/lib/v7/production/film-voice-mix';

export const EPISODIO_2_ID = 'film-convidados-ep02-v7';

const cast = (key: string) => CONVIDADOS_REPARTO.find((c) => c.key === key)!.descripcion;
const MARTIN = 'Martin, ' + cast('martin');
/** Vestuario fijo de Martin en todo el episodio: llega directamente desde la montaña (continúa el Episodio 1). */
const VESTUARIO_MARTIN = 'chaqueta técnica de alta montaña azul oscuro con la capucha bajada sobre los hombros, sin mochila ni guantes';
const M = `${MARTIN}, con ${VESTUARIO_MARTIN}`;
const HERALDO = 'el Heraldo, ' + cast('heraldo');
const SOCRATES = 'Sócrates, ' + cast('socrates') + ', descalzo, con la barba desordenada y la túnica gastada';
const PLATON = 'Platón, ' + cast('platon') + ', alto e imponente';
const ARISTOTELES = 'Aristóteles, ' + cast('aristoteles');
const FISCAL = 'el Fiscal, ' + cast('fiscal');

const SALON = 'En el salón monumental del Ágape, con columnas gigantescas de piedra caliza, suelo de mármol negro pulido como un espejo, bóvedas imposibles, luz dorada sin fuentes visibles y una única mesa ceremonial rectangular, larguísima y estrecha, de madera oscura pulida, sin mantel, con copas de cristal vacías alineadas,';
const MESA = 'Junto a la única mesa ceremonial del salón del Ágape (rectangular, larguísima y estrecha, de madera oscura pulida, sin mantel, con copas de cristal vacías alineadas y sillas de respaldo alto iguales), entre columnas de piedra caliza y mármol negro, bajo una luz dorada sin fuentes visibles, cerca de la silla del Moderador en la cabecera con un mazo de madera y una campana de bronce,';
const PORTONES = 'Ante dos portones monumentales de roble oscuro al fondo del salón del Ágape, entre columnas de piedra caliza y suelo de mármol negro, con luz dorada sin fuentes visibles,';

const DORADO = 'Cine histórico-fantástico de alto presupuesto, fotorrealista, formato 16:9. Luz dorada cálida sin fuentes visibles y sombras profundas.';
const SOMBRA = 'Cine histórico-fantástico fotorrealista, formato 16:9. La luz dorada se apaga poco a poco; sombras frías y suspenso.';
const NEGRO = 'Cine fotorrealista, formato 16:9. Negro profundo con destellos.';
const LIMPIO = 'Sin subtítulos ni texto en pantalla.';
const QUIETO = 'Bocas cerradas.';

const SPEAK: Record<string, string> = {
  martin: 'Martin dice en español, con voz masculina grave, natural y contenida',
  socrates: 'Sócrates dice en español, con voz de anciano rasposa, irónica y viva',
  platon: 'Platón dice en español, con voz masculina resonante y solemne',
  aristoteles: 'Aristóteles dice en español, con voz masculina serena, precisa y segura'
};
type Speaker = keyof typeof SPEAK;
type Sec = 4 | 6 | 8;

/** Segundos de toma para una frase dicha en cámara (o null si no cabe en 8 s). */
const onCameraSeconds = (line: string): Sec | null => {
  const need = speechSeconds(line) + 0.6;
  return need <= 4 ? 4 : need <= 6 ? 6 : need <= 8 ? 8 : null;
};
/** Segundos de toma para una voz en off (el montaje admite cámara lenta hasta 70 %). */
const voiceOverSeconds = (line: string): Sec | null => {
  const need = speechSeconds(line) + VOICE_START_SECONDS + VOICE_TAIL_SECONDS;
  return need <= 4 ? 4 : need <= 6 ? 6 : need <= 8 / 0.75 ? 8 : null;
};
/** Parte una frase larga en trozos que quepan, siempre por el final de una oración (o una coma). */
function splitLine(line: string, fits: (s: string) => boolean): string[] {
  if (fits(line)) return [line];
  const sentences = line.match(/[^.!?…]+[.!?…]+[»"]?\s*|[^.!?…]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [line];
  const parts = sentences.length > 1 ? sentences : line.split(/(?<=,)\s+/);
  const out: string[] = [];
  let cur = '';
  for (const s of parts) {
    const next = cur ? cur + ' ' + s : s;
    if (cur && !fits(next)) { out.push(cur); cur = s; } else cur = next;
  }
  if (cur) out.push(cur);
  // Una oración sin comas que aún no cabe: se parte por una pausa natural cerca de la mitad.
  return out.flatMap((part) => fits(part) ? [part] : halve(part).flatMap((h) => splitLine(h, fits)));
}
function halve(text: string): string[] {
  const mid = text.length / 2;
  const cuts = [...text.matchAll(/ (?=(que|es|contra|puede|con|como|para|sin|pero|y) )/g)].map((m) => m.index!);
  const spaces = [...text.matchAll(/ /g)].map((m) => m.index!);
  const pool = cuts.length ? cuts : spaces;
  if (!pool.length) return [text];
  const at = pool.reduce((a, b) => Math.abs(b - mid) < Math.abs(a - mid) ? b : a);
  return [text.slice(0, at).trim() + '…', text.slice(at).trim()];
}
const ALT_CAMERA: Record<string, string> = { 'Primer plano': 'Plano medio corto', 'Plano medio': 'Primer plano', 'Plano medio corto': 'Primer plano' };

/** Diálogo EN CÁMARA: Veo genera voz y labios. Si no cabe, se reparte en varias tomas. */
function D(title: string, camera: string, scene: string, who: Speaker, line: string, style = DORADO): ShortFilmBeat[] {
  const parts = splitLine(line, (s) => onCameraSeconds(s) !== null);
  return parts.map((part, i) => {
    const cam = i % 2 === 1 ? (ALT_CAMERA[camera] ?? camera) : camera;
    return {
      title: parts.length > 1 ? `${title} (${i + 1}/${parts.length})` : title, camera: cam, onCamera: true,
      seconds: onCameraSeconds(part) ?? 8, voice: who, line: part,
      prompt: `${cam}. ${scene} ${SPEAK[who]}: «${part}». ${style} ${LIMPIO}`
    };
  });
}
/** Voz en off (ElevenLabs) sobre una imagen sin diálogo. */
function V(title: string, camera: string, scene: string, who: string, line: string, style = DORADO): ShortFilmBeat[] {
  const parts = splitLine(line, (s) => voiceOverSeconds(s) !== null);
  return parts.map((part, i) => ({
    title: parts.length > 1 ? `${title} (${i + 1}/${parts.length})` : title, camera, seconds: voiceOverSeconds(part) ?? 8, voice: who, line: part,
    prompt: `${camera}. ${scene} ${QUIETO} ${style} ${LIMPIO}`
  }));
}
/** Imagen sin voz. */
const S = (title: string, camera: string, scene: string, style = DORADO, seconds: Sec = 6): ShortFilmBeat[] =>
  [{ title, camera, seconds, voice: 'narrador', line: '', prompt: `${camera}. ${scene} ${QUIETO} ${style} ${LIMPIO}` }];

/** El Heraldo habla (voz en off) mientras se le ve: figura encapuchada inmóvil, sin rostro visible. */
const H = (title: string, camera: string, line: string, extra = 'permanece inmóvil y solemne frente a Martin', style = DORADO) =>
  V(title, camera, `${SALON} ${HERALDO}, ${extra}.`, 'heraldo', line, style);
/** Martin escucha al Heraldo (contraplano en silencio, voz del Heraldo en off). */
const HM = (title: string, line: string, reaction: string, style = DORADO) =>
  V(title, 'Primer plano', `${SALON} ${M}, ${reaction}.`, 'heraldo', line, style);
/** Martin habla en el salón. */
const DM = (title: string, camera: string, action: string, line: string, style = DORADO, place = SALON) =>
  D(title, camera, `${place} ${M}, ${action}.`, 'martin', line, style);

export const EPISODIO_2_SPEC: ShortFilmSpec = {
  id: EPISODIO_2_ID,
  title: 'LOS CONVIDADOS AL ÁGAPE · EPISODIO 2 — EL UMBRAL DEL ÁGAPE',
  premise: 'Martin despierta en un salón imposible. Un Heraldo le anuncia que su petición ha sido aceptada: será el Moderador de un tribunal de tres días. ' +
    'Llegan Sócrates, Platón y Aristóteles… y, al final, un invitado que nadie convocó: el Fiscal.',
  genre: 'Drama filosófico, misterio metafísico y suspenso psicológico',
  audience: 'Público adulto',
  visualStyle: 'Cine histórico-fantástico de alto presupuesto, fotorrealista; salón de mármol negro y piedra caliza bajo luz dorada sin fuentes visibles',
  continuityNotes: [
    'Comienza exactamente donde termina el Episodio 1',
    'Martin siempre con la misma cara (ficha oficial) y la misma chaqueta de montaña azul oscuro',
    'El Heraldo nunca muestra rostro: capucha blanca y dorada con oscuridad dentro',
    'El salón del Ágape mantiene la misma distribución en todos los planos: mesa larga, silla del Moderador separada con mazo y campana, portones de roble al fondo',
    'Sin letras ni inscripciones legibles en ningún plano'
  ],
  metadata: {
    serie: CONVIDADOS_SERIE, episode: 2, author: 'Martin Mateo', format: 'serie',
    book: 'Los convidados al Ágape — El banquete de los filósofos',
    endCardLines: ['LOS CONVIDADOS AL ÁGAPE', 'EPISODIO 2 — FIN', 'Próximo episodio: LA SOMBRA ELEGANTE'],
    // Harness: activos (los valores por defecto ya lo están; se dejan explícitos para esta producción).
    puertaDeCalidad: true, continuidadObligatoria: true,
    // Plano maestro del decorado (npm run decorado): misma mesa y misma arquitectura en todas las tomas.
    decorado: 'salon-del-agape'
  },
  characters: [
    { key: 'martin', name: 'Martin', age: 42, role: 'Protagonista, el Convocante y Moderador', appearance: cast('martin'), voice: 'Voz masculina grave, expresiva y natural.' },
    { key: 'heraldo', name: 'El Heraldo', age: 99, role: 'Mensajero del Ágape', appearance: cast('heraldo'), voice: 'Voz grave, controlada y solemne.' },
    { key: 'socrates', name: 'Sócrates', age: 70, role: 'Filósofo griego, irónico e inquisitivo', appearance: cast('socrates'), voice: 'Voz de anciano rasposa e irónica.' },
    { key: 'platon', name: 'Platón', age: 60, role: 'Filósofo griego, idealista', appearance: cast('platon'), voice: 'Voz resonante y solemne.' },
    { key: 'aristoteles', name: 'Aristóteles', age: 45, role: 'Filósofo griego, riguroso y analítico', appearance: cast('aristoteles'), voice: 'Voz serena y precisa.' },
    { key: 'fiscal', name: 'El Fiscal', age: 50, role: 'El invitado que nadie convocó', appearance: cast('fiscal'), voice: 'Voz de barítono suave, perturbadora.' },
    { key: 'esposa', name: 'Esposa de Martin', age: 40, role: 'Recuerdo de Martin', appearance: cast('esposa'), voice: 'Voz femenina suave, afectuosa.' },
    { key: 'narrador', name: 'Narrador', age: 55, role: 'Sin texto en este episodio', appearance: 'Voz en off, sin imagen', voice: 'Voz cinematográfica sobria.' },
    { key: 'voz-desconocida', name: 'Voz desconocida', age: 99, role: 'Eco del final del Episodio 1', appearance: 'Voz en off, sin imagen', voice: 'Profunda, no humana.' }
  ],
  scenes: [
    // ---------------------------------------------------------------- SECUENCIA 1
    {
      title: 'El despertar imposible', summary: 'Martin despierta sobre un suelo de mármol negro en un salón imposible. El Heraldo le habla por primera vez.',
      location: 'Umbral del Ágape, tiempo indeterminado', wardrobe: VESTUARIO_MARTIN, cast: ['martin', 'heraldo', 'esposa', 'voz-desconocida'],
      music: 'M01 «Más allá de la realidad»: subgrave casi imperceptible, coro lejano sin palabras y notas de cristal resonante; crece con la revelación del salón y se detiene antes de la primera frase del Heraldo.',
      musicPrompt: 'Original cinematic film score, beyond reality: barely audible sub bass drone, distant wordless choir, resonant glass notes, slowly swelling into a majestic reveal, mysterious. No vocals.',
      beats: [
        ...V('Petición cursada (eco)', 'Plano general', 'Pantalla en negro absoluto, con un leve destello dorado lejano.', 'voz-desconocida', 'Petición... cursada...', NEGRO),
        ...S('Flash: la montaña', 'Plano general', 'Destello breve: la cumbre nevada de una montaña congelada sobre un océano de nubes, bajo un cielo que se vuelve negro.', NEGRO, 4),
        ...S('Flash: la fotografía y la luz', 'Plano detalle', 'Destello breve: una fotografía enmarcada de una mujer sonriente, de pelo castaño ondulado, iluminada por una luz dorada creciente; el marco sin ninguna escritura.', NEGRO, 4),
        ...S('Abre los ojos', 'Primer plano', `${SALON} ${M}, tumbado de lado sobre el mármol negro, abre los ojos lentamente.`, DORADO, 4),
        ...S('Se incorpora', 'Plano medio', `${SALON} ${M} se incorpora lentamente sobre el suelo de mármol negro, que refleja su figura como un espejo.`),
        ...DM('Estoy vivo', 'Primer plano', 'se mira las manos abiertas, asombrado; ya no tiene frío', 'Estoy vivo...'),
        ...DM('¿Dónde está la nieve?', 'Plano medio', 'observa el suelo de mármol negro, desconcertado', '¿Dónde está la nieve?'),
        ...S('El salón del Ágape', 'Plano general', `${SALON} vista completa: la mesa se pierde entre las sombras; ${M} aparece diminuto en el centro.`, DORADO, 8),
        ...DM('No puede ser real', 'Primer plano', 'mira hacia las bóvedas con la boca entreabierta de asombro', 'Esto no puede ser real.'),
        ...H('Levántate', 'Plano general', 'Levántate, Martin de la duda.', 'todavía en penumbra entre dos columnas lejanas, apenas una silueta luminosa'),
        ...DM('¿Quién está ahí?', 'Plano medio', 'gira bruscamente buscando de dónde viene la voz', '¿Quién está ahí?'),
        ...S('Emerge el Heraldo', 'Plano general', `${SALON} ${HERALDO}, emerge lentamente entre dos columnas y avanza sin que sus pasos se reflejen ni resuenen.`),
        ...H('Has llegado', 'Plano medio', 'Has llegado.'),
        ...DM('¿Adónde?', 'Primer plano', 'retrocede un paso, receloso', '¿Llegado adónde?'),
        ...H('El lugar de las preguntas', 'Plano medio', 'Al lugar donde las preguntas dejan de esconderse detrás de las palabras.'),
        ...DM('¿Estoy muerto?', 'Primer plano', 'retrocede con miedo', '¿Estoy muerto?'),
        ...HM('¿Necesitas estar muerto?', '¿Necesitas estar muerto para descubrir que tu conocimiento es incompleto?', 'escucha inmóvil, con el rostro tenso'),
        ...DM('Necesito saber', 'Plano medio', 'da un paso adelante, desesperado', '¡Necesito saber qué me está pasando!'),
        ...H('Lo que has pedido', 'Plano medio', 'Eso es exactamente lo que has pedido.', 'permanece completamente inmóvil'),
        ...S('Primer plano de Martin', 'Primer plano con acercamiento lento', `${SALON} ${M} comprende algo terrible; su respiración se acelera.`, DORADO, 4)
      ]
    },
    // ---------------------------------------------------------------- SECUENCIA 2
    {
      title: 'La petición aceptada', summary: 'Martin recorre la mesa; el Heraldo revela que es un tribunal y que su petición ha sido aceptada.',
      location: 'Gran salón del Ágape', wardrobe: VESTUARIO_MARTIN, cast: ['martin', 'heraldo'],
      music: 'M02 «El Convocante»: cuerdas graves y percusión contenida; tensión intelectual, no terror.',
      musicPrompt: 'Original cinematic film score, the summoner: low strings, restrained slow percussion, intellectual tension, mysterious, not horror. No vocals.',
      beats: [
        ...S('Recorre la mesa', 'Travelling lateral lento', `${MESA} ${M} camina despacio junto a la mesa, observando cientos de sillas vacías.`, DORADO, 8),
        ...S('El mazo y la campana', 'Plano detalle', `${MESA} sobre la silla separada del Moderador descansan un mazo de madera oscura y una campana de bronce, sin ninguna inscripción.`, DORADO, 4),
        ...DM('¿Quién construyó esto?', 'Plano medio', 'levanta la vista hacia las columnas', '¿Quién construyó este lugar?', DORADO, MESA),
        ...H('Para qué existe', 'Plano medio', 'La pregunta correcta sería para qué existe.'),
        ...DM('Entonces responde', 'Primer plano', 'se vuelve hacia el Heraldo, desafiante', 'Entonces responde.', DORADO, MESA),
        ...H('Para escuchar', 'Plano medio', 'Para escuchar.'),
        ...DM('¿A quién?', 'Primer plano', 'frunce el ceño', '¿A quién?', DORADO, MESA),
        ...H('A todos', 'Plano medio', 'A todos los que han intentado responderte.'),
        ...DM('¿Un tribunal?', 'Plano medio', 'mira la silla central del Moderador', '¿Qué es esto? ¿Un tribunal?', DORADO, MESA),
        ...H('Así lo has solicitado', 'Plano medio', 'Así lo has solicitado.'),
        ...DM('Le exigí una respuesta', 'Primer plano', 'alza la voz, indignado', 'Yo no solicité un tribunal. ¡Le exigí una respuesta a Dios!', DORADO, MESA),
        ...HM('Lo convocaste', 'Lo convocaste. Lo acusaste de silencio. Cuestionaste su bondad y exigiste razones.', 'escucha, cada vez más tenso'),
        ...DM('Murió mi esposa', 'Primer plano', 'con la voz rota', 'Porque murió mi esposa.', DORADO, MESA),
        ...H('Lo sé', 'Plano medio', 'Lo sé.'),
        ...DM('¡No lo sabes!', 'Plano medio', 'se acerca bruscamente al Heraldo', '¡No! ¡No lo sabes!', DORADO, MESA),
        ...DM('Nadie que no haya visto morir', 'Primer plano', 'con la voz temblando', 'Nadie que no haya visto morir a la persona que ama puede pronunciar esas palabras con tanta tranquilidad.', DORADO, MESA),
        ...H('Tu dolor no será negado', 'Plano medio', 'Tu dolor no será negado aquí.', 'tras una pausa, inmóvil'),
        ...DM('Tráela de vuelta', 'Primer plano', 'suplicante', 'Entonces tráela de vuelta.', DORADO, MESA),
        ...S('Silencio absoluto', 'Plano general', `${SALON} ${HERALDO}, y ${M} frente a frente, en silencio absoluto.`, DORADO, 4),
        ...DM('Puedes construir este lugar', 'Plano medio', 'señala el salón con un gesto amplio', 'Puedes construir este lugar. Puedes hacerme desaparecer de una montaña y aparecer en un palacio imposible.', DORADO, MESA),
        ...DM('Devuélvemela', 'Primer plano', 'se aproxima al Heraldo, con los ojos húmedos', 'Si tienes tanto poder... devuélvemela.', DORADO, MESA),
        ...H('No negocio milagros', 'Plano medio', 'No he venido a negociar milagros.'),
        ...DM('¿Para qué has venido?', 'Primer plano', 'con rabia contenida', 'Entonces, ¿para qué has venido?', DORADO, MESA),
        ...H('Tu petición ha sido aceptada', 'Plano medio', 'Para comunicarte que tu petición ha sido aceptada.'),
        ...DM('¿Aceptada por quién?', 'Primer plano', 'con los puños apretados a los costados', '¿Aceptada por quién?', DORADO, MESA),
        ...H('Deberás examinarlo', 'Plano general', 'Ese es uno de los asuntos que deberás examinar.', 'se vuelve lentamente hacia la mesa ceremonial')
      ]
    },
    // ---------------------------------------------------------------- SECUENCIA 3
    {
      title: 'El hombre que no puede ser juez', summary: 'El Heraldo nombra a Martin Moderador del tribunal; Martin se siente indigno y toma el mazo.',
      location: 'Mesa del Ágape', wardrobe: VESTUARIO_MARTIN, cast: ['martin', 'heraldo'],
      music: 'M03 «El peso de la verdad»: ostinato de piano y violonchelo con pulsos irregulares; intensidad creciente.',
      musicPrompt: 'Original cinematic film score, the weight of truth: repeating piano ostinato with cello, irregular pulses, slowly growing intensity, introspective conflict. No vocals.',
      beats: [
        ...H('Toma asiento', 'Plano medio', 'Toma asiento.', 'señala con la mano enguantada de luz la silla principal'),
        ...DM('¿Por qué?', 'Primer plano', 'mira la silla con desconfianza', '¿Por qué?', DORADO, MESA),
        ...H('Eres el Convocante', 'Plano medio', 'Porque eres el Convocante.'),
        ...DM('No soy juez', 'Primer plano', 'niega con la cabeza', 'No soy juez.', DORADO, MESA),
        ...H('Precisamente', 'Plano medio', 'Precisamente.'),
        ...HM('No puedes juzgar', 'No puedes juzgar aquello en lo que estás personalmente implicado.', 'frunce el ceño'),
        ...DM('No entiendo qué hago aquí', 'Plano medio', 'abre los brazos, confundido', 'Entonces no entiendo qué hago aquí.', DORADO, MESA),
        ...H('Serás el Moderador', 'Plano medio', 'Serás el Moderador.'),
        ...DM('¿Moderador?', 'Primer plano', 'incrédulo', '¿Moderador? ¿De qué?', DORADO, MESA),
        ...H('Una conversación antigua', 'Plano medio', 'De una conversación que comenzó mucho antes de que nacieras.'),
        ...DM('Soy un doctorando', 'Plano medio', 'suelta una risa incrédula', 'Soy un doctorando que ni siquiera ha terminado su tesis. He leído filosofía durante años y sigo sin comprender las preguntas más importantes.', DORADO, MESA),
        ...H('Por eso estás aquí', 'Plano medio', 'Por eso estás aquí.'),
        ...DM('Trae a alguien preparado', 'Primer plano', 'exasperado', '¡Trae a alguien preparado! Un científico, un teólogo, un filósofo auténtico.', DORADO, MESA),
        ...H('Serán tus invitados', 'Plano medio', 'Esos serán tus invitados.'),
        ...DM('¿Qué les voy a enseñar?', 'Primer plano', 'desconcertado', '¿Y yo qué les voy a enseñar?', DORADO, MESA),
        ...H('Nada', 'Plano medio', 'Nada.'),
        ...HM('Tu función', 'Tu función no es demostrar que sabes. Es impedir que quienes creen saber dejen de hacerse preguntas.', 'se queda inmóvil, impresionado'),
        ...DM('No soy digno', 'Primer plano', 'baja la mirada hacia la silla', 'No soy digno de ocupar esa silla.', DORADO, MESA),
        ...H('La dignidad intelectual', 'Plano medio', 'La dignidad intelectual no comienza con una respuesta brillante. Comienza con la capacidad de reconocer una ignorancia sincera.'),
        ...DM('He sido arrogante', 'Primer plano', 'avergonzado, con la voz baja', 'He sido arrogante. He gritado contra el cielo como si el universo estuviera obligado a escucharme.', DORADO, MESA),
        ...H('No pediste riqueza', 'Plano medio', 'Y, sin embargo, no pediste riqueza, poder ni inmortalidad.'),
        ...DM('Pedí una explicación', 'Primer plano', 'levanta la vista', 'Pedí una explicación.', DORADO, MESA),
        ...H('Deberás escuchar', 'Plano medio', 'Entonces deberás escuchar incluso las respuestas que te disgusten.'),
        ...DM('¿Y si están equivocadas?', 'Plano medio', 'mira el mazo sobre la silla', '¿Y si todas están equivocadas?', DORADO, MESA),
        ...H('Demostrar por qué', 'Plano medio', 'Deberás demostrar por qué.'),
        ...DM('¿Y si ninguna responde?', 'Primer plano', 'inquieto', '¿Y si ninguna puede responder?', DORADO, MESA),
        ...H('Esa posibilidad', 'Plano medio', 'También tendrás que enfrentarte a esa posibilidad.'),
        ...DM('¿Y si no hay Dios?', 'Primer plano', 'tras una pausa dramática, con la voz baja', '¿Y si descubro que no hay Dios?', DORADO, MESA),
        ...HM('La búsqueda de la verdad', 'La búsqueda de la verdad carecería de valor si solo estuvieras dispuesto a encontrar una respuesta.', 'sostiene la mirada de la figura encapuchada'),
        ...S('Toma el mazo', 'Plano medio', `${MESA} ${M} toma lentamente el mazo de madera; la cámara queda a la altura de la silla, sin mostrar de cerca las manos.`, DORADO, 6)
      ]
    },
    // ---------------------------------------------------------------- SECUENCIA 4
    {
      title: 'Las tres leyes del Ágape', summary: 'El Heraldo dicta las tres leyes: sin violencia, la verdad antes que la victoria, y un veredicto al cabo de tres días.',
      location: 'Salón del Ágape, luz dorada', wardrobe: VESTUARIO_MARTIN, cast: ['martin', 'heraldo'],
      music: 'M04 «Las leyes del tribunal»: percusión lenta, metales profundos y resonancias ceremoniales; cada ley con una transición musical.',
      musicPrompt: 'Original cinematic film score, the laws of the tribunal: slow ceremonial percussion, deep brass, solemn resonances, authority and ritual, orchestral. No vocals.',
      beats: [
        ...S('Las copas vibran', 'Plano detalle', `${MESA} las copas de cristal vacías vibran ligeramente sobre la mesa.`, DORADO, 4),
        ...H('Tres leyes', 'Plano medio', 'Antes de que lleguen los convidados, escucharás tres leyes.', 'levanta una mano envuelta en luz'),
        ...S('Símbolos de luz', 'Plano detalle', `${SALON} sobre el mármol negro aparecen brevemente unas líneas de luz dorada abstractas y geométricas, sin letras ni números, y se desvanecen.`, DORADO, 4),
        ...H('Primera ley', 'Plano medio', 'Primera: aquí no habrá violencia física.'),
        ...DM('¿Y las palabras?', 'Primer plano', 'con media sonrisa escéptica', '¿Y la violencia de las palabras?'),
        ...H('Las palabras podrán herir', 'Plano medio', 'Las palabras podrán herir tus certezas. No podrán destruir tu derecho a preguntar.'),
        ...DM('Una distinción conveniente', 'Primer plano', 'cruza los brazos', 'Eso parece una distinción conveniente.'),
        ...HM('Despiadada con las ideas', 'La filosofía puede ser despiadada con las ideas. No debe convertir a las personas en enemigos que merezcan ser destruidos.', 'escucha, pensativo'),
        ...S('Vibración', 'Plano general', `${SALON} una vibración dorada recorre el salón y hace temblar la luz entre las columnas.`, DORADO, 4),
        ...H('Segunda ley', 'Plano medio', 'Segunda: se buscará la verdad, no la victoria retórica.'),
        ...DM('Siglos de derrotarse', 'Primer plano', 'irónico', 'Los filósofos llevan siglos intentando derrotarse entre ellos.'),
        ...H('Una de sus dificultades', 'Plano medio', 'Y esa será una de sus dificultades.'),
        ...DM('¿Cómo distinguir?', 'Plano medio', 'se acerca, genuinamente intrigado', '¿Cómo distinguir una verdad de un argumento suficientemente persuasivo?'),
        ...HM('Examinando sus razones', 'Examinando sus razones, sus consecuencias y sus límites. Y reconociendo que una afirmación convincente todavía puede ser falsa.', 'asiente despacio'),
        ...DM('¿Y la tercera ley?', 'Plano medio', 'observa las sillas vacías', '¿Y la tercera ley?'),
        ...H('Tres días', 'Primer plano de la capucha oscura', 'El tribunal durará tres días.', 'baja la cabeza; dentro de la capucha solo hay oscuridad'),
        ...H('La última copa', 'Plano medio', 'Cuando la última copa se haya vaciado, deberás emitir un veredicto.'),
        ...DM('¿Sobre Dios?', 'Primer plano', 'con la voz contenida', '¿Sobre la existencia de Dios?'),
        ...H('Sobre tu respuesta', 'Plano medio', 'Sobre tu respuesta a la existencia.'),
        ...DM('No comprendo', 'Primer plano', 'confundido', 'No comprendo.'),
        ...H('No decidirás por el universo', 'Plano medio', 'No decidirás por el universo. No decidirás por los muertos. No decidirás por toda la humanidad.'),
        ...H('Decidirás por ti mismo', 'Plano medio corto', 'Decidirás por ti mismo.', 'se aproxima lentamente a Martin'),
        ...DM('¿Y si no estoy preparado?', 'Primer plano', 'con miedo', '¿Y si no estoy preparado?'),
        ...HM('Nadie lo está', 'Nadie lo está cuando formula por primera vez una pregunta que compromete toda su vida.', 'traga saliva'),
        ...DM('Tres días', 'Primer plano', 'mira el mazo entre sus manos, sin mostrarlas de cerca', 'Tres días... ¿Y después?'),
        ...H('Despertarás', 'Plano medio', 'Despertarás llevando contigo lo que hayas decidido.')
      ]
    },
    // ---------------------------------------------------------------- SECUENCIA 5
    {
      title: '¿Qué es la verdad?', summary: 'Martin pone a prueba al Heraldo y descubre que ya ha comenzado a moderar; el recuerdo de su esposa lo atraviesa.',
      location: 'Salón del Ágape, la prueba del Moderador', wardrobe: VESTUARIO_MARTIN, cast: ['martin', 'heraldo', 'esposa'],
      music: 'M05 «Razón contra abismo»: piano repetitivo, cuerdas crecientes y respiraciones graves; se retira durante las preguntas decisivas.',
      musicPrompt: 'Original cinematic film score, reason against the abyss: repetitive dissonant piano, rising strings, low breathing textures, philosophical confrontation, sparse. No vocals.',
      beats: [
        ...DM('Algo que no entiendo', 'Plano medio', 'se levanta de la silla', 'Hay algo que no entiendo.', DORADO, MESA),
        ...H('Ya lo sabemos', 'Plano medio', 'Eso ya lo sabemos.'),
        ...DM('¿Por qué no me la dicen?', 'Primer plano', 'desafiante', 'Si este tribunal existe para encontrar la verdad, ¿por qué no me dicen simplemente cuál es?', DORADO, MESA),
        ...HM('Recibir una conclusión', 'Porque recibir una conclusión no equivale a comprender sus fundamentos.', 'aprieta la mandíbula'),
        ...DM('Una evasiva', 'Primer plano', 'molesto', 'Eso es una evasiva.', DORADO, MESA),
        ...H('Refútala', 'Plano medio', 'Entonces refútala.'),
        ...S('Martin piensa', 'Primer plano', `${MESA} ${M} se queda pensando, con la mirada perdida.`, DORADO, 4),
        ...DM('Supongamos', 'Plano medio', 'empieza a razonar en voz alta', 'Supongamos que me dices que Dios existe.', DORADO, MESA),
        ...H('Continúa', 'Plano medio', 'Continúa.'),
        ...DM('¿Cómo lo sabes?', 'Primer plano', 'concentrado', 'Yo preguntaría cómo lo sabes.', DORADO, MESA),
        ...H('Bien', 'Plano medio', 'Bien.'),
        ...DM('Lo mismo', 'Plano medio', 'camina despacio', 'Y si me dices que Dios no existe, preguntaría exactamente lo mismo.', DORADO, MESA),
        ...H('¿Qué has descubierto?', 'Plano medio', '¿Y qué has descubierto?'),
        ...DM('Necesita razones', 'Primer plano', 'con una chispa de comprensión', 'Que una afirmación necesita razones.', DORADO, MESA),
        ...H('¿Y las razones?', 'Plano medio', '¿Y las razones?'),
        ...DM('Ser examinadas', 'Primer plano', 'seguro', 'Necesitan ser examinadas.', DORADO, MESA),
        ...H('Ya has comenzado', 'Plano medio', 'Ya has comenzado a moderar.'),
        ...S('Rodea la mesa', 'Travelling lento', `${MESA} ${M} camina alrededor de la mesa, pensativo.`, DORADO, 4),
        ...DM('Algo más importante', 'Plano medio', 'se detiene', 'Pero hay algo más importante que una discusión lógica.', DORADO, MESA),
        ...H('¿Qué cosa?', 'Plano medio', '¿Qué cosa?'),
        ...DM('Mi esposa', 'Primer plano', 'con un nudo en la garganta', 'Mi esposa.', DORADO, MESA),
        ...DM('Seguirá muerta', 'Primer plano', 'con dolor', 'Si alguien demuestra que un universo sin Dios es perfectamente posible, ella seguirá muerta.', DORADO, MESA),
        ...H('Sí', 'Plano medio', 'Sí.'),
        ...DM('También seguirá muerta', 'Primer plano', 'con la voz quebrada', 'Si alguien demuestra que Dios puede existir a pesar del sufrimiento, ella también seguirá muerta.', DORADO, MESA),
        ...H('Sí (2)', 'Plano medio', 'Sí.'),
        ...DM('¿De qué sirve?', 'Plano medio', 'golpea suavemente la mesa con el puño', 'Entonces, ¿de qué sirve todo esto?', DORADO, MESA),
        ...S('Silencio del Heraldo', 'Plano medio', `${SALON} ${HERALDO}, permanece en silencio, inmóvil.`, DORADO, 4),
        ...DM('¡Respóndeme!', 'Primer plano', 'grita', '¡Respóndeme!', DORADO, MESA),
        ...HM('Seguir viviendo después', 'Quizá el debate no pueda cambiar aquello que ocurrió. Pero puede examinar lo que significa para ti seguir viviendo después.', 'siente el golpe de esas palabras'),
        ...DM('No he venido a olvidar', 'Primer plano', 'con firmeza dolorida', 'No he venido para que me enseñen a olvidar.', DORADO, MESA),
        ...H('Nadie te lo ha pedido', 'Plano medio', 'Nadie te lo ha pedido.'),
        ...DM('Reducido a una fotografía', 'Primer plano', 'con los ojos húmedos', 'He venido porque no puedo aceptar que el amor termine reducido a una fotografía.', DORADO, MESA),
        ...H('Una de las preguntas', 'Plano medio', 'Entonces esa será una de las preguntas del Ágape.'),
        ...V('Quédate conmigo', 'Primer plano', `${MESA} ${M} baja la cabeza y cierra los ojos; la luz dorada se vuelve cálida y ámbar por un instante.`, 'esposa', 'Quédate conmigo.'),
        ...S('Silencio', 'Plano general', `${SALON} ${M} abre los ojos; el salón está completamente en silencio.`, DORADO, 4)
      ]
    },
    // ---------------------------------------------------------------- SECUENCIA 6
    {
      title: 'Los primeros convidados', summary: 'Se abren los portones: entran Sócrates, Platón y Aristóteles.',
      location: 'Portones del salón del Ágape', wardrobe: VESTUARIO_MARTIN, cast: ['martin', 'heraldo', 'socrates', 'platon', 'aristoteles'],
      music: 'M06 «Los hombres que desafiaron la eternidad»: tema orquestal majestuoso con cuerdas, metales y coro sin palabras; grandeza y desconcierto, sin triunfalismo.',
      musicPrompt: 'Original cinematic film score, the men who defied eternity: majestic orchestral theme, strings, brass and wordless choir, grandeur and bewilderment, not triumphant. No vocals.',
      beats: [
        ...H('Prepárate', 'Plano medio', 'Prepárate.', 'mira hacia los portones de roble'),
        ...DM('¿Para qué?', 'Primer plano', 'nervioso', '¿Para qué?', DORADO, PORTONES),
        ...H('El primer invitado', 'Plano medio', 'El primer invitado se acerca.'),
        ...S('Se abren los portones', 'Plano general', `${PORTONES} los portones de roble comienzan a abrirse muy lentamente, pesados y solemnes.`, DORADO, 8),
        ...S('Sócrates en el umbral', 'Plano general', `${PORTONES} en el umbral aparece ${SOCRATES}; detrás se adivinan otras dos figuras.`),
        ...D('Curioso lugar', 'Plano medio', `${PORTONES} ${SOCRATES}, mira las columnas con curiosidad.`, 'socrates', 'Curioso lugar.'),
        ...D('Demasiado elegante', 'Plano medio', `${PORTONES} ${SOCRATES}, sonríe con ironía.`, 'socrates', 'Demasiado elegante para una prisión y demasiado silencioso para una plaza pública.'),
        ...D('Una categoría conocida', 'Plano medio', `${PORTONES} ${PLATON}, entra junto a Sócrates.`, 'platon', 'Tal vez estás buscando una categoría conocida para algo que todavía no has comprendido, maestro.'),
        ...D('Una teoría antes de preguntar', 'Primer plano', `${PORTONES} ${SOCRATES}, responde divertido a Platón.`, 'socrates', 'Y tal vez tú ya estás buscando una teoría antes de preguntar dónde estamos.'),
        ...D('Lo evidente', 'Plano medio', `${PORTONES} ${ARISTOTELES}, entra detrás y observa todo con calma.`, 'aristoteles', 'Podríamos comenzar observando lo evidente: hay una mesa, sillas y un anfitrión visiblemente perturbado.'),
        ...D('Al fin alguien', 'Plano medio', `${SALON} ${SOCRATES}, ve a Martin y se le ilumina la cara.`, 'socrates', 'Ah. Al fin alguien que parece tan confundido como nosotros.'),
        ...D('¿Anfitrión o carcelero?', 'Primer plano', `${SALON} ${SOCRATES}, se acerca a Martin y lo mira de cerca.`, 'socrates', 'Dime, joven. ¿Eres nuestro anfitrión o nuestro carcelero?'),
        ...DM('¿Sócrates?', 'Primer plano', 'apenas puede hablar, maravillado', '¿Sócrates?'),
        ...D('No es mi nombre', 'Primer plano', `${SALON} ${SOCRATES}, con una sonrisa pícara.`, 'socrates', 'Eso me han llamado muchas veces. Aunque sospecho que no es mi nombre lo que te asusta.'),
        ...DM('No puede ser', 'Primer plano', 'incrédulo', 'No puede ser.'),
        ...D('Una afirmación interesante', 'Plano medio', `${SALON} ${SOCRATES}, levanta un dedo, encantado.`, 'socrates', 'Una afirmación interesante. ¿Quieres decir que no puede ocurrir o que todavía no sabes cómo explicarlo?'),
        ...DM('¿Platón?', 'Plano medio', 'mira hacia Platón', '¿Platón?'),
        ...S('Platón inclina la cabeza', 'Plano medio', `${SALON} ${PLATON}, inclina la cabeza con solemnidad.`, DORADO, 4),
        ...DM('¿Aristóteles?', 'Plano medio', 'mira hacia Aristóteles', '¿Aristóteles?'),
        ...D('Presente', 'Plano medio', `${SALON} ${ARISTOTELES}, responde con sobriedad.`, 'aristoteles', 'Presente. Aunque agradecería que no demoráramos demasiado en explicar la naturaleza de nuestra reunión.'),
        ...D('¡Excelente!', 'Plano medio', `${SALON} ${SOCRATES}, sonríe ampliamente.`, 'socrates', '¡Excelente! Ni siquiera hemos tomado asiento y ya queremos explicarlo todo.'),
        ...DM('He estudiado vuestras ideas', 'Primer plano', 'entre la fascinación y el temor', 'He estudiado vuestras ideas durante años.'),
        ...D('Muchas preguntas', 'Primer plano', `${SALON} ${SOCRATES}, con interés.`, 'socrates', 'Entonces tendrás muchas preguntas.'),
        ...DM('Demasiadas', 'Primer plano', 'con una media sonrisa nerviosa', 'Tengo demasiadas.'),
        ...D('Un comienzo prometedor', 'Plano medio', `${SALON} ${SOCRATES}, satisfecho.`, 'socrates', 'Es un comienzo prometedor.')
      ]
    },
    // ---------------------------------------------------------------- SECUENCIA 7
    {
      title: 'La filosofía frente al dolor', summary: 'Primera disputa: Martin enfrenta a los filósofos con su dolor; ellos distinguen consuelo, verdad y demostración.',
      location: 'Mesa del Ágape', wardrobe: VESTUARIO_MARTIN, cast: ['martin', 'socrates', 'platon', 'aristoteles'],
      music: 'M07 «La primera disputa»: cuerdas tensas, violonchelo y piano; más energía en los enfrentamientos, sin cubrir las voces.',
      musicPrompt: 'Original cinematic film score, the first dispute: tense strings, cello and piano, rising dialectical energy, restrained so dialogue stays clear. No vocals.',
      beats: [
        ...S('Toman asiento', 'Plano general', `${MESA} ${SOCRATES}, ${PLATON} y ${ARISTOTELES} toman asiento; ${M} permanece de pie junto a la silla del Moderador.`, DORADO, 6),
        ...D('¿Qué pregunta?', 'Plano medio', `${MESA} ${SOCRATES}, sentado, mira a Martin.`, 'socrates', 'Bien, Martin. ¿Qué pregunta puede ser tan importante que necesites convocar a quienes llevan siglos muertos?'),
        ...DM('La existencia', 'Primer plano', 'de pie, serio', 'La existencia.', DORADO, MESA),
        ...D('Bastante amplio', 'Plano medio', `${MESA} ${SOCRATES}, asiente.`, 'socrates', 'Eso es bastante amplio.'),
        ...DM('El sufrimiento', 'Primer plano', 'con dureza', 'El sufrimiento.', DORADO, MESA),
        ...S('La sonrisa desaparece', 'Primer plano', `${MESA} la sonrisa de ${SOCRATES} desaparece lentamente.`, DORADO, 4),
        ...DM('El silencio de Dios', 'Primer plano', 'en voz baja', 'El silencio de Dios.', DORADO, MESA),
        ...D('¿Comprender o recuperar?', 'Plano medio', `${MESA} ${PLATON}, observa a Martin con atención.`, 'platon', '¿Buscas comprender el universo o buscas recuperar algo que has perdido?'),
        ...DM('Ambas cosas', 'Primer plano', 'sin dudar', 'Ambas cosas.', DORADO, MESA),
        ...D('No es la misma investigación', 'Plano medio', `${MESA} ${ARISTOTELES}, con precisión.`, 'aristoteles', 'No necesariamente son la misma investigación.'),
        ...DM('¿Qué quieres decir?', 'Primer plano', 'se vuelve hacia Aristóteles', '¿Qué quieres decir?', DORADO, MESA),
        ...D('Planos distintos', 'Plano medio', `${MESA} ${ARISTOTELES}, explica con calma.`, 'aristoteles', 'La explicación de un fenómeno y el significado personal de ese fenómeno pertenecen a planos distintos.'),
        ...DM('¿Distintos?', 'Primer plano', 'escéptico', '¿Distintos?', DORADO, MESA),
        ...D('Ninguna explicación consuela', 'Plano medio', `${MESA} ${ARISTOTELES}, con serenidad analítica.`, 'aristoteles', 'La ciencia puede examinar una enfermedad. La metafísica, las causas fundamentales. Pero ninguna explicación causal produce por sí sola consuelo.'),
        ...DM('Murió de cáncer', 'Primer plano', 'aprieta el mazo, sin mostrar de cerca las manos', 'Mi esposa murió de cáncer.', DORADO, MESA),
        ...S('Silencio en la mesa', 'Plano general', `${MESA} silencio total; los tres filósofos miran a Martin.`, DORADO, 4),
        ...DM('Mis argumentos no podían salvarla', 'Primer plano', 'con la voz quebrada', 'Durante años busqué una explicación para la existencia de Dios. Pero cuando la vi morir descubrí que mis argumentos no podían salvarla.', DORADO, MESA),
        ...D('¿La verdad no existe?', 'Plano medio', `${MESA} ${PLATON}, pregunta con suavidad.`, 'platon', '¿Y concluiste que la verdad no existe?'),
        ...DM('Grandes palabras', 'Primer plano', 'con amargura', 'Concluí que muchas personas utilizan grandes palabras para no mirar de frente el sufrimiento.', DORADO, MESA),
        ...D('Es posible', 'Plano medio', `${MESA} ${SOCRATES}, se inclina hacia delante.`, 'socrates', 'Es posible. Pero dime algo: si una explicación es incapaz de consolarte, ¿significa que es falsa?'),
        ...DM('No necesariamente', 'Primer plano', 'vacila', 'No necesariamente.', DORADO, MESA),
        ...D('¿Te consuela, luego es verdad?', 'Primer plano', `${MESA} ${SOCRATES}, insiste con suavidad.`, 'socrates', '¿Y si una explicación te consuela, significa que es verdadera?'),
        ...DM('Tampoco', 'Primer plano', 'en voz baja', 'Tampoco.', DORADO, MESA),
        ...D('El dolor merece respeto', 'Plano medio', `${MESA} ${SOCRATES}, con gravedad.`, 'socrates', 'Entonces el dolor merece respeto, pero no puede convertirse por sí solo en el criterio definitivo de la verdad.'),
        ...DM('¡Mi dolor no es un ejercicio!', 'Plano medio', 'golpea con el mazo sobre la mesa', '¡Mi dolor no es un ejercicio filosófico!', DORADO, MESA),
        ...S('Los filósofos callan', 'Plano general', `${MESA} los tres filósofos guardan silencio.`, DORADO, 4),
        ...DM('¡Yo estuve allí!', 'Primer plano', 'con la voz rota y furiosa', '¡Yo estuve allí! ¡Yo la vi sufrir! ¡Yo escuché cómo la enfermedad le arrebataba la voz!', DORADO, MESA),
        ...DM('Como en una biblioteca', 'Plano medio', 'respira con dificultad', 'Y ahora vosotros habláis de causas, ideas y categorías como si todo pudiera organizarse en una biblioteca.', DORADO, MESA),
        ...D('No confundas', 'Plano medio', `${MESA} ${PLATON}, se incorpora.`, 'platon', 'No confundas nuestro intento de comprender con indiferencia.'),
        ...DM('Dime algo que importe', 'Primer plano', 'desafiante', 'Entonces dime algo que importe.', DORADO, MESA),
        ...D('No reduzcas la realidad', 'Primer plano', `${MESA} ${PLATON}, mira a Martin a los ojos.`, 'platon', 'Importa que no reduzcas toda la realidad al acontecimiento más doloroso que has vivido.'),
        ...DM('¿Qué realidad?', 'Primer plano', 'conmovido a su pesar', '¿Y qué realidad debería mirar?', DORADO, MESA),
        ...D('Reconocer el amor', 'Primer plano', `${MESA} ${PLATON}, con solemnidad.`, 'platon', 'La que hace posible que puedas reconocer el amor como un bien, incluso después de haberlo perdido.'),
        ...S('Martin inmóvil', 'Primer plano', `${MESA} ${M} queda inmóvil.`, DORADO, 4),
        ...D('No demuestra todavía', 'Plano medio', `${MESA} ${ARISTOTELES}, con rigor.`, 'aristoteles', 'Pero ese reconocimiento no demuestra todavía que el universo tenga una voluntad personal.'),
        ...D('No he dicho que lo demuestre', 'Plano medio', `${MESA} ${PLATON}, responde a Aristóteles.`, 'platon', 'No he dicho que lo demuestre.'),
        ...D('Distinguir', 'Plano medio', `${MESA} ${ARISTOTELES}, cortante.`, 'aristoteles', 'Entonces debemos distinguir intuición, esperanza y demostración.'),
        ...D('La vanidad', 'Plano medio', `${MESA} ${SOCRATES}, con humor.`, 'socrates', 'Y distinguir ambas cosas de la vanidad de quien quiere tener la última palabra.'),
        ...DM('Una discusión que no he imaginado', 'Primer plano', 'observa a los tres, asombrado', 'Por primera vez estoy escuchando una discusión que no he imaginado leyendo un libro.', DORADO, MESA),
        ...D('Un anfitrión dispuesto', 'Plano medio', `${MESA} ${SOCRATES}, sonríe.`, 'socrates', 'Y por primera vez nosotros tenemos un anfitrión que parece dispuesto a cuestionarlo todo.'),
        ...DM('No os he convocado para eso', 'Primer plano', 'con determinación', 'No os he convocado para que me digáis lo que deseo escuchar.', DORADO, MESA),
        ...D('Podremos trabajar', 'Plano medio', `${MESA} ${ARISTOTELES}, asiente satisfecho.`, 'aristoteles', 'Entonces podremos trabajar.')
      ]
    },
    // ---------------------------------------------------------------- SECUENCIA 8
    {
      title: 'El invitado que nadie convocó', summary: 'Martin anuncia a un invitado más; la luz se apaga y entra el Fiscal.',
      location: 'Gran salón del Ágape, oscuridad creciente', wardrobe: VESTUARIO_MARTIN, cast: ['martin', 'heraldo', 'socrates', 'platon', 'aristoteles', 'fiscal'],
      music: 'M08 «La sombra elegante»: pulso grave como un reloj, nota disonante de violín, golpes de contrabajo y piano frío; termina en un impacto orquestal.',
      musicPrompt: 'Original cinematic film score, the elegant shadow: low clock-like pulse, dissonant violin note, double bass hits, cold piano motif, suspense building to a final orchestral impact. No vocals.',
      beats: [
        ...S('Martin mira al Heraldo', 'Plano general', `${SALON} ${M} mira hacia ${HERALDO}, que permanece junto a una columna.`, DORADO, 4),
        ...DM('Algo que no os he contado', 'Primer plano', 'grave', 'Hay algo que no os he contado.', DORADO, MESA),
        ...D('Lo más interesante', 'Plano medio', `${MESA} ${SOCRATES}, levanta la mirada.`, 'socrates', 'Eso suele ser lo más interesante de una reunión.'),
        ...DM('No somos los únicos', 'Primer plano', 'serio', 'No somos los únicos invitados.', DORADO, MESA),
        ...D('¿A quién esperas?', 'Plano medio', `${MESA} ${ARISTOTELES}, endereza la espalda.`, 'aristoteles', '¿A quién esperas?'),
        ...DM('Una excusa', 'Primer plano', 'mira el mazo, sin mostrar de cerca las manos', 'A alguien que dice que toda nuestra filosofía es una excusa.', DORADO, MESA),
        ...D('¿Para qué?', 'Plano medio', `${MESA} ${PLATON}, inquieto.`, 'platon', '¿Una excusa para qué?'),
        ...DM('Sin sentido', 'Primer plano', 'en voz baja', 'Para no aceptar que quizá el universo no tiene sentido.', SOMBRA, MESA),
        ...DM('La acusación más poderosa', 'Primer plano', 'mientras la luz se debilita', 'Alguien que cree que el sufrimiento de los inocentes es la acusación más poderosa contra la existencia de un Dios bueno.', SOMBRA, MESA),
        ...S('Sócrates calla', 'Primer plano', `${MESA} ${SOCRATES}, guarda silencio, pensativo.`, SOMBRA, 4),
        ...D('Tendrá que presentar argumentos', 'Plano medio', `${MESA} ${ARISTOTELES}, firme.`, 'aristoteles', 'Entonces tendrá que presentar sus argumentos.', SOMBRA),
        ...DM('No viene a buscar respuestas', 'Primer plano', 'sombrío', 'No vendrá a buscar respuestas.', SOMBRA, MESA),
        ...D('¿Qué viene a buscar?', 'Plano medio', `${MESA} ${PLATON}.`, 'platon', '¿Qué viene a buscar?', SOMBRA),
        ...DM('La destrucción', 'Primer plano', 'con temor', 'La destrucción de nuestras certezas.', SOMBRA, MESA),
        ...S('Las copas vibran', 'Plano detalle', `${MESA} una corriente de aire recorre el salón y las copas de cristal comienzan a vibrar.`, SOMBRA, 4),
        ...H('Moderador', 'Plano medio', 'Moderador.', 'avanza lentamente hacia Martin', SOMBRA),
        ...DM('¿Qué sucede?', 'Primer plano', 'tenso', '¿Qué sucede?', SOMBRA),
        ...H('El invitado final', 'Plano medio', 'El invitado final de esta convocatoria ha llegado.', 'inmóvil mientras la luz dorada se apaga', SOMBRA),
        ...S('Pasos sobre el mármol', 'Plano detalle', `${SALON} unos zapatos negros perfectamente pulidos avanzan sin prisa sobre el mármol negro.`, SOMBRA, 4),
        ...S('El abrigo y el puño', 'Plano detalle', `${SALON} un abrigo oscuro de corte elegante y un puño de camisa blanco que se ajusta con un gesto sobrio, encuadre sin mostrar los dedos de cerca.`, SOMBRA, 4),
        ...S('Entra el Fiscal', 'Plano general', `${SALON} ${FISCAL}, entra sin apresurarse, con el rostro parcialmente oculto en la sombra, y se detiene frente a la mesa.`, SOMBRA, 6),
        ...V('Moderador...', 'Plano medio', `${SALON} ${FISCAL}, mira directamente a Martin; la mitad de su rostro en sombra.`, 'fiscal', 'Moderador...', SOMBRA),
        ...V('La petición fue sincera', 'Plano medio', `${SALON} ${FISCAL}, inmóvil, con media sonrisa.`, 'fiscal', 'Veo que la petición fue sincera.', SOMBRA),
        ...DM('El Fiscal', 'Primer plano', 'palidece; susurra aterrado', 'El Fiscal...', SOMBRA),
        ...S('La sonrisa del Fiscal', 'Primer plano', `${SALON} ${FISCAL}, sonríe ligeramente en la penumbra.`, SOMBRA, 4),
        ...S('Corte a negro', 'Plano general', 'Pantalla completamente negra.', NEGRO, 4)
      ]
    }
  ]
};

export function createEpisodio2Bundle(now?: string) { return buildShortFilmBundle(EPISODIO_2_SPEC, now); }
export function getEpisodio2Stats() { return shortFilmStats(EPISODIO_2_SPEC); }
