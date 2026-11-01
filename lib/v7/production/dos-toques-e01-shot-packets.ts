/**
 * DOS TOQUES DE BOCINA — E01 visual production packets.
 *
 * Canonical edit: P01=8s; P02..P07=7s (total 50s).
 * Provider output is 8s per paid request, independently trimmed for editing.
 * P01/P02 already exist: NEVER redispatch them.
 * No AI voices or synchronized dialogue are generated in this video-only phase.
 */
export const E01_FILM_ID = 'film-dos-toques-de-bocina-v7';
export const E01_PROVIDER_MODEL = 'veo-3.1-fast-generate-preview';
export const E01_VIDEO_SECONDS = 8;
export const E01_MODEL_RATE_USD_PER_SECOND = 0.10;
export const E01_ESTIMATE_USD = 0.80;
export type E01ShotId = 'E01-P01'|'E01-P02'|'E01-P03'|'E01-P04'|'E01-P05'|'E01-P06'|'E01-P07';
type Packet={id:E01ShotId;title:string;editSeconds:number;startSeconds:number;
  action:string;camera:string;voiceCharacter?:string;voiceLine?:string;
  continuity:string[];promptEnglish:string;existing:boolean};
const constants=[
  'Photoreal cinematic drama set in Dominican Republic at early golden dawn',
  'Same real-world Gabriel: Dominican father, worn muted blue shirt, blue old motorcycle, two children Daniel and Lucía in white/navy school uniforms',
  'School front with blue-and-cream walls, same sun direction, motorcycle color, facial identities and uniform geometry',
  'Absolutely exactly three people in this family, no duplicate children, no extra limbs, no teleportation',
  '16:9, realistic motion and body physics, no title cards, no subtitles, no logos'
].join('. ');

