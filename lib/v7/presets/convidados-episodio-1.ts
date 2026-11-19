/**
 * «LOS CONVIDADOS AL ÁGAPE» · EPISODIO 1 — LA PETICIÓN EN LA MONTAÑA (≈15 min).
 * Adaptación de la introducción y el capítulo 1 de la novela de Martin Mateo.
 *
 * Reglas de producción (biblia del autor):
 * - Diálogos EN CÁMARA (onCamera): Veo genera la voz en español y los labios sincronizados.
 * - Voces en off (Narrador, Voz interior, Voz desconocida, Martin V.O.): ElevenLabs, voz estable.
 * - Fichas fijas de personaje (serie los-convidados-al-agape): misma cara en todas las tomas.
 * - Color: azules fríos y grises en el presente; ámbar en los recuerdos; negro profundo y dorado al final.
 * - Sin figuras históricas en la montaña, sin mostrar todavía el tribunal del Ágape.
 * - Tomas de 4, 6 u 8 s (límite del motor). Títulos y créditos en posproducción.
 */
import { buildShortFilmBundle, shortFilmStats, type ShortFilmBeat, type ShortFilmSpec } from '@/lib/v7/presets/short-film-builder';
import { CONVIDADOS_REPARTO, CONVIDADOS_SERIE } from '@/lib/v7/presets/convidados-reparto';

export const EPISODIO_1_ID = 'film-convidados-ep01-v7';

const cast = (key: string) => CONVIDADOS_REPARTO.find((c) => c.key === key)!.descripcion;
const MARTIN = 'Martin, ' + cast('martin');
const ESPOSA = 'su esposa, ' + cast('esposa');
const M_CASA = MARTIN + ', con un suéter gris oscuro';
const M_NOCHE = MARTIN + ', con una camisa gris arrugada y los ojos enrojecidos por el insomnio';
const M_MONTE = MARTIN + ', con una chaqueta técnica de alta montaña azul oscuro, la capucha bajada, mochila y guantes';
const E_CAMA = ESPOSA + ', pálida y debilitada, con bata de hospital, recostada en la cama';

const FRIO = 'Cine dramático de alto presupuesto, fotorrealista, sin aspecto de videojuego, formato 16:9. Paleta de azules fríos y grises.';
const AMBAR = 'Cine dramático fotorrealista, formato 16:9. Recuerdo cálido en tonos ámbar, grano suave de película.';
const FINAL = 'Cine fotorrealista, formato 16:9. Negro profundo y destellos dorados.';
const LIMPIO = 'Sin subtítulos ni texto en pantalla.';
const QUIETO = 'Bocas cerradas.';

const SPEAK: Record<string, string> = {
  martin: 'Martin dice en español, con voz masculina grave, natural y contenida',
  esposa: 'Ella dice en español, con voz femenina suave, cansada y lúcida'
};
/** Diálogo en cámara: Veo genera voz y labios. */
const D = (title: string, camera: string, scene: string, who: 'martin' | 'esposa', line: string, style = FRIO, seconds: 4 | 6 | 8 = 8): ShortFilmBeat =>
  ({ title, camera, onCamera: true, seconds, voice: who, line, prompt: `${camera}. ${scene} ${SPEAK[who]}: «${line}». ${style} ${LIMPIO}` });
/** Voz en off (ElevenLabs) sobre una imagen sin diálogo. */
const V = (title: string, camera: string, scene: string, who: string, line: string, style = FRIO, seconds: 4 | 6 | 8 = 8): ShortFilmBeat =>
  ({ title, camera, seconds, voice: who, line, prompt: `${camera}. ${scene} ${QUIETO} ${style} ${LIMPIO}` });
/** Imagen sin voz. */
const S = (title: string, camera: string, scene: string, style = FRIO, seconds: 4 | 6 | 8 = 6): ShortFilmBeat =>
  ({ title, camera, seconds, voice: 'narrador', line: '', prompt: `${camera}. ${scene} ${QUIETO} ${style} ${LIMPIO}` });

const HOSPITAL = 'En una habitación de hospital de noche, iluminada por la luz verdosa de un monitor cardíaco,';
const PISO = 'En un pequeño apartamento en penumbra a las tres de la madrugada, con estanterías llenas de libros,';
const ESTUDIO = 'En un estudio nocturno con estanterías de filosofía, una lámpara de mesa y una pizarra,';
const CUMBRE = 'En la cumbre nevada de una montaña sobre un océano de nubes, sin banderas ni refugios,';

