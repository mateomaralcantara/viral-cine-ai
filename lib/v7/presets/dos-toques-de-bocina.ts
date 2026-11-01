import { FilmV7Schema } from '@/lib/v7/domain/film';
import { VoiceProfileSchema } from '@/lib/v7/domain/voice-profile';
import { createInitialV7Workflow } from '@/lib/v7/domain/workflow';
import type { StoredFilmBundle } from '@/lib/v7/storage/film-store';

export const DOS_TOQUES_ID = 'film-dos-toques-de-bocina-v7';
export const DOS_TOQUES_DURATION_SECONDS = 600;
export const DOS_TOQUES_TITLE = 'DOS TOQUES DE BOCINA';

const story = 'Gabriel Santos, padre dominicano que pierde la custodia principal de sus hijos y debe ganarse la vida como motoconchista, transforma sus noches de tristeza en el libro El asiento vacío. Con la ayuda de Samuel lo publica a través de Libroseller y, veinte días después de la publicación, es invitado a contar su experiencia en un auditorio local. Los niños nunca dejaron de amarlo. Dos toques de bocina expresan el vínculo que ninguna sentencia pudo romper.';

type Beat = { image: string; camera: string; line?: string; voice?: string };
type SceneSpec = {
  seconds: number; title: string; act: 1 | 2 | 3; location: string;
  summary: string; cast: string[]; wardrobe: string; beats: Beat[];
};

