/**
 * Reparto oficial de la serie «Los convidados al Ágape» (hoja de personajes del autor).
 * box = recorte del retrato en la hoja, en fracciones (x, y, ancho, alto) para que
 * funcione con cualquier resolución de la misma hoja (original 1672×941).
 */
export type CastMember = { key: string; nombre: string; rol: string; descripcion: string; box: [number, number, number, number] };

const W = 1672, H = 941;
const px = (x: number, y: number, w: number, h: number): CastMember['box'] => [x / W, y / H, w / W, h / H];
const R1 = (i: number) => { const c = [[6, 241], [249, 490], [499, 733], [741, 972], [981, 1219]][i]; return px(c[0], 8, c[1] - c[0], 245); };
const COLS = [[4, 188], [194, 377], [384, 563], [569, 749], [756, 935], [941, 1119], [1127, 1306], [1313, 1491], [1498, 1670]];
const R2 = (i: number) => px(COLS[i][0], 394, COLS[i][1] - COLS[i][0], 152);
const R3 = (i: number) => px(COLS[i][0], 666, COLS[i][1] - COLS[i][0], 135);

export const CONVIDADOS_SERIE = 'los-convidados-al-agape';

export const CONVIDADOS_REPARTO: CastMember[] = [
  { key: 'martin', nombre: 'Martin Mateo', rol: 'Protagonista. Filósofo, racional y sensible; busca una respuesta al sufrimiento y al sentido de la existencia.',
    descripcion: 'hombre de unos cuarenta y dos años, piel morena clara, pelo oscuro ondulado hasta los hombros con algunas canas, barba poblada entrecana, cejas marcadas y mirada intensa y cansada', box: R1(0) },
  { key: 'esposa', nombre: 'Esposa de Martin', rol: 'Compañera de vida. Amor profundo; su pérdida es el origen del conflicto.',
    descripcion: 'mujer de unos cuarenta años, pelo castaño ondulado a la altura de los hombros, rostro dulce y sereno, ojos claros, sonrisa suave', box: R1(1) },
  { key: 'heraldo', nombre: 'El Heraldo', rol: 'Mensajero del Ágape. Convoca a los invitados al tribunal; sereno, de autoridad trascendente.',
    descripcion: 'figura alta envuelta en una capa con capucha blanca y dorada que irradia luz; el interior de la capucha es oscuridad total y no se ve ningún rostro; un broche dorado en el pecho', box: R1(2) },
  { key: 'fiscal', nombre: 'El Fiscal', rol: 'Acusador. Representa la objeción más dura contra la existencia de Dios.',
    descripcion: 'hombre elegante de unos cincuenta años, pelo negro peinado hacia atrás, mandíbula marcada, mirada fría y penetrante, levita negra con chaleco y manto rojo oscuro bordado', box: R1(3) },
  { key: 'dios', nombre: 'Dios', rol: 'El Interlocutor Final. No una figura dogmática, sino la presencia que responde con sabiduría, profundidad y amor.',
    descripcion: 'anciano majestuoso de cabello y barba largos, blancos y ondulados, envuelto en una luz dorada cálida, túnica blanca, mirada serena, sabia y compasiva', box: R1(4) },
  { key: 'socrates', nombre: 'Sócrates', rol: 'Pensador griego. Defiende el valor de la pregunta y la virtud.',
    descripcion: 'anciano griego calvo de barba blanca abundante y rizada, nariz ancha, túnica griega color crema', box: R2(0) },
  { key: 'platon', nombre: 'Platón', rol: 'Filósofo griego. Sostiene la realidad de las ideas y un orden superior.',
    descripcion: 'anciano griego de pelo largo y canoso y barba blanca larga, túnica griega con manto rojizo', box: R2(1) },
  { key: 'aristoteles', nombre: 'Aristóteles', rol: 'Filósofo griego. Explica el mundo por causas, fines y orden natural.',
    descripcion: 'hombre griego de mediana edad, pelo castaño rizado y corto, barba corta, túnica griega clara', box: R2(2) },
  { key: 'agustin', nombre: 'San Agustín', rol: 'Obispo y filósofo. Testigo del corazón inquieto que busca a Dios.',
    descripcion: 'anciano de barba gris con mitra episcopal dorada y casulla roja con bordados dorados', box: R2(3) },
  { key: 'tomas', nombre: 'Tomás de Aquino', rol: 'Teólogo y filósofo. Integra la razón y la fe en una visión del ser.',
    descripcion: 'hombre robusto de unos cuarenta y cinco años, tonsura de fraile, pelo oscuro corto, hábito dominico negro y blanco', box: R2(4) },
  { key: 'descartes', nombre: 'Descartes', rol: 'Filósofo francés. Fundamenta la certeza del conocimiento.',
    descripcion: 'hombre del siglo diecisiete de pelo negro largo y ondulado, bigote fino, cuello blanco de encaje sobre ropa oscura', box: R2(5) },
  { key: 'hume', nombre: 'Hume', rol: 'Filósofo escocés. Cuestiona la causalidad y la idea de Dios.',
    descripcion: 'hombre corpulento del siglo dieciocho con peluca blanca empolvada, rostro redondo, casaca roja y pañuelo blanco al cuello', box: R2(6) },
  { key: 'kant', nombre: 'Kant', rol: 'Filósofo alemán. Explora los límites de la razón y la moral.',
    descripcion: 'hombre delgado del siglo dieciocho con peluca gris recogida, rostro anguloso y serio, casaca oscura y pañuelo blanco', box: R2(7) },
  { key: 'nietzsche', nombre: 'Nietzsche', rol: 'Filósofo alemán. Cuestiona la moral tradicional y la idea de Dios.',
    descripcion: 'hombre de unos cuarenta años con pelo castaño peinado hacia atrás y un enorme bigote espeso, traje oscuro del siglo diecinueve con pajarita', box: R2(8) },
  { key: 'pascal', nombre: 'Pascal', rol: 'Pensador francés. Propone la famosa apuesta sobre la existencia de Dios.',
    descripcion: 'hombre joven del siglo diecisiete con pelo castaño largo y ondulado, rostro fino, cuello blanco sobre ropa oscura', box: R3(0) },
  { key: 'lewis', nombre: 'C. S. Lewis', rol: 'Escritor y pensador. Defiende el amor como argumento del sentido.',
    descripcion: 'hombre de unos cincuenta años, calvo en la frente con pelo oscuro corto, rostro redondo, traje de tweed marrón', box: R3(1) },
  { key: 'lemaitre', nombre: 'Georges Lemaître', rol: 'Astrónomo y sacerdote. Propone el origen del universo y la relación entre ciencia y fe.',
    descripcion: 'sacerdote de unos cuarenta años, pelo negro peinado hacia atrás, gafas redondas, sotana negra con alzacuellos blanco', box: R3(2) },
  { key: 'darwin', nombre: 'Darwin', rol: 'Naturalista inglés. Representa la evolución y el desafío de un diseño en la naturaleza.',
    descripcion: 'anciano calvo con larga barba blanca y cejas pobladas, abrigo oscuro victoriano', box: R3(3) },
  { key: 'einstein', nombre: 'Einstein', rol: 'Físico teórico. Introduce el misterio y los límites de la ciencia.',
    descripcion: 'anciano de pelo blanco alborotado, bigote blanco espeso, ojos amables, chaqueta de lana oscura', box: R3(4) },
  { key: 'dostoievski', nombre: 'Dostoievski', rol: 'Novelista y pensador. Explora el sufrimiento, la libertad y la redención.',
    descripcion: 'hombre de unos cincuenta años con frente amplia, barba castaña larga y poblada, mirada intensa, abrigo oscuro', box: R3(5) },
  { key: 'leibniz', nombre: 'Leibniz', rol: 'Filósofo alemán. Defiende un orden racional y el mejor de los mundos posibles.',
    descripcion: 'hombre del siglo diecisiete con una gran peluca negra de rizos largos, rostro fino, pañuelo blanco al cuello', box: R3(6) },
  { key: 'camus', nombre: 'Camus', rol: 'Filósofo francés. Enfrenta el absurdo y la posibilidad del sentido.',
    descripcion: 'hombre de unos cuarenta años, pelo oscuro peinado hacia atrás, rostro anguloso, gabardina marrón con el cuello levantado', box: R3(7) },
  { key: 'sartre', nombre: 'Sartre', rol: 'Filósofo francés. Sostiene la libertad radical y la responsabilidad existencial.',
    descripcion: 'hombre de unos sesenta años con gafas redondas de pasta gruesa, pelo gris peinado hacia atrás, pipa en la boca, chaqueta de tweed', box: R3(8) }
];

/** Decorados fijos de la serie (plano maestro con «npm run decorado»): misma geometría en todas las tomas. */
export const CONVIDADOS_DECORADOS = [
  {
    key: 'salon-del-agape', nombre: 'Salón del Ágape',
    descripcion: 'Salón monumental con dos filas de columnas gigantescas de piedra caliza clara y bóvedas altísimas que se pierden en la sombra. ' +
      'Suelo de mármol negro pulido como un espejo. Luz dorada cálida que no sale de ninguna lámpara visible. ' +
      'En el centro, UNA SOLA mesa ceremonial: rectangular, larguísima y estrecha, de madera oscura pulida, sin mantel, recorre el salón de delante hacia el fondo; ' +
      'sobre ella, copas de cristal vacías alineadas a intervalos regulares. A ambos lados, sillas de madera oscura de respaldo alto, todas iguales. ' +
      'En la cabecera más cercana, separada de la mesa, la silla del Moderador, más alta, con un mazo de madera y una campana de bronce. ' +
      'Al fondo del salón, dos portones monumentales de roble oscuro.'
  }
];