export const EPISODIO_1_SPEC: ShortFilmSpec = {
  id: EPISODIO_1_ID,
  title: 'LOS CONVIDADOS AL ÁGAPE · EPISODIO 1 — LA PETICIÓN EN LA MONTAÑA',
  premise: 'Un hombre que ha perdido al amor de su vida decide llevar a Dios ante un tribunal imposible. ' +
    'Antes de que exista el tribunal, debe formular la acusación. Sube al Pico del Silencio, exige una respuesta… y alguien responde.',
  genre: 'Drama psicológico, filosofía, tragedia romántica, misterio metafísico',
  audience: 'Público adulto',
  visualStyle: 'Cine dramático de alto presupuesto, fotorrealista; azules fríos en el presente, ámbar en los recuerdos, negro y dorado al final',
  continuityNotes: ['Martin siempre con la misma cara (ficha oficial)', 'Voz interior: el mismo actor de Martin con tratamiento sonoro', 'No mostrar el tribunal del Ágape', 'Sin figuras históricas en la montaña'],
  metadata: {
    serie: CONVIDADOS_SERIE, episode: 1, author: 'Martin Mateo', format: 'serie',
    book: 'Los convidados al Ágape — El banquete de los filósofos',
    closingCard: '¿Qué ocurriría si un hombre exigiera a Dios una respuesta... y alguien respondiera?',
    endCardLines: ['LOS CONVIDADOS AL ÁGAPE', 'EPISODIO 1 — FIN', 'Próximo episodio: EL UMBRAL DEL ÁGAPE']
  },
  characters: [
    { key: 'martin', name: 'Martin', age: 42, role: 'Protagonista, profesor de filosofía', appearance: cast('martin'), voice: 'Voz masculina grave, expresiva y natural.' },
    { key: 'esposa', name: 'Esposa de Martin', age: 40, role: 'Esposa de Martin, enferma terminal', appearance: cast('esposa'), voice: 'Voz femenina suave, afectuosa y lúcida.' },
    { key: 'narrador', name: 'Narrador', age: 55, role: 'Narrador', appearance: 'Voz en off, sin imagen', voice: 'Voz cinematográfica sobria.' },
    { key: 'voz-interior', name: 'Voz interior', age: 42, role: 'Pensamiento crítico de Martin', appearance: 'Voz en off, sin imagen', voice: 'La voz de Martin con tratamiento sonoro interior.' },
    { key: 'voz-desconocida', name: 'Voz desconocida', age: 99, role: 'Presencia que responde', appearance: 'Voz en off, sin imagen', voice: 'Profunda, no humana, difícil de localizar.' }
  ],
  scenes: [
    {
      title: 'La pregunta que nadie quiere responder', summary: 'Martin acompaña a su esposa en sus últimos momentos en el hospital.',
      location: 'Hospital, noche', wardrobe: 'Martin con suéter gris oscuro; ella con bata de hospital', cast: ['martin', 'esposa', 'narrador'],
      music: 'M01 «El último latido»: piano solitario de notas separadas, pulso grave como un corazón; entra un violonchelo poco a poco.',
      musicPrompt: 'Original cinematic film score, intimate and tragic: a lonely solo piano playing sparse separated notes over a low pulse like a slow heartbeat; a cello enters gradually. Slow tempo, minor key, no vocals, no drums.',
      beats: [
        V('Pantalla casi negra', 'Plano fijo casi a oscuras', 'Una cortina de hospital en penumbra; solo un leve reflejo verde de un monitor se mueve en la oscuridad.', 'martin',
          'Si pudieras elegir entre haber existido y no haber nacido nunca... ¿qué elegirías?'),
        S('La habitación', 'Plano general lento', `${HOSPITAL} ${M_CASA} está sentado junto a la cama y sostiene la mano de ${E_CAMA}.`),
        D('¿Por qué me miras así?', 'Primer plano de ella', `${HOSPITAL} ${E_CAMA}, mira a Martin con ternura.`, 'esposa', '¿Por qué me miras así?', FRIO, 6),
        D('Miedo de olvidar', 'Primer plano de Martin', `${HOSPITAL} ${M_CASA} la mira fijamente, con los ojos húmedos.`, 'martin', 'Porque tengo miedo de olvidar tu rostro.', FRIO, 6),
        D('Mírame bien', 'Primer plano de ella', `${HOSPITAL} ${E_CAMA}, sonríe débilmente.`, 'esposa', 'Entonces mírame bien.', FRIO, 4),
        D('Envejecer juntos', 'Plano medio de Martin', `${HOSPITAL} ${M_CASA} intenta sonreír sin conseguirlo.`, 'martin', 'Nos prometimos envejecer juntos.', FRIO, 6),
        D('Envejecimos un poco', 'Primer plano de ella', `${HOSPITAL} ${E_CAMA}, con una sonrisa cansada.`, 'esposa', 'Y envejecimos un poco.', FRIO, 4),
        D('No es suficiente', 'Primer plano de Martin', `${HOSPITAL} ${M_CASA} niega levemente con la cabeza.`, 'martin', 'No es suficiente.', FRIO, 4),
        D('Cuando amas algo', 'Plano medio de ella', `${HOSPITAL} ${E_CAMA}, le mira con cariño.`, 'esposa', 'Para ti nunca es suficiente cuando amas algo.', FRIO, 6),
        D('Pedirle que te deje', 'Primer plano de Martin', `${HOSPITAL} ${M_CASA} aprieta la mano de su esposa.`, 'martin', 'Si Dios existe... voy a pedirle que te deje conmigo.'),
        D('Martin...', 'Plano detalle y rostro de ella', `${HOSPITAL} ${E_CAMA}, aprieta suavemente la mano de Martin.`, 'esposa', 'Martin...', FRIO, 4),
        D('No me pidas una razón', 'Primer plano de Martin', `${HOSPITAL} ${M_CASA}, con la voz tensa.`, 'martin', 'No. No me digas que debo aceptarlo. No me pidas que encuentre una razón.'),
        D('Sé todas las explicaciones', 'Primer plano de Martin', `${HOSPITAL} ${M_CASA}, agotado.`, 'martin', 'He pasado años leyendo sobre el sufrimiento. Sé todas las explicaciones.'),
        D('¿Alguna te sirve?', 'Primer plano de ella', `${HOSPITAL} ${E_CAMA}, serena.`, 'esposa', '¿Y alguna te sirve ahora?', FRIO, 6),
        D('Ninguna', 'Primer plano de Martin', `${HOSPITAL} ${M_CASA} baja la mirada.`, 'martin', 'Ninguna.', FRIO, 4),
        D('Quédate conmigo', 'Plano medio', `${HOSPITAL} ${E_CAMA}, le acaricia el rostro a Martin con la mano.`, 'esposa', 'Entonces deja de buscar una explicación por un momento. Quédate conmigo.'),
        S('Frente con frente', 'Primer plano', `${HOSPITAL} ${M_CASA} acerca su frente a la de ${E_CAMA}; ambos cierran los ojos en silencio.`, FRIO, 8),
        V('Línea plana', 'Plano detalle', 'La pantalla de un monitor cardíaco en una habitación oscura muestra una línea plana verde; la luz verde ilumina tenuemente unas sábanas blancas.', 'narrador',
          'La muerte no le había quitado una teoría. Le había quitado a la persona con quien había construido su mundo.')
      ]
    },
    {
      title: 'Veintidós años contra el infinito', summary: 'De madrugada, Martin vive la ausencia en su apartamento y se rebela contra la filosofía.',
      location: 'Apartamento, madrugada', wardrobe: 'Camisa gris arrugada', cast: ['martin', 'esposa'],
      music: 'M02 «La casa de la ausencia»: piano íntimo, textura ambiental tenue, cuerdas que parecen respirar. Sin percusión.',
      musicPrompt: 'Original cinematic film score, intimate grief: soft piano with a four-note love motif, faint ambient texture, strings that seem to breathe. No percussion, no vocals, very slow and quiet.',
      beats: [
        S('Las tres de la madrugada', 'Plano general', `${PISO} ${M_NOCHE} está sentado solo frente a una mesa con dos tazas diferentes.`),
        S('Objetos de ella', 'Planos detalle encadenados', 'Una bufanda de mujer colgada detrás de una puerta, un frasco de perfume sobre una cómoda y un calendario de papel detenido en febrero, en penumbra azulada.'),
        D('La lista de compras', 'Plano medio', `${PISO} ${M_NOCHE} sostiene una pequeña lista de compras escrita a mano y la lee en voz baja.`, 'martin', 'Pan... café... detergente... llamar al seguro...'),
        D('Hasta tu letra', 'Primer plano', `${PISO} ${M_NOCHE} se detiene y acaricia el papel con el pulgar.`, 'martin', 'Hasta tu letra sigue aquí.', FRIO, 6),
        S('El mensaje que no envía', 'Plano detalle', `${PISO} las manos de Martin sostienen un teléfono con una conversación abierta; escribe un mensaje, duda y no lo envía. La pantalla está desenfocada.`),
        D('Veintidós años', 'Primer plano', `${PISO} ${M_NOCHE} mira el teléfono apagarse.`, 'martin', 'Veintidós años...', FRIO, 4),
        S('Recuerdo: la boda', 'Plano medio', `Una boda sencilla al aire libre: ${MARTIN}, más joven y sonriente, con traje claro, baila con ${ESPOSA}, más joven, con vestido blanco sencillo.`, AMBAR),
        S('Recuerdo: la mudanza', 'Plano general', `La pareja joven, ${MARTIN} y ${ESPOSA}, carga cajas de cartón riendo en un apartamento vacío y luminoso.`, AMBAR),
        S('Recuerdo: la discusión y la reconciliación', 'Plano medio', `En una cocina modesta, ${MARTIN} y ${ESPOSA} discuten en silencio con los brazos cruzados; luego ella sonríe y él la abraza.`, AMBAR, 8),
        S('Recuerdo: la risa', 'Primer plano', `${ESPOSA} ríe a carcajadas en una cena modesta iluminada por una vela, mirando a cámara con amor.`, AMBAR),
        D('Kant', 'Plano medio', `${PISO} ${M_NOCHE} abre un libro grueso de filosofía.`, 'martin', 'Kant... los límites del conocimiento.', FRIO, 6),
        D('Leibniz', 'Plano medio', `${PISO} ${M_NOCHE} abre otro libro.`, 'martin', 'Leibniz... el mejor de los mundos posibles.', FRIO, 6),
        D('Camus', 'Plano medio', `${PISO} ${M_NOCHE} abre un tercer libro y lo cierra de golpe con rabia.`, 'martin', 'Camus... el absurdo.', FRIO, 6),
        D('¿El mejor de los mundos?', 'Primer plano', `${PISO} ${M_NOCHE}, con amargura.`, 'martin', '¿El mejor de los mundos posibles?', FRIO, 6),
        D('Murió a los cuarenta', 'Plano medio', `${PISO} ${M_NOCHE} se levanta bruscamente de la silla.`, 'martin', '¡Mi esposa murió a los cuarenta años!', FRIO, 6),
        D('¿Qué significa mejor?', 'Plano medio en movimiento', `${PISO} ${M_NOCHE} camina entre las estanterías.`, 'martin', '¿Qué significa «mejor» cuando una mujer se consume en una cama?'),
        D('El cálculo cósmico', 'Primer plano', `${PISO} ${M_NOCHE} se detiene frente a la estantería.`, 'martin', '¿Qué clase de cálculo convierte una vida destruida en una necesidad cósmica?'),
        D('Conceptos, células, procesos', 'Plano medio', `${PISO} ${M_NOCHE} mira el libro que sostiene.`, 'martin', 'La filosofía explica conceptos. La medicina explica células. La física explica procesos.'),
        D('Nadie explica', 'Plano medio', `${PISO} ${M_NOCHE} golpea la mesa con la palma de la mano.`, 'martin', '¡Pero nadie explica por qué una persona capaz de amar debe desaparecer!'),
        D('¿Dónde está ella?', 'Primer plano', `${PISO} ${M_NOCHE}, con la voz quebrada.`, 'martin', 'Y si todo tiene una explicación... ¿por qué ninguna puede decirme dónde está ella?'),
        S('La silla vacía', 'Plano medio', `${PISO} una silla vacía junto a la mesa, iluminada por la luz azul de la ventana; ${M_NOCHE} la mira en silencio.`),
        D('Te extraño', 'Primer plano sostenido', `${PISO} ${M_NOCHE}; las lágrimas aparecen en sus ojos.`, 'martin', 'Te extraño.', FRIO, 6)
      ]
    },
    {
      title: 'El juicio de los libros', summary: 'Martin confronta su razón: el problema del mal discutido con su voz interior.',
      location: 'Estudio, madrugada', wardrobe: 'Camisa gris arrugada', cast: ['martin', 'voz-interior'],
      music: 'M03 «El tribunal de la razón»: ostinato de cuerdas, piano grave y pulsos electrónicos discretos; la tensión crece con cada argumento.',
      musicPrompt: 'Original cinematic film score, intellectual tension: string ostinato, low piano, discreet electronic pulses, tension slowly building, suspended harmonies. No vocals.',
      beats: [
        S('Tres libros como testigos', 'Travelling circular lento', `${ESTUDIO} ${M_NOCHE} coloca tres libros sobre la mesa; haces de luz aíslan cada libro como si fuera un testigo.`),
        D('Seis años', 'Plano medio', `${ESTUDIO} ${M_NOCHE} apoya las manos en la mesa.`, 'martin', 'Seis años estudiando filosofía. Seis años tratando de demostrar que la razón puede sostenernos.'),
        D('Primera pregunta', 'Primer plano', `${ESTUDIO} ${M_NOCHE} abre un cuaderno lleno de anotaciones.`, 'martin', '¿Puede existir un Dios omnipotente y bueno en un universo donde sufren los inocentes?'),
        V('No demuestra', 'Primer plano', `${ESTUDIO} ${M_NOCHE} escucha en silencio, inmóvil.`, 'voz-interior', 'La existencia del sufrimiento no demuestra necesariamente la inexistencia de Dios.'),
        D('Correcto', 'Plano medio', `${ESTUDIO} ${M_NOCHE} asiente despacio.`, 'martin', 'Correcto. La lógica permite esa posibilidad.', FRIO, 6),
        V('No has refutado a Dios', 'Plano medio', `${ESTUDIO} ${M_NOCHE} se queda mirando el cuaderno.`, 'voz-interior', 'Entonces no has refutado a Dios.', FRIO, 6),
        D('Tampoco justificado', 'Primer plano', `${ESTUDIO} ${M_NOCHE} levanta la mirada.`, 'martin', 'No. Pero tampoco lo has justificado.', FRIO, 6),
        V('Una razón que no comprendes', 'Plano medio de espaldas', `${ESTUDIO} ${M_NOCHE} se acerca a la ventana oscura, de espaldas a la cámara.`, 'voz-interior', 'Quizá existe una razón que no comprendes.', FRIO, 6),
        D('Excusa imposible', 'Perfil junto a la ventana', `${ESTUDIO} ${M_NOCHE} se gira hacia la habitación.`, 'martin', '¿Y qué diferencia hay entre una razón inaccesible y una excusa imposible de verificar?'),
        V('No todo lo verdadero', 'Primer plano', `${ESTUDIO} ${M_NOCHE} aprieta la mandíbula.`, 'voz-interior', 'No todo lo verdadero tiene que ser comprensible para ti.', FRIO, 6),
        D('No todo lo incomprensible', 'Primer plano', `${ESTUDIO} ${M_NOCHE}, con fuerza contenida.`, 'martin', '¡Y no todo lo incomprensible merece ser llamado verdad!', FRIO, 6),
        V('La libertad humana', 'Plano medio', `${ESTUDIO} ${M_NOCHE} camina despacio por la habitación.`, 'voz-interior', 'La libertad humana puede explicar el mal moral.', FRIO, 6),
        D('¿Y el cáncer?', 'Primer plano', `${ESTUDIO} ${M_NOCHE} se detiene en seco.`, 'martin', '¿Y el cáncer? ¿Y los terremotos? ¿Y los inocentes que mueren antes de entender la palabra libertad?'),
        S('La pizarra', 'Plano medio', `${ESTUDIO} ${M_NOCHE} escribe con tiza en una pizarra tres palabras cortas; la pizarra se ve desenfocada y de lado.`),
        D('¿Por qué no lo impide?', 'Primer plano', `${ESTUDIO} ${M_NOCHE} junto a la pizarra.`, 'martin', 'Si Dios puede impedir todo sufrimiento, ¿por qué no lo impide?', FRIO, 6),
        V('Otros bienes', 'Plano medio', `${ESTUDIO} ${M_NOCHE} sostiene la tiza inmóvil.`, 'voz-interior', 'Quizá hacerlo destruiría otros bienes.', FRIO, 6),
        D('¿Qué bien exigía su muerte?', 'Primer plano', `${ESTUDIO} ${M_NOCHE}, en voz baja.`, 'martin', '¿Qué bien exigía la muerte de ella?', FRIO, 6),
        S('Cae la tiza', 'Plano detalle', `${ESTUDIO} la tiza cae de la mano de Martin y se rompe en el suelo de madera.`, FRIO, 4),
        D('Posible no es justo', 'Plano medio', `${ESTUDIO} ${M_NOCHE} se apoya en la mesa.`, 'martin', 'Demostrar que una tragedia es lógicamente posible no significa demostrar que es justa.'),
        D('Alguien al otro lado', 'Primer plano', `${ESTUDIO} ${M_NOCHE}, con los ojos húmedos.`, 'martin', 'No quiero ganar una discusión. Quiero saber si hay alguien al otro lado.'),
        D('Se acabó la teoría', 'Plano medio', `${ESTUDIO} ${M_NOCHE} cierra el cuaderno con decisión.`, 'martin', 'Se acabó la teoría.', FRIO, 4)
      ]
    },
    {
      title: 'Tres días', summary: 'Martin abandona los libros, prepara la mochila y parte hacia la montaña.',
      location: 'Apartamento y ciudad, amanecer', wardrobe: 'Chaqueta de montaña', cast: ['martin', 'narrador'],
      music: 'M04 «El último viaje»: pulso de percusión baja, cuerdas ascendentes y sintetizador oscuro.',
      musicPrompt: 'Original cinematic film score, a departure at dawn: low steady percussion pulse, rising strings, dark synthesizer pad, determined and melancholic. No vocals.',
      beats: [
        S('Los libros a la basura', 'Plano medio', `Al amanecer, ${M_CASA} mete libros en una caja de cartón y la deja junto a un contenedor de basura en una calle gris.`),
        S('La mochila', 'Planos detalle', 'Sobre una cama: ropa térmica, calcetines gruesos, un pequeño hornillo y un piolet usado entran uno a uno en una mochila de montaña. Luz fría del amanecer.'),
        V('Tres días', 'Primer plano', `${M_CASA} escribe en una hoja de papel con un bolígrafo, sentado a la mesa; la hoja se ve desenfocada.`, 'martin',
          'Tres días para una respuesta. Tres días para averiguar si el silencio es ausencia... o algo que todavía no comprendo.'),
        D('No sé si voy a encontrarte', 'Primer plano', `En el apartamento al amanecer, ${M_MONTE} mira una fotografía enmarcada de su esposa.`, 'martin', 'No sé si voy a encontrarte en algún lugar.', FRIO, 6),
        D('Un lugar donde buscar', 'Primer plano', `En el apartamento, ${M_MONTE} guarda la fotografía en la mochila.`, 'martin', 'Ni siquiera sé si existe un lugar donde buscar.', FRIO, 6),
        S('Las llaves en el buzón', 'Plano detalle', `En el portal de un edificio, la mano enguantada de Martin deja caer unas llaves en un buzón metálico.`, FRIO, 4),
        V('El autobús', 'Plano general', 'Un autobús se aleja de la ciudad por una carretera hacia montañas nevadas al amanecer.', 'narrador',
          'No llevaba una respuesta. Llevaba una acusación. Y una decisión peligrosa: permanecer en la montaña aunque el frío acabara con sus fuerzas.')
      ]
    },
    {
      title: 'La montaña no responde', summary: 'El ascenso: el cuerpo lucha por vivir mientras la mente duda de que vivir tenga sentido.',
      location: 'Pico del Silencio, día', wardrobe: 'Chaqueta de montaña', cast: ['martin'],
      music: 'M05 «El abismo blanco»: cuerdas tensas, graves profundos, viento espacial y percusión lenta.',
      musicPrompt: 'Original cinematic film score, vast frozen mountain: tense strings, deep low bass, spacious wind-like synth textures, slow heavy percussion. No vocals.',
      beats: [
        S('Océano de nubes', 'Plano aéreo', `Una montaña inmensa se levanta sobre un océano de nubes; una pequeña figura humana, ${MARTIN} con chaqueta azul oscuro, asciende por la ladera nevada.`, FRIO, 8),
        V('Todos hablan', 'Plano medio', `${M_MONTE} avanza con dificultad y clava el piolet en el hielo, respirando con esfuerzo.`, 'martin',
          'Kant decía que la razón tiene límites. Nietzsche atacaba las certezas heredadas. Sartre nos dejaba frente a nuestra libertad.'),
        D('Todos discuten', 'Primer plano', `En la ladera helada, ${M_MONTE} se detiene; el viento le golpea la cara.`, 'martin', 'Todos hablan... todos discuten... pero ninguno responde.'),
        S('La caída', 'Plano general', `En una pendiente helada, ${M_MONTE} resbala y se desliza; clava el piolet y frena la caída.`, FRIO, 6),
        D('Qué extraño', 'Primer plano', `Tendido en la nieve, ${M_MONTE} respira violentamente y mira hacia abajo.`, 'martin', 'Qué extraño...', FRIO, 4),
        D('Mi cuerpo lucha', 'Plano medio', `${M_MONTE} se incorpora con dificultad y observa su mano temblorosa.`, 'martin', 'Mi cuerpo lucha desesperadamente por vivir. Y yo me pregunto si vivir tiene sentido.'),
        D('¿Una máquina de razones?', 'Primer plano', `${M_MONTE} mira la inmensidad blanca.`, 'martin', '¿Es la conciencia una máquina que fabrica razones para soportar la existencia?'),
        D('¿O algo más?', 'Primer plano', `${M_MONTE}, en silencio ante el paisaje.`, 'martin', '¿O existe algo que nuestra inteligencia apenas puede comenzar a comprender?'),
        D('Si solo somos materia', 'Plano medio', `${M_MONTE} reanuda la marcha con rabia.`, 'martin', 'Si solo somos materia... ¿por qué nos duele tanto perder a otra materia?'),
        D('Un recuerdo destruye', 'Primer plano', `${M_MONTE}, jadeando.`, 'martin', '¿Por qué un recuerdo puede destruirnos más que una herida?', FRIO, 6),
        D('Una promesa de eternidad', 'Plano medio', `${M_MONTE} sube contra el viento creciente.`, 'martin', '¿Por qué una promesa de amor parece pedir eternidad, si el cuerpo que la pronuncia es mortal?'),
        S('Hacia la cumbre', 'Plano general', `${M_MONTE} continúa hacia la cumbre entre ráfagas de nieve.`, FRIO, 6)
      ]
    },
    {
      title: 'El hombre contra el cielo', summary: 'En la cumbre, Martin formula su acusación contra Dios.',
      location: 'Cumbre, tarde', wardrobe: 'Chaqueta de montaña', cast: ['martin'],
      music: 'M06 «Acusación»: cuerdas dramáticas, metales graves y golpes orquestales espaciados; se retira en las preguntas importantes.',
      musicPrompt: 'Original cinematic film score, dramatic accusation: dramatic strings, deep low brass, sparse orchestral hits separated by silence, restrained so dialogue stays clear. No vocals.',
      beats: [
        S('La cumbre', 'Plano general', `${CUMBRE} ${M_MONTE} llega a la cima y cae de rodillas en la nieve.`, FRIO, 6),
        D('Aquí estoy', 'Primer plano', `${CUMBRE} ${M_MONTE}, de rodillas, mira al cielo.`, 'martin', 'Aquí estoy.', FRIO, 4),
        D('Ningún lugar', 'Plano medio', `${CUMBRE} ${M_MONTE} se pone de pie.`, 'martin', 'He venido hasta aquí porque ya no encuentro un lugar donde hacer esta pregunta.'),
        D('Siglos de discusión', 'Plano medio', `${CUMBRE} ${M_MONTE} habla hacia el horizonte.`, 'martin', 'Durante siglos, los hombres han discutido tu existencia y han muerto defendiendo respuestas incompatibles.'),
        D('He venido por ella', 'Primer plano', `${CUMBRE} ${M_MONTE} señala el cielo; su voz tiembla.`, 'martin', 'Pero yo no he venido a defender una doctrina. He venido por ella.'),
        D('Tenía cuarenta años', 'Primer plano', `${CUMBRE} ${M_MONTE} saca una fotografía de su esposa y la observa.`, 'martin', 'Tenía cuarenta años. Cuarenta.', FRIO, 6),
        D('¿Qué amenaza?', 'Primer plano', `${CUMBRE} ${M_MONTE} levanta la mirada al cielo.`, 'martin', '¿Qué amenaza representaba para el universo una mujer que solo quería vivir?'),
        D('¿Qué necesidad?', 'Plano medio', `${CUMBRE} ${M_MONTE}; el viento silba.`, 'martin', '¿Qué necesidad había de su sufrimiento?', FRIO, 6),
        D('El precio de existir', 'Primer plano', `${CUMBRE} ${M_MONTE}, con dolor.`, 'martin', 'Si la muerte es el precio de existir...', FRIO, 4),
        D('La capacidad de amar', 'Primer plano', `${CUMBRE} ${M_MONTE} aprieta la fotografía contra el pecho.`, 'martin', '¿por qué nos das la capacidad de amar como si pudiéramos conservar lo amado?'),
        D('Quizá no existes', 'Plano medio', `${CUMBRE} ${M_MONTE} se acerca a una zona rocosa, de pie y firme.`, 'martin', 'Quizá no existes. Quizá no hay propósito, ni juez, ni respuesta.'),
        D('Pero si existes', 'Primer plano a los ojos', `${CUMBRE} ${M_MONTE} mira las nubes; la cámara se acerca a sus ojos.`, 'martin', 'Pero si existes...', FRIO, 4),
        D('No puedes pedir', 'Primer plano', `${CUMBRE} ${M_MONTE} grita al cielo; un trueno lejano.`, 'martin', '¡No puedes pedirle a la humanidad que llame bondad a lo que no comprende!'),
        D('Confianza sin preguntas', 'Plano medio', `${CUMBRE} ${M_MONTE}, furioso.`, 'martin', '¡No puedes exigir confianza sin permitir preguntas!', FRIO, 6),
        D('¿Dónde estabas?', 'Primer plano', `${CUMBRE} ${M_MONTE}, con la voz quebrada.`, 'martin', '¿Dónde estabas cuando ella tenía miedo? ¿Cuando me preguntó si iba a morir?'),
        D('Yo estaba allí', 'Plano medio', `${CUMBRE} ${M_MONTE} cae de rodillas en la nieve.`, 'martin', 'Yo estaba allí. Yo le sostuve la mano. Yo escuché su respiración.'),
        D('¿Y tú?', 'Primer plano', `${CUMBRE} ${M_MONTE} levanta la cabeza hacia el cielo.`, 'martin', '¿Y tú?', FRIO, 4),
        D('Silencio', 'Plano general', `${CUMBRE} el viento se detiene; ${M_MONTE} espera inmóvil y susurra.`, 'martin', 'Silencio.', FRIO, 6)
      ]
    },
    {
      title: 'La última discusión', summary: 'Agotado por el frío, Martin discute por última vez con su voz interior.',
      location: 'Cumbre, atardecer', wardrobe: 'Chaqueta de montaña con escarcha', cast: ['martin', 'voz-interior'],
      music: 'M07 «Fe contra razón»: piano de notas repetidas, sintetizadores en tensión creciente y cuerdas en registro alto.',
      musicPrompt: 'Original cinematic film score, inner conflict: repeated piano notes, synthesizers with growing tension, high register strings, introspective and uneasy. No vocals.',
      beats: [
        S('Sobre la roca', 'Plano general', `${CUMBRE} al atardecer, ${M_MONTE} está sentado sobre una roca, con escarcha en la barba, temblando de frío.`),
        V('No te debe una explicación', 'Primer plano', `${CUMBRE} ${M_MONTE} mira al vacío, inmóvil.`, 'voz-interior', '¿Y si Dios no te debe una explicación?', FRIO, 6),
        D('Una mente capaz', 'Primer plano', `${CUMBRE} ${M_MONTE}, con la voz cansada.`, 'martin', 'Entonces, ¿por qué me dio una mente capaz de exigirla?', FRIO, 6),
        V('Necesidad de consuelo', 'Plano medio', `${CUMBRE} ${M_MONTE} cierra los ojos.`, 'voz-interior', 'Quizá estás confundiendo la verdad con tu necesidad de consuelo.', FRIO, 6),
        D('Lo que temo', 'Primer plano', `${CUMBRE} ${M_MONTE} abre los ojos.`, 'martin', 'Eso es precisamente lo que temo.', FRIO, 4),
        V('Tu dolor distorsiona', 'Plano medio', `${CUMBRE} ${M_MONTE} permanece en silencio.`, 'voz-interior', '¿Y si tu dolor está distorsionando tu juicio?', FRIO, 6),
        D('Es posible', 'Primer plano', `${CUMBRE} ${M_MONTE} respira lentamente.`, 'martin', 'Es posible. Pero que un hombre sufra no convierte sus preguntas en falsas.'),
        V('Sin obligación de ser justo', 'Plano general', `${CUMBRE} ${M_MONTE} pequeño ante el cielo del atardecer.`, 'voz-interior', '¿Y si el universo no tiene obligación de ser justo?', FRIO, 6),
        D('Una aspiración humana', 'Primer plano', `${CUMBRE} ${M_MONTE}, sereno y triste.`, 'martin', 'Entonces la justicia es una aspiración humana frente a una realidad indiferente.'),
        V('¿Y si eso es todo?', 'Plano detalle', `${CUMBRE} las manos enguantadas de Martin sostienen la fotografía de su esposa.`, 'voz-interior', '¿Y si eso es todo?', FRIO, 4),
        D('Amar sin garantías', 'Primer plano', `${CUMBRE} ${M_MONTE} mira la fotografía.`, 'martin', 'Entonces tendremos que aprender a amar sin garantías.', FRIO, 6),
        V('La respuesta que no deseas', 'Plano medio', `${CUMBRE} ${M_MONTE} levanta lentamente el rostro.`, 'voz-interior', '¿Y si la respuesta existe, pero no es la que deseas escuchar?', FRIO, 6),
        D('Quiero escucharla', 'Primer plano', `${CUMBRE} ${M_MONTE} se incorpora.`, 'martin', 'Entonces quiero escucharla de todos modos. No quiero una mentira agradable.'),
        D('Una respuesta que resista', 'Travelling circular', `${CUMBRE} ${M_MONTE} de pie mientras el cielo se oscurece.`, 'martin', 'Quiero una respuesta que resista la razón y que no humille el dolor de los inocentes.'),
        D('Aunque destruya mis certezas', 'Primer plano', `${CUMBRE} ${M_MONTE}; el cielo se vuelve negro de tormenta.`, 'martin', 'Aunque esa respuesta destruya todas mis certezas.', FRIO, 6)
      ]
    },
    {
      title: 'La citación', summary: 'En plena tormenta, Martin convoca a Dios y exige una respuesta hasta quedarse sin fuerzas.',
      location: 'Cumbre, tormenta', wardrobe: 'Chaqueta de montaña cubierta de nieve', cast: ['martin'],
      music: 'M08 «El desafío»: percusión orquestal intensa, subgraves y cuerdas ascendentes; clímax progresivo y silencio abrupto.',
      musicPrompt: 'Original cinematic film score, storm climax: intense orchestral percussion, sub bass, rising strings building to a powerful climax. No vocals.',
      beats: [
        D('¡Te convoco!', 'Plano general', `${CUMBRE} en plena tormenta de nieve, ${M_MONTE} extiende los brazos hacia el cielo y grita.`, 'martin', '¡Te convoco! ¡Si existes, responde!'),
        D('Señales ambiguas', 'Plano medio', `${CUMBRE} la nieve se eleva con el viento alrededor de ${M_MONTE}.`, 'martin', '¡No quiero señales ambiguas! ¡No quiero un fenómeno natural presentado como milagro!'),
        D('¡Quiero saber!', 'Primer plano', `${CUMBRE} el viento golpea el rostro de ${M_MONTE}.`, 'martin', '¡Quiero saber!', FRIO, 4),
        D('Una verdad', 'Plano medio', `${CUMBRE} ${M_MONTE} cae de rodillas en la tormenta.`, 'martin', '¿Existe una verdad que no dependa de nuestros deseos?', FRIO, 6),
        D('Bondad detrás del dolor', 'Primer plano', `${CUMBRE} ${M_MONTE}, de rodillas, con nieve en la barba.`, 'martin', '¿Puede haber bondad detrás de un universo que permite tanto dolor?', FRIO, 6),
        D('¿Accidentes?', 'Primer plano', `${CUMBRE} un relámpago ilumina las nubes detrás de ${M_MONTE}.`, 'martin', '¿Tiene sentido la existencia... o somos accidentes capaces de formular preguntas?'),
        D('He venido a pedir', 'Plano general', `${CUMBRE} ${M_MONTE} grita al cielo entre relámpagos.`, 'martin', '¡He venido a pedir una respuesta!', FRIO, 6),
        D('No me moveré', 'Primer plano', `${CUMBRE} ${M_MONTE} pierde fuerzas, con escarcha en el rostro; habla casi sin voz.`, 'martin', 'No me moveré... Responde...', FRIO, 6)
      ]
    },
    {
      title: 'Petición cursada', summary: 'El mundo se detiene. Una voz desconocida responde y la montaña empieza a desaparecer.',
      location: 'Cumbre, crepúsculo', wardrobe: 'Chaqueta de montaña', cast: ['martin', 'voz-desconocida'],
      music: 'M09 «La respuesta imposible»: drone subgrave, resonancias metálicas, coro sin palabras y pulsos de frecuencia descendente.',
      musicPrompt: 'Original cinematic film score, metaphysical mystery: deep sub drone, metallic resonances, wordless ethereal choir pads, descending pulses, immense and eerie.',
      beats: [
        S('La nieve suspendida', 'Plano medio lento', `${CUMBRE} el viento desaparece; los cristales de nieve quedan suspendidos inmóviles en el aire alrededor de ${M_MONTE}, que abre los ojos.`, FRIO, 6),
        V('Petición...', 'Plano general', `${CUMBRE} una vibración recorre la montaña; la nieve tiembla bajo ${M_MONTE}.`, 'voz-desconocida', 'Petición...', FRIO, 6),
        V('Cursada...', 'Primer plano', `${CUMBRE} ${M_MONTE} queda paralizado, con los ojos muy abiertos.`, 'voz-desconocida', 'Cursada...', FRIO, 4),
        D('¿Quién ha hablado?', 'Primer plano', `${CUMBRE} ${M_MONTE} mira alrededor, asustado.`, 'martin', '¿Quién ha hablado?', FRIO, 4),
        D('¡Muéstrate!', 'Plano medio', `${CUMBRE} el horizonte detrás de ${M_MONTE} se deforma como una ondulación de calor.`, 'martin', '¡Muéstrate!', FRIO, 4),
        S('El cielo se vuelve negro', 'Plano general', `${CUMBRE} la nieve pierde su textura y el cielo se convierte lentamente en una profundidad negra infinita alrededor de ${M_MONTE}.`, FINAL, 6),
        D('¿Qué está pasando?', 'Primer plano', `${M_MONTE} respira aceleradamente mientras la montaña se desvanece a su alrededor.`, 'martin', 'No... ¿Qué está pasando?', FINAL, 6),
        V('Petición cursada', 'Plano medio', `${M_MONTE} intenta moverse pero su cuerpo no responde; todo a su alrededor se vuelve oscuridad.`, 'voz-desconocida', 'Petición cursada.', FINAL, 6),
        D('¿Qué he hecho?', 'Primer plano con acercamiento rápido', `${M_MONTE}, aterrorizado, en medio de la oscuridad.`, 'martin', '¿Qué he hecho?', FINAL, 4)
      ]
    },
    {
      title: 'El universo ha respondido', summary: 'Martin cae a través de una profundidad infinita; a lo lejos aparece una luz dorada.',
      location: 'Transición metafísica', wardrobe: 'Chaqueta de montaña', cast: ['martin', 'narrador'],
      music: 'M10 «El umbral»: impacto orquestal profundo, coro etéreo y una nota sostenida que termina en silencio absoluto.',
      musicPrompt: 'Original cinematic film score, threshold: deep orchestral impact, ethereal wordless choir, one long sustained note fading into silence.',
      beats: [
        V('La caída infinita', 'Plano general', `${M_MONTE} cae lentamente a través de una oscuridad infinita, rodeado de copos de nieve que se transforman en partículas negras; su rostro expresa terror.`, 'narrador',
          'Había exigido una respuesta.', FINAL, 6),
        V('La luz dorada', 'Plano general', 'En medio de una oscuridad absoluta aparece a lo lejos una luz dorada cálida que crece lentamente.', 'narrador',
          'Y ahora temía haberla recibido.', FINAL, 6)
      ]
    }
  ]
};

export function createEpisodio1Bundle(now?: string) { return buildShortFilmBundle(EPISODIO_1_SPEC, now); }
export function getEpisodio1Stats() { return shortFilmStats(EPISODIO_1_SPEC); }
