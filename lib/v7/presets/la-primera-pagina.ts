/**
 * «LA PRIMERA PÁGINA» — cortometraje de 2 minutos (3 escenas × 5 tomas × 8 s).
 *
 * Elena pierde su trabajo y se hunde en deudas; su amiga Marisol le recomienda
 * GeneLibro para escribir su libro y Libroseller para publicarlo, y consigue su
 * primer bestseller.
 *
 * Los prompts de video están curados con las reglas aprendidas en «Dos toques»:
 * solo lo que aparece en el encuadre, la protagonista descrita siempre igual,
 * bocas cerradas (la narración va en voz en off), pantallas en blanco y sin
 * logos ni texto legible (las marcas se insertan en posproducción).
 */
import { FilmV7Schema } from '@/lib/v7/domain/film';
import { VoiceProfileSchema } from '@/lib/v7/domain/voice-profile';
import { createInitialV7Workflow } from '@/lib/v7/domain/workflow';
import type { StoredFilmBundle } from '@/lib/v7/storage/film-store';

export const PRIMERA_PAGINA_ID = 'film-la-primera-pagina-v7';
export const PRIMERA_PAGINA_TITLE = 'LA PRIMERA PÁGINA';

const story = 'Elena Paredes, contable dominicana de 42 años, pierde el trabajo de doce años y se hunde en deudas. ' +
  'Al encontrar su viejo cuaderno de historias, su amiga Marisol le recomienda GeneLibro para escribir su libro ' +
  'y Libroseller para publicarlo. Treinta días después, su primer libro se convierte en bestseller.';

const ELENA_FACE = 'Elena, a Dominican woman in her early forties with shoulder-length curly dark brown hair, warm brown eyes and small gold hoop earrings';
const ELENA_OFFICE = ELENA_FACE + ', wearing a grey office blazer over a white blouse';
const ELENA_HOME = ELENA_FACE + ', wearing a soft beige cardigan';
const ELENA_SUCCESS = ELENA_FACE + ', wearing an elegant burgundy blouse';
const MARISOL = 'Marisol, a cheerful Dominican woman in her mid-forties with short natural curly hair, wearing a bright yellow blouse';
const STYLE = 'Realistic, restrained, cinematic drama, natural soft light, 16:9.';
/** E02–E03: todo en español, con audio ambiente y voces de fondo en español dominicano. */
const ELENA_ES = 'Elena, una mujer dominicana de cuarenta y pocos años, con el pelo castaño oscuro rizado hasta los hombros, ojos marrones cálidos y pequeños aretes de aro dorados';
const ELENA_CASA = ELENA_ES + ', con un cárdigan beige suave';
const ELENA_EXITO = ELENA_ES + ', con una elegante blusa color burdeos';
const MARISOL_ES = 'Marisol, una mujer dominicana alegre de unos cuarenta y cinco años, con el pelo corto rizado natural y una blusa amarilla brillante';
const ESTILO = 'Drama cinematográfico realista y contenido, luz natural suave, formato 16:9. Sonido ambiente natural; si se oye alguna voz de fondo, es en español dominicano. Sin subtítulos ni texto en pantalla.';

type Beat = { title: string; camera: string; prompt: string; line: string; voice: 'elena' | 'marisol' };
type SceneSpec = { title: string; summary: string; location: string; wardrobe: string; cast: Array<'elena' | 'marisol'>; beats: Beat[] };