const specs: SceneSpec[] = [
  {
    seconds: 50, title: 'La señal', act: 1, location: 'Exterior escuela, mañana dorada',
    summary: 'Gabriel deja a sus hijos en la escuela. Dos toques de bocina significan te amo.',
    cast: ['gabriel', 'daniel', 'lucia'], wardrobe: 'Gabriel camisa azul gastada; escolares con uniforme; casco infantil azul celeste',
    beats: [
      { image: 'Gabriel llega muy despacio a una escuela dominicana al amanecer en su motor azul oscuro con asiento remendado, junto a Daniel de 11 años y Lucía de 7 años, ambos visibles y con cascos, en un montaje cinematográfico seguro; no texto en pantalla', camera: 'Plano general 35 mm con travelling lateral fluido, sin cortes' },
      { image: 'Gabriel se quita casco negro y ayuda a Daniel a desabrochar casco infantil', camera: 'Plano medio lateral' },
      { image: 'Lucía baja con mochila de estrellas y entrega dibujo doblado a Gabriel', camera: 'Plano detalle de manos', line: 'Para que no te olvides de nosotros en el trabajo.', voice: 'lucia' },
      { image: 'Gabriel guarda el dibujo y sonríe mirando hacia los niños', camera: 'Primer plano de reacción', line: 'No existe un día que yo pudiera olvidarme de ustedes.', voice: 'gabriel' },
      { image: 'Daniel hace broma cariñosa mirando el viejo motor', camera: 'Plano americano de tres cuartos', line: 'Papi, tú sí que llegas temprano, aunque el motor suene como una lata.', voice: 'daniel' },
      { image: 'Los dos niños caminan hacia la entrada y giran con sonrisa', camera: 'Travelling desde atrás de Gabriel' },
      { image: 'Mano de Gabriel acciona dos veces la bocina; niños contestan con las manos', camera: 'Plano detalle del puño y contraplano', line: 'Dos toques de bocina, la forma de decir te amo.', voice: 'gabriel' }
    ]
  },
  {
    seconds: 55, title: 'La casa en silencio', act: 1, location: 'Interior vivienda modesta, atardecer',
    summary: 'Camila se marcha con los niños, Victoria espera junto a la puerta.',
    cast: ['gabriel', 'camila', 'victoria'], wardrobe: 'Camila blusa clara; Victoria traje crema; Gabriel uniforme de repartidor',
    beats: [
      { image: 'Tres platos en mesa familiar; dos pequeños quedan vacíos', camera: 'Plano detalle estático' },
      { image: 'Camila cierra maleta a contraluz, intenta contener lágrimas', camera: 'Plano medio de espalda', line: 'No puedo seguir viviendo con la incertidumbre. Los niños se vienen conmigo.', voice: 'camila' },
      { image: 'Victoria espera erguida junto a puerta con maleta', camera: 'Plano medio lateral', line: 'Necesitan estabilidad, Gabriel. No promesas.', voice: 'victoria' },
      { image: 'Gabriel ya está dentro con casco negro en mano y observa la maleta', camera: 'Plano americano con ligero acercamiento', line: 'Si tú no quieres estar conmigo, yo no puedo obligarte. Pero soy su papá.', voice: 'gabriel' },
      { image: 'Camila contempla el marco familiar y aparta los ojos', camera: 'Primer plano de reacción', line: 'Yo sé que los amas.', voice: 'camila' },
      { image: 'La puerta se cierra despacio; Gabriel permanece solo en pasillo', camera: 'Plano general fijo', line: 'Entonces diles que no he dejado de esperarlos.', voice: 'gabriel' },
      { image: 'Gabriel acomoda dos platos infantiles intactos; sombra en mesa', camera: 'Detalle de manos en lenta aproximación' }
    ]
  },
  {
    seconds: 65, title: 'La sentencia', act: 1, location: 'Tribunal familiar ficticio y exterior con lluvia',
    summary: 'Gabriel pierde el régimen principal de residencia. Conserva contacto y posibilidad de revisión.',
    cast: ['gabriel', 'camila', 'victoria'], wardrobe: 'Gabriel camisa blanca sencilla; Camila tonos neutros; Victoria traje crema',
    beats: [
      { image: 'Pasillo silencioso de tribunal ficticio con Gabriel sentado solo', camera: 'Plano general simétrico' },
      { image: 'Manos de Gabriel sujetan papeles gastados', camera: 'Plano macro' },
      { image: 'Camila observa a Gabriel desde banco distante; dolor contenido', camera: 'Plano alterno de reacción' },
      { image: 'Expediente ficticio sobre escritorio, sin textos legales falsos visibles', camera: 'Plano detalle', line: 'Los menores residirán principalmente con la madre, conservando el padre un régimen de contacto sujeto a revisión.', voice: 'jueza' },
      { image: 'Gabriel baja la mirada y firma lentamente', camera: 'Primer plano de manos' },
      { image: 'Gabriel sale del tribunal con hombros hundidos hacia lluvia tropical', camera: 'Travelling de seguimiento posterior' },
      { image: 'Casco infantil azul celeste mojado cuelga del motor azul', camera: 'Plano detalle cinematográfico' },
      { image: 'Gabriel abraza el casco pequeño y se sienta en el bordillo', camera: 'Plano medio lateral desde la lluvia', line: 'Dios mío… yo no sé cómo se aprende a vivir sin decirles buenas noches.', voice: 'gabriel' },
      { image: 'Llueve sobre asfalto y reflejos mientras Gabriel permanece inmóvil', camera: 'Plano general largo, sin música' }
    ]
  },
  {
    seconds: 60, title: 'El motoconcho', act: 2, location: 'Calles de Santo Domingo y salida escolar, varios días',
    summary: 'Gabriel trabaja transportando pasajeros; descubre a sus hijos en una camioneta y la mano de Daniel sobre el vidrio.',
    cast: ['gabriel', 'daniel', 'camila'], wardrobe: 'Gabriel impermeable amarillo viejo, casco negro, mochila gastada',
    beats: [
      { image: 'Gabriel espera pasajeros junto a otras motocicletas', camera: 'Plano general urbano' },
      { image: 'Recoge pasajero y arranca con lluvia ligera', camera: 'Travelling lateral de motor azul' },
      { image: 'Manos arrugadas de Gabriel cuentan monedas mojadas', camera: 'Plano macro' },
      { image: 'Gabriel pasa por escuela y frena ante camioneta oscura de lujo', camera: 'Plano dos vehículos, sin marcas' },
      { image: 'Daniel dentro del vehículo reconoce a su padre, apoya mano en ventana', camera: 'Primer plano del niño a través de vidrio', line: 'Mami, ese era papi.', voice: 'daniel' },
      { image: 'Gabriel levanta la mano, moto quieta, camión avanza', camera: 'Contraplano fijo amplio' },
      { image: 'Camila mira por retrovisor pero sigue conduciendo', camera: 'Plano detalle espejo interior' },
      { image: 'Dedo de Gabriel se acerca a botón de bocina, se detiene sin pulsarlo', camera: 'Macro + silencio total', line: 'Un día mis hijos se subirán otra vez a este motor.', voice: 'gabriel' }
    ]
  },
  {
    seconds: 60, title: 'El amigo', act: 2, location: 'Parada de motoconchos, tarde con llovizna',
    summary: 'Samuel descubre que Gabriel escribe y le habla con honestidad de Libroseller.',
    cast: ['gabriel', 'samuel'], wardrobe: 'Gabriel camisa azul desgastada; Samuel camisa verde, barba canosa',
    beats: [
      { image: 'Samuel llega con dos cafés de papel a parada bajo techo', camera: 'Plano general íntimo' },
      { image: 'Gabriel saca cuaderno húmedo del asiento del motor', camera: 'Detalle de cuaderno y cinta en asiento' },
      { image: 'Samuel observa páginas escritas, sin leer en voz alta', camera: 'Perfil lateral de Samuel', line: 'Tú antes contabas historias. ¿Ahora las escondes debajo del asiento?', voice: 'samuel' },
      { image: 'Gabriel baja la mirada, intenta recoger el cuaderno', camera: 'Primer plano de reacción', line: 'Escribo de los pasajeros. De los que extrañan a alguien.', voice: 'gabriel' },
      { image: 'Samuel se sienta junto a Gabriel con café en la mano', camera: 'Plano dos personajes de espalda', line: 'Yo también trabajé en motor y un día comencé a publicar mis relatos.', voice: 'samuel' },
      { image: 'Gabriel observa su casco infantil colgado', camera: 'Plano detalle y silencio', line: '¿Quién va a leer a un hombre que ni pudo quedarse con sus hijos?', voice: 'gabriel' },
      { image: 'Samuel sostiene teléfono con web auténtica de Libroseller sobreimpresa luego en posproducción', camera: 'Plano sobre hombro, pantalla para sustitución', line: 'No te prometo dinero. Solo te digo que tu voz merece salir de ese cuaderno.', voice: 'samuel' },
      { image: 'Gabriel levanta el rostro por primera vez esperanzado', camera: 'Primer plano de reacción, lluvia cede' }
    ]
  },
  {
    seconds: 60, title: 'El asiento vacío', act: 2, location: 'Cuarto alquilado de Gabriel, madrugada',
    summary: 'Gabriel escribe su libro en teléfono y portátil prestado recordando la familia.',
    cast: ['gabriel'], wardrobe: 'Gabriel camiseta gris y pelo despeinado, misma cicatriz',
    beats: [
      { image: 'Cuarto pequeño, mesa con cuaderno, celular, bombilla amarilla', camera: 'Establishing general' },
      { image: 'Gabriel escribe tachando páginas a mano', camera: 'Plano detalle de lápiz' },
      { image: 'Cae la luz, Gabriel enciende linterna de teléfono', camera: 'Plano medio silueta' },
      { image: 'Flash emocional de dos platos vacíos, no personajes nuevos', camera: 'Fundido encadenado a memoria' },
      { image: 'Gabriel encuentra dibujo doblado de Lucía en cuaderno', camera: 'Plano macro' },
      { image: 'Gabriel se limpia lágrima mientras continúa escribiendo', camera: 'Primer plano lateral', line: 'Me dejaron una silla vacía, un casco que ya no se usa y dos platos que no me atrevo a guardar.', voice: 'gabriel' },
      { image: 'Escribe a mano el título EL ASIENTO VACÍO', camera: 'Detalle de título legible realizado en postproducción', line: 'Pero nadie ha podido quitarme las ganas de escuchar sus risas otra vez.', voice: 'gabriel' },
      { image: 'Gabriel cierra cuaderno, observa una tenue luz de amanecer', camera: 'Plano medio con lenta elevación' }
    ]
  },
  {
    seconds: 60, title: 'El libro llega al mundo', act: 2, location: 'Casa de Samuel y cuarto de Gabriel',
    summary: 'La historia se publica a través de una captura auténtica de Libroseller y llega al primer lector ficticio.',
    cast: ['gabriel', 'samuel'], wardrobe: 'Samuel camisa verde, Gabriel camisa azul',
    beats: [
      { image: 'Samuel revisa manuscrito impreso y portada sobre mesa de cocina', camera: 'Plano cenital' },
      { image: 'Gabriel contempla portada impresa El asiento vacío', camera: 'Plano medio lateral' },
      { image: 'Captura real verificada de libroseller.com en pantalla, sin transacciones inventadas', camera: 'Grabación de pantalla externa a modelo Veo' },
      { image: 'Gabriel presiona una tecla y espera con nervios', camera: 'Detalle de manos y teclado' },
      { image: 'Lector ficticio abre enlace en casa, sin mostrar plataforma falsa', camera: 'Plano sobre hombro distante' },
      { image: 'Una reacción de lector aparece como texto narrativo de posproducción', camera: 'Composición de pantalla en montaje' },
      { image: 'Gabriel lee el primer mensaje y se cubre los ojos', camera: 'Primer plano lateral', line: 'Hermano… alguien lo leyó de verdad.', voice: 'gabriel' },
      { image: 'Samuel recibe nota de voz y sonríe viendo su teléfono', camera: 'Plano de manos y sonrisa', line: 'Entonces valió la pena escribirlo.', voice: 'samuel' }
    ]
  },
  {
    seconds: 60, title: 'Veinte días', act: 2, location: 'Días de trabajo, teléfonos y pequeño salón',
    summary: 'El testimonio se comparte, no hay enriquecimiento instantáneo; llega invitación local a conferencia.',
    cast: ['gabriel', 'samuel'], wardrobe: 'Gabriel uniforme de motoconcho; luego traje gris prestado',
    beats: [
      { image: 'Calendario de papel con días tachados, rótulo temporal en posproducción', camera: 'Detalle cenital' },
      { image: 'Gabriel lee fragmento del libro junto a motor estacionado', camera: 'Teléfono de espectador, sin labios frontal', line: 'Yo no perdí a mis hijos. Perdí la oportunidad de abrazarlos cada noche.', voice: 'gabriel' },
      { image: 'Pantallas genéricas muestran video compartido en comunidades, sin cifras inventadas', camera: 'Montaje de pantallas y manos' },
      { image: 'Una mujer mayor se emociona escuchando testimonio desde casa', camera: 'Plano de reacción de espectadora genérica' },
      { image: 'Gabriel recibe invitación a encuentro de lectura local', camera: 'Detalle de celular sin nombres reales' },
      { image: 'Samuel plancha traje gris antiguo sobre mesa', camera: 'Plano medio lateral' },
      { image: 'Gabriel mira el traje y luego su uniforme gastado', camera: 'Plano americano de espalda', line: 'Eso le queda grande a un motoconchista.', voice: 'gabriel' },
      { image: 'Samuel pone mano sobre hombro de Gabriel', camera: 'Plano dos personajes de tres cuartos', line: 'Entonces que el traje aprenda a estar a tu altura.', voice: 'samuel' }
    ]
  },
  {
    seconds: 70, title: 'La conferencia', act: 3, location: 'Auditorio local, luces cálidas',
    summary: 'Gabriel comparte lo aprendido. Los niños aparecen y el valor de su paternidad prevalece sobre la fama.',
    cast: ['gabriel', 'daniel', 'lucia', 'camila', 'samuel'], wardrobe: 'Gabriel traje gris viejo y corbata azul; niños ropa de domingo',
    beats: [
      { image: 'Auditorio local de unos 150 asistentes, no un estadio', camera: 'Plano general desde atrás' },
      { image: 'Gabriel sube al escenario y aprieta papel con mano temblorosa', camera: 'Travelling lateral de espalda' },
      { image: 'Asistentes escuchan en silencio con expresiones conmovedoras', camera: 'Montaje de primeros planos', line: 'Pensé que un buen padre era el que tenía las manos llenas.', voice: 'gabriel' },
      { image: 'Gabriel observa sus manos abiertas frente al atril', camera: 'Detalle desde el lateral', line: 'Después se me quedaron vacías. Descubrí que podían servir para escribir.', voice: 'gabriel' },
      { image: 'Camila entra discretamente con Daniel y Lucía por la puerta trasera', camera: 'Plano general de contraluz' },
      { image: 'Daniel reconoce a Gabriel sobre escenario, ojos brillantes', camera: 'Primer plano del niño' },
      { image: 'Gabriel descubre a sus hijos entre asistentes, se inmoviliza', camera: 'Primer plano de reacción, sin lipsync' },
      { image: 'Gabriel apoya mano sobre el atril para contener emoción', camera: 'Detalle de manos', line: 'Si mis hijos me escuchan esta noche, quiero que sepan que nunca dejé de ser su padre.', voice: 'gabriel' },
      { image: 'Público se levanta lentamente, Daniel abraza a su hermana', camera: 'Plano general de escenario y público' }
    ]
  },
  {
    seconds: 60, title: 'Dos toques', act: 3, location: 'Exterior de auditorio, noche cálida',
    summary: 'Abrazo final junto al motor azul; dos toques de bocina; la situación judicial sigue abierta.',
    cast: ['gabriel', 'daniel', 'lucia', 'camila', 'samuel'], wardrobe: 'Gabriel traje gris antiguo; niños ropa de domingo; Camila blusa elegante',
    beats: [
      { image: 'Gabriel baja las escaleras del auditorio buscando a sus hijos', camera: 'Plano americano frontal sin hablar' },
      { image: 'Daniel y Lucía corren hacia Gabriel, él se arrodilla', camera: 'Travelling lateral' },
      { image: 'Los tres se abrazan con fuerza en un silencio largo', camera: 'Plano medio circular lento' },
      { image: 'Daniel toca casco infantil azul aún colgado del motor', camera: 'Plano detalle', line: 'Papi… ¿tú todavía tienes mi casco?', voice: 'daniel' },
      { image: 'Gabriel con lágrimas señala el casco que nunca retiró', camera: 'Primer plano de reacción', line: 'No lo quité nunca, mi hijo.', voice: 'gabriel' },
      { image: 'Lucía entrega dibujo nuevo de tres figuras y moto azul', camera: 'Macro sobre las manos', line: 'Papi, yo hice otro dibujo. Esta vez estamos los tres.', voice: 'lucia' },
      { image: 'Daniel señala el puño del manubrio; Gabriel asiente', camera: 'Plano detalle en perfil', line: 'Hazlo otra vez, papi. La señal.', voice: 'daniel' },
      { image: 'Gabriel pulsa dos veces bocina, los niños sonríen abrazados; Samuel y Camila miran desde lejos', camera: 'Plano general ascendente, fundido a negro', line: 'Yo quería que estuvieran orgullosos de mí. Nunca dejaron de quererme.', voice: 'gabriel' }
    ]
  }
];