function wrap(action:string,camera:string) {
  return [constants,action,'Camera: '+camera,
    'Do not generate any spoken dialogue or artificial mouth talking. Clean ambient sound only; voices and horn motif will be mixed in postproduction.',
    'One continuous 8-second take. Avoid sudden cuts, facial swaps or costume changes.'].join('. ');
}
export const E01_SHOTS:readonly Packet[]=Object.freeze([
  {
    id:'E01-P01',title:'Llegada en motocicleta',editSeconds:8,startSeconds:0,
    action:'Gabriel llega con Daniel delante y Lucía detrás a la escuela.',
    camera:'Travelling lateral de llegada.',existing:true,
    continuity:['Casco Gabriel, casco Daniel, casco Lucía','Motor azul','Uniformes originales'],
    promptEnglish:'Approved existing P01. Do not submit again.'
  },
  {
    id:'E01-P02',title:'La moto se detiene',editSeconds:7,startSeconds:8,
    action:'Gabriel reduce velocidad, apoya un pie y apaga el motor; todos permanecen sentados.',
    camera:'Plano lateral continuo de aproximación a la acera.',existing:true,
    continuity:['Daniel delante de Gabriel','Lucía detrás','Nadie desmonta hasta P03'],
    promptEnglish:'Approved existing P02. Do not submit again.'
  },
  {
    id:'E01-P03',title:'Lucía entrega el dibujo',editSeconds:7,startSeconds:15,
    action:'Con la motocicleta ya detenida y apagada, Gabriel ayuda a los niños a bajarse. Lucía saca el dibujo doblado y se lo entrega.',
    camera:'Plano medio estable, detalle de manos y dibujo.',voiceCharacter:'LUCIA-ESDO-V1',
    voiceLine:'Para que no te olvides de nosotros en el trabajo.',existing:false,
    continuity:['Comenzar inmediatamente después de P02','Gabriel primero inmoviliza el motor','Cascos se quitan solo tras bajar','Dibujo de Lucía se conserva para P04'],
    promptEnglish:wrap(
      'Immediately after the motorcycle has stopped and the engine is off, Gabriel carefully stabilizes it with a firm foot and assists Daniel then Lucía to dismount safely onto the pavement. Children remain physically consistent with P01 and P02. Lucía retrieves a small folded hand-drawn picture from her backpack and silently hands it to her father, whose hands receive it gently. Both children are still close to him. Do not show anyone riding away',
      'Realistic medium three-shot transitioning into a natural close-up of Lucía handing over folded paper')
  },
  {
    id:'E01-P04',title:'La promesa de Gabriel',editSeconds:7,startSeconds:22,
    action:'Gabriel guarda el dibujo con cuidado y sonríe con emoción a sus dos hijos.',
    camera:'Primer plano de reacción y contraplano de los niños.',voiceCharacter:'GABRIEL-ESDO-V1',
    voiceLine:'No existe un día que yo pudiera olvidarme de ustedes.',existing:false,
    continuity:['Dibujo recibido en P03','Gabriel mantiene camisa azul','Misma escuela y hora','Sin labios hablando hasta añadir voz real'],
    promptEnglish:wrap(
      'Gabriel standing beside his safely parked blue motorcycle near the same school entrance delicately studies Lucía’s small folded drawing, stores it securely in his shirt pocket and looks warmly at Lucía and Daniel. Both schoolchildren stand safely beside him, looking at their father with affectionate expressions. Natural tears barely gathering, authentic restrained emotion. No invented people. No talking mouth movement',
      'Subtle 50mm shoulder close-up on Gabriel, gentle reaction shot toward his two schoolchildren')
  },
  {
    id:'E01-P05',title:'La broma de Daniel',editSeconds:7,startSeconds:29,
    action:'Daniel sonríe y señala juguetonamente el viejo motor; Gabriel y Lucía se ríen.',
    camera:'Plano americano de tres cuartos.',voiceCharacter:'DANIEL-ESDO-V1',
    voiceLine:'Papi, ese motor suena como una lata.',existing:false,
    continuity:['Tres personajes junto al mismo motor apagado','Dibujo sigue guardado','Daniel mantiene apariencia y edad','Sin boca parlante sin voz'],
    promptEnglish:wrap(
      'Daniel, the same helmet-off Dominican schoolboy from the previous shot, playfully points at the old blue motorcycle’s slightly worn engine while sharing a tender family joke with his father Gabriel and sister Lucía. Gabriel responds with an affectionate chuckle and Lucía beams warmly. All remain next to the stationary parked motorcycle. Realistic hand movements, no walking into traffic, no mouth speaking',
      'Medium three-quarter American shot, gentle handheld cinematography, authentic restrained comedy')
  },
  {
    id:'E01-P06',title:'Los niños se despiden',editSeconds:7,startSeconds:36,
    action:'Daniel y Lucía se dirigen a la puerta de la escuela y se giran para despedirse.',
    camera:'Travelling suave desde la espalda de Gabriel.',existing:false,
    continuity:['Gabriel se queda junto al motor estacionado','Ambos niños caminan juntos','Mismo uniforme','Puerta azul y crema'],
    promptEnglish:wrap(
      'Daniel and Lucía, the same two Dominican schoolchildren wearing the same white shirts and navy uniform bottoms as earlier, walk together safely on the pedestrian pavement toward the blue and cream school entrance. A few paces later both children turn back at the same moment and wave tenderly to their father. Gabriel stays next to his securely parked blue motorcycle, waving back. No extra family members, preserve identical clothing and school geography',
      'Smooth tracking shot from behind Gabriel toward the children walking into the school gate')
  },
  {
    id:'E01-P07',title:'Dos toques de bocina',editSeconds:7,startSeconds:43,
    action:'Gabriel acciona suavemente dos veces la bocina; los niños responden saludando.',
    camera:'Plano detalle del manillar y contraplano de los niños.',existing:false,
    continuity:['Gabriel permanece estacionado','Dos bocinazos se añadirán en posproducción','Los niños responden de lejos','Cerrar en 50 segundos'],
    promptEnglish:wrap(
      'Gabriel remains stopped next to the same blue motorcycle near the school. His hand gently taps the motorcycle horn button exactly twice. Farther away at the blue and cream school gate, Daniel and Lucía recognize their family signal, turn back and wave warmly with both children fully recognizable. No motorcycle driving away in this shot. The actual two horn sounds will be added in sound postproduction and need not exist in video audio',
      'Cinematic insert close-up of handlebar horn switch followed by a believable eyeline cut to the two children at the school gate')
  }
]);
export function e01ShotById(id:string) {return E01_SHOTS.find(s=>s.id===id);}
export function e01EditDuration(){return E01_SHOTS.reduce((sum,s)=>sum+s.editSeconds,0);}
