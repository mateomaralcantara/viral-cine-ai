/**
 * «LOS CONVIDADOS AL ÁGAPE» — tráiler de libro de 3 minutos (Martin Mateo).
 * 22 tomas × 8 s = 2:56 de video + 4 s de cierre con portada y pregunta en posproducción.
 *
 * Reglas: todo en español; Martin descrito siempre igual (como en la portada);
 * diálogos en voz (planos de espalda/perfil, bocas cerradas); sin violencia
 * explícita ni rostros de niños; textos en pantalla solo en posproducción.
 */
import { buildShortFilmBundle, shortFilmStats, type ShortFilmSpec } from '@/lib/v7/presets/short-film-builder';

export const CONVIDADOS_ID = 'film-los-convidados-al-agape-v7';

const MARTIN = 'Martin, un hombre de cuarenta y tantos años, de piel morena clara, con el pelo oscuro ondulado hasta los hombros y una barba oscura poblada con algunas canas, de mirada intensa y cansada';
const MARTIN_CASA = MARTIN + ', con un suéter gris oscuro';
const MARTIN_MONTANA = MARTIN + ', con una chaqueta de invierno gris oscuro y una mochila';
const MARTIN_AGAPE = MARTIN + ', vestido con una túnica color crema y un manto de terciopelo rojo';
const MARTIN_CIUDAD = MARTIN + ', con un abrigo oscuro sencillo';
const HERALDO = 'el Heraldo, una figura alta y serena con una túnica blanca bordada en oro, de rostro sereno parcialmente iluminado';
const FISCAL = 'el Fiscal, un hombre elegante de unos cincuenta años con un traje negro impecable, el pelo negro peinado hacia atrás y la mirada fría';
const SALON = 'un inmenso salón de mármol negro con columnas monumentales y una mesa interminable iluminada por luz dorada volumétrica';
const PENSADORES = 'pensadores de distintas épocas: ancianos con túnicas griegas, monjes con hábitos medievales y caballeros con levitas de los siglos dieciocho y veinte';
const ESTILO = 'Cine épico de Hollywood, fotografía hiperrealista, iluminación volumétrica, atmósfera emocional, formato 16:9. Sonido ambiente natural; si se oye alguna voz de fondo, es en español. Sin subtítulos ni texto en pantalla.';

