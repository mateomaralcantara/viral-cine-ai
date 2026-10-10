import {createHash} from 'node:crypto';
import {createDosToquesBundle} from '@/lib/v7/presets/dos-toques-de-bocina';
export const E02_FILM_ID='film-dos-toques-de-bocina-v7';
export const E02_DURATION_SECONDS=55;
export const E02_RUNWAY_RATE=0.05;
export const E02_RUNWAY_SECONDS=10;
export const E02_COST_PER_SHOT=0.50;
export const E02_MAX_USD=3.50;
export const E02_EDIT_SECONDS=[8,8,8,8,8,8,7] as const;
const canon=(()=>{
 const film=createDosToquesBundle().film;
 const scenes=film.acts.flatMap(a=>a.sequences.flatMap(q=>q.scenes))
   .sort((a,b)=>a.timeIndex-b.timeIndex);
 const scene=scenes[1];
 if(!scene||scene.shots.length!==7||scene.durationSeconds!==55)
  throw Error('E02 no coincide con el guion oficial (7 tomas, 55 segundos).');
 return scene;
})();
export const E02_SCENE_ID=canon.id;
export const E02_SCENE_NAME=canon.title;
type Shot={id:string;shotId:string;title:string;action:string;camera:string;
 dialog:string|null;voiceCode:string|null;editSeconds:number;prompt:string;promptHash:string};
const moves=[
 'A restrained cinematic insert of three used plates at a modest Dominican family dining table. Two smaller plates remain untouched. Late afternoon warm light, quiet atmosphere, realistic interior of the family house. Subtle slow push-in, no people, no text.',
 'Camila, a Dominican mother wearing a pale blouse, silently closes a travel suitcase in the modest house. She holds back tears. Warm window backlight, reserved emotional acting, natural close-up and medium shot. Keep layout and colors consistent with first shot.',
 'Victoria in an elegant cream suit stands still near the same doorway with a suitcase, composed and solemn. Subtle camera motion, believable anatomy, same modest Dominican interior and evening light; no people duplicated.',
 'Gabriel Santos, the same Dominican father seen in E01, wearing his work delivery uniform and holding a black motorcycle helmet, steps inside the modest house and notices a suitcase. Shocked but restrained, believable reaction, late afternoon lighting, no speech.',
 'Camila notices a framed photograph of the family on a shelf and turns away, struggling to hide her grief. Match previous Camila pale blouse, same familiar home interior and warm light. Cinematic intimate emotional close-up, no words.',
 'The front door of the family home slowly closes. Gabriel remains alone in the quiet hallway holding his helmet, framed from a still wide camera. Realistic subdued sadness, consistent wardrobe, no text and no spoken lines.',
 'Gabriel silently places two small untouched plates on the dining table. His tired hands move slowly; the long evening shadow falls across the table. Tender close-up of hands, no other people, no text.'
];
const voices=[null,{name:'CAMILA-ESDO-V1',line:'No puedo seguir viviendo con la incertidumbre. Los niños se vienen conmigo.'},
{name:'VICTORIA-ESDO-V1',line:'Necesitan estabilidad, Gabriel. No promesas.'},
{name:'GABRIEL-ESDO-V1',line:'Si tú no quieres estar conmigo, yo no puedo obligarte. Pero soy su papá.'},
{name:'CAMILA-ESDO-V1',line:'Yo sé que los amas.'},
{name:'GABRIEL-ESDO-V1',line:'Entonces diles que no he dejado de esperarlos.'},null] as const;
export const E02_SHOTS:readonly Shot[]=canon.shots.slice().sort((a,b)=>a.order-b.order).map((shot,i)=>{
 const prefix='Film: DOS TOQUES DE BOCINA. Scene 2: La casa en silencio. Dominican Republic, modest home, late afternoon. Visual-only 16:9 720p 10-second cinematic take, serious family drama, consistent identity and setting. No subtitles, dialogue, music, lip-synced speech or watermarks. ';
 const prompt=prefix+moves[i];
 return {id:'E02-P'+String(i+1).padStart(2,'0'),shotId:shot.id,title:shot.title,
  action:shot.description??moves[i],camera:['Static detail','Backlit medium','Side medium',
  'Slow push-in','Reaction close-up','Locked wide','Hands close-up'][i],
  dialog:voices[i]?.line??null,voiceCode:voices[i]?.name??null,
  editSeconds:E02_EDIT_SECONDS[i],prompt,
  promptHash:createHash('sha256').update(prompt).digest('hex')};
});
export function e02Shot(id:string){return E02_SHOTS.find(s=>s.id===id);}
