/**
 * Prompts curados por toma (datos, no motor). Reglas aprendidas en E02:
 *  - Describir SOLO lo que aparece en el encuadre; nunca vestuario de personajes ausentes.
 *  - Describir a cada personaje siempre con la misma frase para mantener identidad sin foto.
 *  - Sin listas largas de prohibiciones ni instrucciones al sistema.
 *  - Evitar palabras que un filtro pueda leer como sensibles ("child's", "soaked",
 *    "grieving", "motionless"): E03-P08/P09 fallaron con ellas y salieron sin ellas.
 */
/** Rostro fijo de Gabriel (el que funcionó en E03); el vestuario cambia por escena. */
const GABRIEL_FACE = 'Gabriel, a Dominican man in his early forties with short dark curly hair, light stubble and tired warm brown eyes';
const GABRIEL = GABRIEL_FACE + ', wearing a plain white button-up shirt';
/** E04: vestuario de trabajo según la biblia de producción. */
const GABRIEL_RIDER = GABRIEL_FACE + ', wearing an old yellow rain jacket, a black open-face motorcycle helmet and a worn backpack';
const DANIEL = 'Daniel, an eleven-year-old Dominican boy with big dark eyes and short curly hair';
const CAMILA_DRIVING = 'Camila, a Dominican woman in her late thirties with long wavy dark brown hair, wearing a simple elegant cream blouse';
const STREET = 'a busy street in Santo Domingo, Dominican Republic, on a grey afternoon with light rain';
const MOTO = 'an old dark-blue motorcycle with a patched seat';
const SUV = 'a dark modern SUV with tinted windows and no visible logos or brand marks';
const CAMILA = 'Camila, a Dominican woman in her late thirties with long wavy dark brown hair, wearing a neutral beige blouse';
const COURT = 'a modest fictional family courthouse in the Dominican Republic on a rainy afternoon';
const STYLE = 'Realistic, restrained, cinematic drama, natural soft light, 16:9.';

export const DOS_TOQUES_SCENE_PROMPTS: Readonly<Record<string, string>> = {
  'E03-P01': `Wide symmetrical shot of a quiet corridor in ${COURT}. ${GABRIEL} sits alone on a wooden bench, shoulders slightly hunched, staring at the floor. Rain streaks the tall windows. The camera stays still with a very slow push-in. No other people. ${STYLE}`,
  'E03-P02': `Extreme close-up of a man's hands in the cuffs of a plain white shirt, holding a stack of worn, folded papers. His thumbs slowly rub the creased edges and the hands tremble slightly. Soft grey window light from rainy weather. Shallow depth of field, no readable text. ${STYLE}`,
  'E03-P03': `Medium close-up of ${CAMILA}, sitting on a distant bench in a courthouse corridor. She silently watches someone off-screen with restrained pain, then lowers her eyes. Rain-filtered window light. Only Camila is in the frame. Very slow camera drift. ${STYLE}`,
  'E03-P04': `Detail shot of a closed beige case folder resting on a dark wooden judge's desk in a small courtroom, next to a pen and a glass of water. Rain-filtered grey light. Any printed text is blurred and unreadable. The camera slowly glides closer. No people visible. ${STYLE}`,
  'E03-P05': `Close-up of a man's hands in a plain white shirt slowly signing a document with a cheap ballpoint pen on a wooden table. The hand pauses, hesitates, then finishes the signature. The document text is blurred and unreadable. Quiet, heavy atmosphere. ${STYLE}`,
  'E03-P06': `Tracking shot from behind: ${GABRIEL} walks slowly out of the courthouse doors with sunken shoulders into heavy tropical rain. The camera follows a few steps behind at shoulder height. Wet steps and a grey street ahead. ${STYLE}`,
  'E03-P07': `Cinematic detail shot of a small light-blue child's helmet, wet with rain, hanging from the handlebar of a parked blue motorcycle on a Dominican street. Raindrops roll off the helmet. Shallow depth of field, reflections on the wet asphalt. No people. ${STYLE}`,
  'E03-P08': `Medium side shot in light rain: ${GABRIEL}, sits down on the curb next to a blue motorcycle and holds a small light-blue helmet close to his chest, eyes closed, quiet and reflective. His mouth stays closed. Slow motion. ${STYLE}`,
  'E03-P09': `Long wide shot of a quiet Dominican street at dusk in light rain, with reflections on the wet asphalt. In the distance, ${GABRIEL} sits still on the curb beside a blue motorcycle. The camera is completely static. ${STYLE}`,

  // E04 · El motoconcho (8 tomas, 60 s)
  'E04-P01': `Wide urban shot of ${STREET}. ${GABRIEL_RIDER} waits beside ${MOTO} at a motorcycle-taxi stop, next to a few other riders with their bikes in the background. Light traffic passes. Static camera. ${STYLE}`,
  'E04-P02': `Lateral tracking shot following ${MOTO} as it pulls away from the curb in light rain. ${GABRIEL_RIDER} rides carefully with an adult passenger seated behind him. Wet asphalt reflects the city lights. ${STYLE}`,
  'E04-P03': `Macro close-up of a man's rough, weathered hands, sleeves of an old yellow rain jacket visible, slowly counting a few wet coins and folded small bills in his palm. Raindrops on the skin. Shallow depth of field. ${STYLE}`,
  'E04-P04': `Medium wide shot on a street outside a school at pickup time: ${GABRIEL_RIDER} slows ${MOTO} and stops beside ${SUV} waiting in traffic. He glances at the vehicle's rear window. Gentle rain, no readable signs. ${STYLE}`,
  'E04-P05': `Close-up through the rain-speckled rear side window of ${SUV}: ${DANIEL}, sitting in the back seat wearing a school uniform, recognizes someone outside. His eyes widen and he slowly presses his open hand against the glass. Soft reflections on the window. His mouth stays closed. ${STYLE}`,
  'E04-P06': `Wide static reverse shot from the sidewalk: ${GABRIEL_RIDER} sits still on ${MOTO} and slowly raises one hand in a quiet greeting while ${SUV} pulls away down the wet street. ${STYLE}`,
  'E04-P07': `Detail shot of the interior rear-view mirror of a car, reflecting the eyes of ${CAMILA_DRIVING} as she glances back briefly with a conflicted expression, then looks forward again and keeps driving. Rain on the windshield. ${STYLE}`,
  'E04-P08': `Extreme close-up of a man's thumb, sleeve of an old yellow rain jacket visible, slowly moving toward the horn button on the handlebar of ${MOTO}. The thumb hovers over the button and stops without pressing it. Raindrops on the handlebar, total stillness. ${STYLE}`
};