const specs: SceneSpec[] = [
  {
    title: 'Todo se cae', summary: 'Elena pierde su trabajo, se ahoga en deudas y encuentra su viejo cuaderno; Marisol le habla de GeneLibro y Libroseller.',
    location: 'Oficina, parada de autobús bajo la lluvia, cocina de noche, café', wardrobe: 'Elena blazer gris; luego cárdigan beige. Marisol blusa amarilla',
    cast: ['elena', 'marisol'],
    beats: [
      { title: 'Elena recoge su escritorio en una caja', camera: 'Plano medio',
        prompt: `Medium shot inside a modern open-plan office on a grey afternoon: ${ELENA_OFFICE} silently places a framed photo, a mug and a small plant into a cardboard box on her desk. Coworkers in soft focus in the background avoid her gaze. Her mouth stays closed. ${STYLE}`,
        line: 'Doce años en la misma oficina. Me despidieron un martes, con una caja y un «gracias por todo».', voice: 'elena' },
      { title: 'Parada de autobús bajo la lluvia con la caja', camera: 'Plano general',
        prompt: `Wide shot of a city bus stop in Santo Domingo in heavy afternoon rain. ${ELENA_OFFICE} stands under the small shelter holding a cardboard box against her chest, looking at the wet street. Cars pass with blurred headlights. ${STYLE}`,
        line: 'Ese día llovía como si la ciudad también se estuviera despidiendo de mí.', voice: 'elena' },
      { title: 'Facturas sobre la mesa de la cocina de noche', camera: 'Plano medio',
        prompt: `Night interior of a small modest kitchen lit by a single warm lamp. ${ELENA_HOME} sits at a table covered with envelopes and papers, rubbing her temples, a cold cup of coffee beside her. All paper text is blurred and unreadable. ${STYLE}`,
        line: 'Facturas, préstamos, silencio. Cada noche sumaba lo que no tenía.', voice: 'elena' },
      { title: 'Encuentra su viejo cuaderno de historias', camera: 'Primer plano de manos',
        prompt: `Close-up of a woman's hands opening a wooden drawer and finding an old worn notebook with a faded cloth cover. She slowly opens it to pages filled with handwritten lines in blue ink, unreadable. Warm lamp light. ${STYLE}`,
        line: 'Hasta que encontré mi viejo cuaderno. Las historias que escribía antes de rendirme.', voice: 'elena' },
      { title: 'Marisol le muestra el teléfono en el café', camera: 'Plano a dos',
        prompt: `Plano medio a dos en una pequeña cafetería luminosa: ${MARISOL_ES} sonríe con cariño y desliza su teléfono móvil por la mesa hacia ${ELENA_CASA}. La pantalla del teléfono es una pantalla en blanco que brilla suavemente, sin texto. Elena la mira con una esperanza cautelosa. Las dos mantienen la boca cerrada. ${ESTILO}`,
        line: 'Escríbelo, Elena. Con GeneLibro lo terminas, y con Libroseller el mundo lo lee.', voice: 'marisol' }
    ]
  },
  {
    title: 'Escribir de nuevo', summary: 'Elena escribe su libro con GeneLibro durante treinta días y lo publica en Libroseller.',
    location: 'Sala modesta de noche y al amanecer', wardrobe: 'Elena cárdigan beige',
    cast: ['elena'],
    beats: [
      { title: 'Elena abre el portátil de noche', camera: 'Primer plano',
        prompt: `De noche, primer plano de ${ELENA_CASA}, sentada frente a un portátil en una sala con poca luz. El brillo frío de la pantalla ilumina su rostro; la pantalla no se ve. Respira hondo y empieza a escribir con una pequeña expresión de determinación. Su boca permanece cerrada. ${ESTILO}`,
        line: 'Esa misma noche abrí GeneLibro. Por primera vez en meses, no tuve miedo.', voice: 'elena' },
      { title: 'Manos escribiendo junto al cuaderno', camera: 'Plano detalle',
        prompt: `Plano detalle de las manos de una mujer escribiendo en el teclado de un portátil, junto a un cuaderno abierto escrito a mano y una taza de café. Poca profundidad de campo, luz cálida de lámpara mezclada con el brillo frío de la pantalla. Ningún texto legible. ${ESTILO}`,
        line: 'Le conté mi vida, y me ayudó a ordenar cada capítulo.', voice: 'elena' },
      { title: 'Pasan los días hasta el amanecer', camera: 'Plano fijo',
        prompt: `Plano fijo de la ventana de una pequeña sala: la luz cambia lentamente de la noche a un amanecer dorado, mientras ${ELENA_CASA} sigue trabajando en un portátil junto a la ventana y las tazas de café vacías se acumulan sobre la mesa. ${ESTILO}`,
        line: 'Treinta días. Treinta amaneceres escribiendo.', voice: 'elena' },
      { title: 'Sostiene su primer libro impreso', camera: 'Primer plano medio',
        prompt: `Primer plano medio de ${ELENA_CASA} sosteniendo un libro de tapa blanda recién impreso, con una portada minimalista y sin título legible. Pasa los dedos por la portada, con los ojos brillantes, y sonríe con la boca cerrada. Luz suave de mañana. ${ESTILO}`,
        line: 'Y un día lo tuve en mis manos: mi primer libro.', voice: 'elena' },
      { title: 'Un clic para publicar', camera: 'Plano macro',
        prompt: `Plano macro del dedo de una mujer sobre el panel táctil de un portátil, que hace un solo clic. El brillo de la pantalla se refleja suavemente en su mano; el contenido de la pantalla no se ve. Una quietud tranquila y aliviada. ${ESTILO}`,
        line: 'Lo subí a Libroseller. Un clic… y respiré.', voice: 'elena' }
    ]
  },
  {
    title: 'Bestseller', summary: 'El libro se convierte en bestseller; firma de libros, abrazo con Marisol y cierre en la parada, ahora con sol.',
    location: 'Cocina de día, librería, parada de autobús soleada', wardrobe: 'Elena blusa burdeos elegante; Marisol blusa amarilla',
    cast: ['elena', 'marisol'],
    beats: [
      { title: 'El teléfono no para de vibrar', camera: 'Plano detalle',
        prompt: `Primer plano de un teléfono móvil boca arriba sobre una mesa de cocina de madera, con luz brillante de mañana, vibrando una y otra vez mientras parpadean suaves luces de notificación; el contenido de la pantalla está desenfocado e ilegible. Una taza de café al lado. ${ESTILO}`,
        line: 'A la mañana siguiente, el teléfono no paraba.', voice: 'elena' },
      { title: 'Su libro en la mesa de novedades', camera: 'Travelling hacia la mesa',
        prompt: `Travelling lento en una librería independiente cálida hacia una mesa de novedades con una pila alta y ordenada del mismo libro de tapa blanda, de portada minimalista con una pequeña pegatina dorada redonda; sin texto legible ni logotipos. Clientes desenfocados hojean libros al fondo. ${ESTILO}`,
        line: 'En tres semanas, mi libro estaba entre los más vendidos.', voice: 'elena' },
      { title: 'Firma de libros', camera: 'Plano medio',
        prompt: `Plano medio en una mesa de firmas de una librería acogedora: ${ELENA_EXITO} firma un ejemplar de su libro y se lo entrega a una lectora adulta sonriente, mientras una fila corta de lectores adultos espera desenfocada. Luz cálida. Ella sonríe con la boca cerrada. ${ESTILO}`,
        line: 'Gente que no conocía me decía que mi historia también era la suya.', voice: 'elena' },
      { title: 'Abrazo con Marisol', camera: 'Plano medio, cámara en mano suave',
        prompt: `Plano medio en la misma librería cálida: ${MARISOL_ES} sale de entre el público y las dos amigas se abrazan con fuerza; ${ELENA_EXITO} cierra los ojos con gratitud. Luz dorada, cámara en mano suave. ${ESTILO}`,
        line: 'Y Marisol estaba allí, en primera fila, como siempre.', voice: 'elena' },
      { title: 'La parada de autobús, ahora con sol', camera: 'Plano general, alejamiento lento',
        prompt: `Plano general final de la misma parada de autobús de Santo Domingo bajo un sol brillante después de la lluvia, con charcos que reflejan el cielo azul. ${ELENA_EXITO} está de pie, abrazando su libro contra el pecho, mira al cielo y sonríe. Alejamiento lento de la cámara. ${ESTILO}`,
        line: 'Me quitaron un trabajo. Me devolvieron mi voz. Esta es solo la primera página.', voice: 'elena' }
    ]
  }
];