const profiles = [
  ['gabriel', 'Gabriel Santos', 39, 'Protagonista, padre y escritor',
    'Hombre dominicano de piel canela, barba corta irregular, ojeras, cicatriz junto a ceja izquierda, manos de trabajador',
    'Barítono medio dominicano, contenido y cálido.'],
  ['daniel', 'Daniel Santos', 11, 'Hijo mayor',
    'Niño dominicano de ojos grandes oscuros y cabello corto rizado; casco infantil azul celeste',
    'Voz infantil masculina, suave, emotiva.'],
  ['lucia', 'Lucía Santos', 7, 'Hija menor',
    'Niña dominicana con dos trenzas y lazos amarillos, mochila de estrellas',
    'Voz infantil femenina natural, expresiva.'],
  ['camila', 'Camila Reyes', 36, 'Madre de Daniel y Lucía',
    'Mujer dominicana de expresión cansada; atuendos elegantes y sencillos',
    'Voz femenina mezzo grave, contenida.'],
  ['victoria', 'Victoria Reyes', 62, 'Abuela materna de los niños',
    'Mujer adinerada, cabello canoso corto, traje crema y postura firme',
    'Contralto firme, sin exageración de antagonismo.'],
  ['samuel', 'Samuel Peña', 45, 'Amigo de Gabriel, antiguo motoconchista y autor',
    'Hombre delgado con barba salpicada de canas, camisa verde',
    'Voz masculina cálida y ronca.'],
  ['jueza', 'Jueza', 55, 'Jueza ficticia',
    'Mujer de mediana edad, atuendo judicial genérico sin símbolos reales',
    'Voz femenina serena y formal.']
] as const;

