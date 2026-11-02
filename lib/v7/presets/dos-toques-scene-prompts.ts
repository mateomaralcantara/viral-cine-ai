/**
 * Prompts curados por toma (datos, no motor). Reglas aprendidas en E02:
 *  - Describir SOLO lo que aparece en el encuadre; nunca vestuario de personajes ausentes.
 *  - Describir a cada personaje siempre con la misma frase para mantener identidad sin foto.
 *  - Sin listas largas de prohibiciones ni instrucciones al sistema.
 */
const GABRIEL = 'Gabriel, a Dominican man in his early forties with short dark curly hair, light stubble and tired warm brown eyes, wearing a plain white button-up shirt';
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
  'E03-P08': `Medium side shot through the rain: ${GABRIEL}, soaked, sits down on the curb next to a blue motorcycle and hugs a small light-blue child's helmet against his chest, eyes closed, quietly grieving. His mouth stays closed. ${STYLE}`,
  'E03-P09': `Long wide shot of a rainy Dominican street at dusk. Rain falls on the asphalt and creates reflections. In the distance, ${GABRIEL} sits motionless on the curb beside a blue motorcycle. The camera is completely still. ${STYLE}`
};
