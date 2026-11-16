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
        prompt: `Medium two-shot in a small bright café: ${MARISOL} smiles warmly and slides her smartphone across the table toward ${ELENA_HOME}. The phone screen is a plain, softly glowing blank screen with no text. Elena looks at it with cautious hope. Both of their mouths stay closed. ${STYLE}`,
        line: 'Escríbelo, Elena. Con GeneLibro lo terminas, y con Libroseller el mundo lo lee.', voice: 'marisol' }
    ]
  },
  {
    title: 'Escribir de nuevo', summary: 'Elena escribe su libro con GeneLibro durante treinta días y lo publica en Libroseller.',
    location: 'Sala modesta de noche y al amanecer', wardrobe: 'Elena cárdigan beige',
    cast: ['elena'],
    beats: [
      { title: 'Elena abre el portátil de noche', camera: 'Primer plano',
        prompt: `Night, close-up of ${ELENA_HOME} sitting in front of a laptop in a dim living room. The cool glow of the screen lights her face; the screen itself is not visible. She takes a breath and begins to type with a small, determined expression. ${STYLE}`,
        line: 'Esa misma noche abrí GeneLibro. Por primera vez en meses, no tuve miedo.', voice: 'elena' },
      { title: 'Manos escribiendo junto al cuaderno', camera: 'Plano detalle',
        prompt: `Close-up of a woman's hands typing on a laptop keyboard next to an open handwritten notebook and a cup of coffee. Shallow depth of field, warm lamp light mixing with the cool screen glow. No readable text. ${STYLE}`,
        line: 'Le conté mi vida, y me ayudó a ordenar cada capítulo.', voice: 'elena' },
      { title: 'Pasan los días hasta el amanecer', camera: 'Plano fijo',
        prompt: `Static shot of a small living-room window as the light slowly changes from night to a golden sunrise, while ${ELENA_HOME} keeps working at a laptop by the window and empty coffee cups gather on the table. ${STYLE}`,
        line: 'Treinta días. Treinta amaneceres escribiendo.', voice: 'elena' },
      { title: 'Sostiene su primer libro impreso', camera: 'Primer plano medio',
        prompt: `Medium close-up of ${ELENA_HOME} holding a freshly printed paperback book with a plain minimalist cover and no readable title. She runs her fingers over the cover, eyes glistening, and smiles. Soft morning light. ${STYLE}`,
        line: 'Y un día lo tuve en mis manos: mi primer libro.', voice: 'elena' },
      { title: 'Un clic para publicar', camera: 'Plano macro',
        prompt: `Extreme close-up of a woman's finger hovering over a laptop trackpad, then clicking once. The screen glow reflects softly on her hand; the screen content is not visible. A quiet, relieved stillness. ${STYLE}`,
        line: 'Lo subí a Libroseller. Un clic… y respiré.', voice: 'elena' }
    ]
  },
  {
    title: 'Bestseller', summary: 'El libro se convierte en bestseller; firma de libros, abrazo con Marisol y cierre en la parada, ahora con sol.',
    location: 'Cocina de día, librería, parada de autobús soleada', wardrobe: 'Elena blusa burdeos elegante; Marisol blusa amarilla',
    cast: ['elena', 'marisol'],
    beats: [
      { title: 'El teléfono no para de vibrar', camera: 'Plano detalle',
        prompt: `Close-up of a smartphone lying face up on a wooden kitchen table in bright morning light, vibrating repeatedly as soft notification lights pulse; the screen content is blurred and unreadable. A cup of coffee beside it. ${STYLE}`,
        line: 'A la mañana siguiente, el teléfono no paraba.', voice: 'elena' },
      { title: 'Su libro en la mesa de novedades', camera: 'Travelling hacia la mesa',
        prompt: `Slow dolly shot in a warm independent bookstore toward a front display table with a neat tall stack of the same paperback with a plain minimalist cover and a small round gold sticker; no readable text or logos. Customers browse softly out of focus. ${STYLE}`,
        line: 'En tres semanas, mi libro estaba entre los más vendidos.', voice: 'elena' },
      { title: 'Firma de libros', camera: 'Plano medio',
        prompt: `Medium shot at a cozy bookstore signing table: ${ELENA_SUCCESS} signs a copy of her paperback and hands it to a smiling adult reader, while a short line of adult readers waits in soft focus. Warm light. She smiles with her mouth closed. ${STYLE}`,
        line: 'Gente que no conocía me decía que mi historia también era la suya.', voice: 'elena' },
      { title: 'Abrazo con Marisol', camera: 'Plano medio, cámara en mano suave',
        prompt: `Medium shot in the same warm bookstore: ${MARISOL} steps out of the crowd and the two friends embrace tightly, ${ELENA_SUCCESS} closing her eyes with gratitude. Warm golden light, gentle handheld camera. ${STYLE}`,
        line: 'Y Marisol estaba allí, en primera fila, como siempre.', voice: 'elena' },
      { title: 'La parada de autobús, ahora con sol', camera: 'Plano general, alejamiento lento',
        prompt: `Wide final shot of the same Santo Domingo city bus stop in bright sunshine after the rain, puddles reflecting a blue sky. ${ELENA_SUCCESS} stands holding her paperback book against her chest, looks up at the sky and smiles. Slow camera pull-back. ${STYLE}`,
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