function splitSeconds(duration: number, parts: number) {
  const frames = duration * 24;
  const base = Math.floor(frames / parts);
  const remaining = frames - base * parts;
  return Array.from({ length: parts }, (_, i) => (base + Number(i < remaining)) / 24);
}

export function createDosToquesBundle(now: string = new Date().toISOString()): Omit<StoredFilmBundle, 'savedAt'> {
  const filmId = DOS_TOQUES_ID;
  const characterId = (id: string) => filmId + '-character-' + id;
  const scenesByAct = [1, 2, 3].map((act) =>
    specs.map((spec, index) => ({ spec, index }))
      .filter(({ spec }) => spec.act === act));

  const acts = scenesByAct.map((entries, actIndex) => {
    const actId = filmId + '-act-' + (actIndex + 1);
    const sequenceId = actId + '-sequence-1';
    return {
      id: actId,
      filmId,
      order: actIndex + 1,
      title: ['Presentación y pérdida', 'La voz que renace', 'El reencuentro'][actIndex],
      dramaticObjective: ['Vínculo familiar, abandono y pérdida de custodia',
        'Motoconcho, escritura, Libroseller y reconocimiento local',
        'Una conferencia y la reunión afectiva sin anular la sentencia'][actIndex],
      sequences: [{
        id: sequenceId,
        actId,
        order: 1,
        title: 'Secuencia principal, acto ' + (actIndex + 1),
        objective: 'Seguir la progresión emocional aprobada de la película',
        scenes: entries.map(({ spec, index }) => {
          const sceneId = filmId + '-scene-' + String(index + 1).padStart(2, '0');
          const durations = splitSeconds(spec.seconds, spec.beats.length);
          let offset = 0;
          return {
            id: sceneId, sequenceId, order: index + 1, title: spec.title,
            summary: spec.summary, durationSeconds: spec.seconds,
            timeIndex: specs.slice(0, index).reduce((sum, x) => sum + x.seconds, 0),
            characterIds: spec.cast.map(characterId),
            narrativeGoal: spec.summary, emotionalGoal: 'Autenticidad emocional y empatía sin melodrama artificial',
            continuityNotes: [spec.location, spec.wardrobe,
              'Motor azul oscuro con asiento remendado y casco infantil azul celeste cuando corresponda',
              'No fabricar pantallas de Libroseller ni diálogos frontales sin sincronización labial'],
            shots: spec.beats.map((beat, shotIndex) => {
              const seconds = durations[shotIndex];
              const shotId = sceneId + '-shot-' + String(shotIndex + 1).padStart(2, '0');
              const item = {
                id: shotId, sceneId, order: shotIndex + 1,
                title: beat.image.slice(0, 120),
                intention: 'Visualizar el momento dramático de la escena sin reemplazar los personajes.',
                durationSeconds: seconds,
                visualPrompt: 'Drama cinematográfico realista ambientado en República Dominicana. ' +
                  spec.location + '. ' + beat.image + '. Ropa/props: ' + spec.wardrobe +
                  '. Personas deben coincidir con perfiles fijos aprobados. Sin labios moviéndose para hablar.' ,
                camera: beat.camera, spokenText: beat.line ?? '',
                speakerId: beat.voice && beat.voice !== 'jueza' ? characterId(beat.voice) :
                  beat.voice === 'jueza' ? characterId('jueza') : undefined,
                characterIds: spec.cast.map(characterId),
                strategy: beat.image.includes('Libroseller') || beat.image.includes('captura real')
                  ? 'capture-real-interface-only' : 'cinematic-video-candidate',
                metadata: {
                  startSeconds: Number((offset).toFixed(6)), // local scene offset
                  voiceCode: beat.voice ? beat.voice.toUpperCase() + '-ESDO-V1' : null,
                  providerCalls: 0, videoReady: false,
                  cinematographyApproved: false, lipsyncStatus: 'deferred'
                },
                takes: []
              };
              offset += seconds;
              return item;
            }),
            metadata: {
              screenplayVersion: 'v1', screenplayApproval: 'pending-editorial-review',
              shotGenerationApproved: false, location: spec.location, costume: spec.wardrobe
            }
          };
        })
      }]
    };
  });

  const film = FilmV7Schema.parse({
    id: filmId, title: DOS_TOQUES_TITLE, premise: story, durationMinutes: 10,
    genre: 'Drama familiar', audience: 'Público adulto y familiar',
    visualStyle: 'Drama realista dominicano, 16:9, colores cálidos de recuerdos frente a azules lluviosos de pérdida',
    language: 'es', aspectRatio: '16:9', budgetUsd: 0,
    acts,
    characters: profiles.map(([key, name, age, role, appearance, timbre]) => ({
      id: characterId(key), filmId, name, age, role, appearance,
      identityLock: appearance, immutableTraits: [appearance],
      personality: timbre, voiceProfileId: filmId + '-voice-' + key,
      metadata: { voiceCodename: key.toUpperCase() + '-ESDO-V1',
        canonicalImageApproved: false, castingStatus: 'pending' }
    })),
    createdAt: now, updatedAt: now,
    metadata: {
      storyTreatmentApproved: true,
      screenplayVersion: 'GUION-LITERARIO-V1',
      screenplayApprovedForPaidRendering: false,
      screenplaySource: 'films/dos-toques-de-bocina/GUION-LITERARIO-V1.md',
      isolatedFromV6And15Dias: true,
      copyrightStatus: 'original-fiction',
      locationalSetting: 'República Dominicana',
      productionMode: 'PREPRODUCTION_ONLY',
      moneySpentUsd: 0,
      commercialClaim: 'No garantiza ingresos ni cambio de custodia'
    }
  });

  const voiceProfiles = profiles.map(([key, _name, age, _role, _appearance, timbre]) =>
    VoiceProfileSchema.parse({
      id: filmId + '-voice-' + key, characterId: characterId(key), provider: 'unassigned',
      language: 'es-DO', accent: 'dominicano', ageProfile: String(age),
      timbre, speed: 1, approved: false, rightsStatus: 'unknown',
      voiceVersion: 1, emotionPresets: {}, pronunciationDictionary: {}
    })
  );

  const workflow = createInitialV7Workflow(now);
  const stages = workflow.stages.map((stage) => stage.id === 'story'
    ? { ...stage, status: 'in-progress' as const,
      notes: ['Tratamiento aprobado por el creador. Guion literario v1 escrito; guion técnico pendiente de revisión.'] }
    : stage);

  return {
    film, assets: [], voiceProfiles,
    workflow: { stages },
    creationInput: {
      title: DOS_TOQUES_TITLE,
      story,
      durationMinutes: 10,
      genre: 'Drama familiar', aspectRatio: '16:9', language: 'es',
      budgetUsd: 0, quality: 'cine'
    }
  };
}

export function getDosToquesProductionStats() {
  const scenes = specs.length;
  const shots = specs.reduce((sum, scene) => sum + scene.beats.length, 0);
  const totalSeconds = specs.reduce((sum, scene) => sum + scene.seconds, 0);
  return { scenes, shots, totalSeconds, acts: 3 };
}