const profiles = [
  ['elena', 'Elena Paredes', 42, 'Protagonista y narradora',
    'Mujer dominicana de unos cuarenta años, pelo rizado castaño oscuro a los hombros, ojos marrones cálidos, aretes dorados pequeños',
    'Voz femenina cálida dominicana, serena y cercana; narradora en off.'],
  ['marisol', 'Marisol', 45, 'Amiga de Elena',
    'Mujer dominicana alegre de mediados de los cuarenta, pelo corto rizado natural, blusa amarilla',
    'Voz femenina enérgica y afectuosa.']
] as const;

const SHOT_SECONDS = 8;

export function createPrimeraPaginaBundle(now: string = new Date().toISOString()): Omit<StoredFilmBundle, 'savedAt'> {
  const filmId = PRIMERA_PAGINA_ID;
  const characterId = (id: string) => filmId + '-character-' + id;
  const acts = specs.map((spec, index) => {
    const actId = filmId + '-act-' + (index + 1);
    const sequenceId = actId + '-sequence-1';
    const sceneId = filmId + '-scene-' + String(index + 1).padStart(2, '0');
    return {
      id: actId, filmId, order: index + 1, title: spec.title, dramaticObjective: spec.summary,
      sequences: [{
        id: sequenceId, actId, order: 1, title: spec.title, objective: spec.summary,
        scenes: [{
          id: sceneId, sequenceId, order: index + 1, title: spec.title, summary: spec.summary,
          durationSeconds: spec.beats.length * SHOT_SECONDS,
          timeIndex: specs.slice(0, index).reduce((sum, s) => sum + s.beats.length * SHOT_SECONDS, 0),
          characterIds: spec.cast.map(characterId),
          narrativeGoal: spec.summary, emotionalGoal: 'Del hundimiento a la esperanza, sin melodrama',
          continuityNotes: [spec.location, spec.wardrobe,
            'Pantallas en blanco y sin logos: GeneLibro y Libroseller se insertan en posproducción',
            'Narración en off: nadie mueve los labios'],
          shots: spec.beats.map((beat, shotIndex) => ({
            id: sceneId + '-shot-' + String(shotIndex + 1).padStart(2, '0'), sceneId, order: shotIndex + 1,
            title: beat.title, intention: spec.summary, durationSeconds: SHOT_SECONDS,
            visualPrompt: beat.prompt, camera: beat.camera, spokenText: beat.line,
            speakerId: characterId(beat.voice),
            characterIds: spec.cast.map(characterId),
            strategy: 'cinematic-video-candidate',
            metadata: { curatedPrompt: true, voiceOver: true, providerCalls: 0, lipsyncStatus: 'not-needed' },
            takes: []
          })),
          metadata: { location: spec.location, costume: spec.wardrobe }
        }]
      }]
    };
  });

  const film = FilmV7Schema.parse({
    id: filmId, title: PRIMERA_PAGINA_TITLE, premise: story, durationMinutes: 2,
    genre: 'Drama inspirador', audience: 'Público general adulto',
    visualStyle: 'Drama realista dominicano, 16:9; grises lluviosos que pasan a luz dorada',
    language: 'es', aspectRatio: '16:9', budgetUsd: 0, acts,
    characters: profiles.map(([key, name, age, role, appearance, timbre]) => ({
      id: characterId(key), filmId, name, age, role, appearance,
      identityLock: appearance, immutableTraits: [appearance], personality: timbre,
      voiceProfileId: filmId + '-voice-' + key,
      metadata: { canonicalImageApproved: false, castingStatus: 'pending' }
    })),
    createdAt: now, updatedAt: now,
    metadata: {
      storyTreatmentApproved: true, copyrightStatus: 'original-fiction',
      locationalSetting: 'República Dominicana', productionMode: 'PREPRODUCTION_ONLY',
      brands: ['GeneLibro', 'Libroseller'], brandPolicy: 'Marcas solo en voz y en posproducción; nunca pantallas inventadas',
      moneySpentUsd: 0
    }
  });

  const voiceProfiles = profiles.map(([key, , age, , , timbre]) => VoiceProfileSchema.parse({
    id: filmId + '-voice-' + key, characterId: characterId(key), provider: 'unassigned',
    language: 'es-DO', accent: 'dominicano', ageProfile: String(age), timbre, speed: 1,
    approved: false, rightsStatus: 'unknown', voiceVersion: 1, emotionPresets: {}, pronunciationDictionary: {}
  }));

  return {
    film, assets: [], voiceProfiles, workflow: createInitialV7Workflow(now),
    creationInput: {
      title: PRIMERA_PAGINA_TITLE, story, durationMinutes: 2, genre: 'Drama inspirador',
      aspectRatio: '16:9', language: 'es', budgetUsd: 0, quality: 'cine'
    }
  };
}

export function getPrimeraPaginaStats() {
  const shots = specs.reduce((sum, s) => sum + s.beats.length, 0);
  return { scenes: specs.length, shots, totalSeconds: shots * SHOT_SECONDS };
}