export const CONVIDADOS_SPEC: ShortFilmSpec = {
  id: CONVIDADOS_ID,
  title: 'LOS CONVIDADOS AL ÁGAPE',
  premise: 'Tras perder a su esposa por un cáncer, Martin, profesor de filosofía, sube al Pico del Silencio para exigirle respuestas a Dios. ' +
    'Es convocado al Ágape, un banquete-juicio con los grandes pensadores de la historia y un Fiscal que acusa a Dios. ' +
    'Tras tres días de debate sobre la mente, el corazón y el espíritu, Martin acepta la invitación a vivir. Tráiler de 3 minutos del libro de Martin Mateo.',
  genre: 'Drama filosófico, misterio sobrenatural',
  audience: 'Público adulto',
  visualStyle: 'Cine épico de Hollywood, hiperrealista, luz dorada volumétrica en el Ágape y azules fríos en el mundo real',
  continuityNotes: ['Diálogos en voz: nadie mueve los labios', 'Sin violencia explícita ni rostros de niños', 'Título, portada y textos en posproducción'],
  metadata: { book: 'Los convidados al Ágape — El banquete de los filósofos', author: 'Martin Mateo', format: 'book-trailer',
    closingCard: '¿Si pudieras votar a favor o en contra de haber existido, cuál sería tu voto?' },
  characters: [
    { key: 'narrador', name: 'Narrador', age: 55, role: 'Narrador del tráiler', appearance: 'Voz en off, sin imagen', voice: 'Voz masculina profunda, pausada y cinematográfica.' },
    { key: 'martin', name: 'Martin', age: 45, role: 'Protagonista, profesor de filosofía', appearance: MARTIN, voice: 'Voz masculina cálida y quebrada por el duelo, que se vuelve firme.' },
    { key: 'heraldo', name: 'El Heraldo', age: 60, role: 'Anfitrión del Ágape', appearance: HERALDO, voice: 'Voz serena, solemne y amable.' },
    { key: 'fiscal', name: 'El Fiscal', age: 50, role: 'Acusador de Dios', appearance: FISCAL, voice: 'Voz fría, elegante y cortante.' },
    { key: 'esposa', name: 'La esposa de Martin', age: 42, role: 'Recuerdo', appearance: 'Mujer de unos cuarenta años, de pelo castaño', voice: 'Sin diálogo.' }
  ],
  scenes: [
    {
      title: 'El dolor que desafió al universo', summary: 'Martin pierde a su esposa por un cáncer y decide subir al Pico del Silencio para exigirle respuestas a Dios.',
      location: 'Hospital de noche, apartamento vacío, estudio con libros, calle al amanecer', wardrobe: 'Martin suéter gris; chaqueta de invierno al salir',
      cast: ['martin', 'esposa', 'narrador'],
      beats: [
        { title: 'Manos unidas en el hospital', camera: 'Primer plano',
          prompt: `Primer plano en una habitación de hospital de noche, iluminada por la luz verdosa de un monitor cardíaco: la mano de un hombre sostiene con fuerza la mano frágil de una mujer acostada en la cama. Lágrimas caen sobre las sábanas blancas. ${ESTILO}`,
          line: 'Martin tenía cuarenta y dos años cuando perdió a la mujer con quien había compartido veintidós años de su vida.', voice: 'narrador' },
        { title: 'Martin llora junto a la cama', camera: 'Primer plano',
          prompt: `Primer plano de ${MARTIN_CASA}, sentado junto a una cama de hospital, con lágrimas en el rostro, iluminado por la luz tenue del monitor. Su boca permanece cerrada. ${ESTILO}`,
          line: 'Habían construido una historia entre sacrificios, reconciliaciones y sueños. Pero el cáncer terminó con todo.', voice: 'narrador' },
        { title: 'El apartamento vacío', camera: 'Plano fijo',
          prompt: `Un apartamento vacío al amanecer: dos tazas de café sobre una mesa de madera y una fotografía enmarcada de una pareja el día de su boda. Motas de polvo flotan en un rayo de luz. No hay nadie en la habitación. ${ESTILO}`,
          line: 'Y nació una pregunta que ningún libro y ningún filósofo había conseguido responderle.', voice: 'narrador' },
        { title: 'Los libros ya no responden', camera: 'Plano medio',
          prompt: `De noche, ${MARTIN_CASA} está sentado ante un escritorio lleno de libros de filosofía abiertos; cierra uno lentamente y mira por la ventana hacia la oscuridad. Luz de una sola lámpara. ${ESTILO}`,
          line: '¿Por qué un Dios bueno permitiría tanto sufrimiento?', voice: 'narrador' },
        { title: 'Parte hacia la montaña', camera: 'Plano general',
          prompt: `Plano general al amanecer: ${MARTIN_MONTANA} sale de un edificio y camina por una calle vacía hacia unas montañas nevadas en el horizonte. Luz azul fría. ${ESTILO}`,
          line: 'Una madrugada tomó una decisión desesperada: subiría al Pico del Silencio para exigirle respuestas a Dios.', voice: 'narrador' }
      ]
    },
    {
      title: 'La convocatoria', summary: 'En la cima, Martin convoca a Dios; una tormenta sobrenatural lo lleva al Ágape, donde lo recibe el Heraldo.',
      location: 'Montaña nevada, cima en tormenta, salón de mármol negro', wardrobe: 'Martin chaqueta de invierno y mochila',
      cast: ['martin', 'heraldo', 'narrador'],
      beats: [
        { title: 'Ascenso en la nieve', camera: 'Plano general épico',
          prompt: `${MARTIN_MONTANA} asciende con esfuerzo por una ladera nevada mientras el viento le golpea el rostro y levanta la nieve. Plano general épico, luz azulada. ${ESTILO}`,
          line: 'Si Dios existía, tendría que responder.', voice: 'narrador' },
        { title: 'De rodillas en la cima', camera: 'Plano general desde atrás',
          prompt: `Plano general desde atrás: ${MARTIN_MONTANA} llega a la cima de la montaña y cae de rodillas en la nieve, con los brazos abiertos hacia un cielo tormentoso. ${ESTILO}`,
          line: '¡Te convoco! ¡Si existes, responde! ¡No quiero consuelos! ¡Exijo la verdad!', voice: 'martin' },
        { title: 'La tormenta se vuelve luz', camera: 'Plano general',
          prompt: `La tormenta se arremolina alrededor de la cima nevada y se transforma en un torbellino de luz dorada; los copos de nieve se convierten en partículas luminosas que flotan. Efecto sobrenatural elegante. ${ESTILO}`,
          line: 'Y la montaña respondió.', voice: 'narrador' },
        { title: 'El salón del Ágape', camera: 'Travelling hacia adelante',
          prompt: `Travelling lento hacia adelante por ${SALON}. Al fondo, ${HERALDO} espera de pie, inmóvil. Su boca permanece cerrada. ${ESTILO}`,
          line: 'Bienvenido al Ágape, Martin. Has convocado a todos aquellos que han intentado responder tu pregunta.', voice: 'heraldo' }
      ]
    },
    {
      title: 'Los tres días del juicio', summary: 'Llegan los grandes pensadores y el Fiscal; durante tres días debaten la mente, el corazón y el espíritu.',
      location: 'Salón de mármol negro del Ágape', wardrobe: 'Martin túnica crema y manto rojo; Fiscal traje negro',
      cast: ['martin', 'fiscal', 'narrador'],
      beats: [
        { title: 'Entran los pensadores', camera: 'Plano general a contraluz',
          prompt: `Unos portones monumentales de bronce se abren lentamente y entran en procesión solemne ${PENSADORES}. Luz dorada a contraluz, polvo en suspensión. ${ESTILO}`,
          line: 'Sócrates. Platón. Aristóteles. Agustín. Tomás de Aquino. Descartes. Kant. Nietzsche. Pascal.', voice: 'narrador' },
        { title: 'Llega el Fiscal', camera: 'Plano medio con luz lateral',
          prompt: `En el otro extremo del salón de mármol aparece ${FISCAL}, que camina despacio hacia la mesa con las manos a la espalda. Iluminación lateral dura y sombras profundas. Su boca permanece cerrada. ${ESTILO}`,
          line: 'Pero también llegó un invitado inesperado. El Fiscal. La acusación contra Dios.', voice: 'narrador' },
        { title: 'Martin preside el banquete', camera: 'Movimiento en arco lento',
          prompt: `${MARTIN_AGAPE} preside la cabecera de una larga mesa de mármol con copas de cristal, jarras de agua y libros antiguos, rodeado de ${PENSADORES} que debaten con gestos intensos. Luz dorada, cámara lenta en arco. ${ESTILO}`,
          line: 'Durante tres jornadas, la humanidad entera pareció reunirse alrededor de una mesa. La mente. El corazón. El espíritu.', voice: 'narrador' },
        { title: 'La copa se rompe', camera: 'Primer plano en cámara lenta',
          prompt: `Primer plano en cámara lenta: una copa de cristal cae sobre la mesa de mármol negro y se rompe en mil fragmentos que brillan con la luz dorada. ${ESTILO}`,
          line: 'Tu cerebro no fue creado para encontrar la verdad, Martin. Fue creado para sobrevivir.', voice: 'fiscal' },
        { title: 'Martin sin palabras', camera: 'Primer plano',
          prompt: `Primer plano de ${MARTIN_AGAPE}, en silencio, con la mirada perdida y los ojos húmedos, mientras a su alrededor los pensadores discuten desenfocados. Su boca permanece cerrada. ${ESTILO}`,
          line: '¿Dónde está Dios cuando más se le necesita?', voice: 'fiscal' }
      ]
    },
    {
      title: 'La acusación final', summary: 'El Fiscal muestra el sufrimiento de la historia; llegan las víctimas; Martin decide que volvería a elegir el amor.',
      location: 'Coliseo de pantallas, recuerdo de la boda', wardrobe: 'Martin túnica crema y manto rojo',
      cast: ['martin', 'fiscal', 'esposa', 'narrador'],
      beats: [
        { title: 'El coliseo de pantallas', camera: 'Plano general',
          prompt: `Un coliseo inmenso formado por pantallas gigantes que muestran imágenes desenfocadas de humo, ciudades en ruinas y multitudes que caminan, sin violencia explícita. ${MARTIN_AGAPE} está de pie en el centro, pequeño ante las imágenes. ${ESTILO}`,
          line: '¡Mira la historia! ¡Mira a los inocentes! ¿Todavía puedes defender a un Dios de amor?', voice: 'fiscal' },
        { title: 'Llegan los que sufrieron', camera: 'Plano general solemne',
          prompt: `Hombres y mujeres adultos de distintas épocas aparecen en silencio entre una luz suave y se detienen frente a Martin, con miradas serenas y dignas. Atmósfera solemne, sin violencia. ${ESTILO}`,
          line: 'Las víctimas no llegaron con argumentos. Llegaron con sus heridas… y con su capacidad de perdonar.', voice: 'narrador' },
        { title: 'El recuerdo de la boda', camera: 'Plano medio, fundido',
          prompt: `Un recuerdo cálido y luminoso: una pareja joven baila en su boda bajo luces colgantes; la imagen se desvanece suavemente hacia la luz blanca de una habitación de hospital. ${ESTILO}`,
          line: 'Si hubieras sabido que moriría de cáncer… ¿habrías elegido casarte con ella?', voice: 'fiscal' },
        { title: 'Volvería a elegirla', camera: 'Primer plano de perfil',
          prompt: `Primer plano de perfil de ${MARTIN_AGAPE}, que cierra los ojos y levanta lentamente la cabeza; una lágrima cae, pero su rostro se serena. Luz dorada. Su boca permanece cerrada. ${ESTILO}`,
          line: 'Sí. Sabiendo cómo terminaría, volvería a elegirla. Su muerte no convierte nuestro amor en un error.', voice: 'martin' }
      ]
    },
    {
      title: 'La invitación', summary: 'Martin acepta la invitación, despierta en la nieve y regresa a la ciudad decidido a vivir y a amar.',
      location: 'Salón que se transforma, cima nevada al amanecer, parque de la ciudad', wardrobe: 'Martin túnica y manto; luego chaqueta de invierno y abrigo',
      cast: ['martin', 'fiscal', 'narrador'],
      beats: [
        { title: 'La última copa', camera: 'Plano medio',
          prompt: `El gran salón de mármol se transforma lentamente en una sala cálida de madera iluminada por velas; ${MARTIN_AGAPE} sostiene una copa de vino ante una mesa sencilla, rodeado de invitados en silencio. Su boca permanece cerrada. ${ESTILO}`,
          line: 'No puedo comprenderlo todo. Mi veredicto es más pequeño. Acepto la invitación.', voice: 'martin' },
        { title: 'La luz blanca', camera: 'Plano medio',
          prompt: `${MARTIN_AGAPE} bebe de la copa; una luz blanca intensa llena el salón y las figuras a su alrededor se disuelven en partículas luminosas. ${ESTILO}`,
          line: '¿Y si después de todo esto no hay nadie al otro lado?', voice: 'fiscal' },
        { title: 'Despierta en la nieve', camera: 'Plano general',
          prompt: `Al amanecer, ${MARTIN_MONTANA} despierta tendido sobre la nieve, respira hondo y se incorpora lentamente; a lo lejos se ve una pequeña cabaña con humo saliendo de la chimenea. Luz cálida del sol. ${ESTILO}`,
          line: 'Entonces todavía habré amado.', voice: 'martin' },
        { title: 'La manzana compartida', camera: 'Plano medio',
          prompt: `En un parque de la ciudad bajo una cálida luz de tarde, ${MARTIN_CIUDAD} se sienta en un banco y comparte una manzana con un hombre mayor de aspecto humilde; ambos sonríen con la boca cerrada. ${ESTILO}`,
          line: 'La respuesta no era una frase. Era una invitación. A vivir, a amar… y a existir.', voice: 'narrador' }
      ]
    }
  ]
};

export function createConvidadosBundle(now?: string) { return buildShortFilmBundle(CONVIDADOS_SPEC, now); }
export function getConvidadosStats() { return shortFilmStats(CONVIDADOS_SPEC); }
