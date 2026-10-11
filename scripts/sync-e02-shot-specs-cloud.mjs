#!/usr/bin/env node
// ViralCine V8 E02: import 7 ORIGINAL V7 shot specifications, zero Runway calls.
// Node built-ins only. No local write. --apply calls service-role-only Supabase RPC.
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';

const FILM='film-dos-toques-de-bocina-v7';
const PROJECT='wrxeerltoapvybhaxlmu';
const IDS=Array.from({length:7},(_,n)=>'E02-P0'+(n+1));
const sha=(x)=>createHash('sha256').update(x).digest('hex');
const text=(x)=>typeof x==='string'?x.trim().replace(/\s+/g,' '):'';
const isFile=async p=>{try{return (await stat(p)).isFile();}catch(e){if(e?.code==='ENOENT')return false;throw e;}};
function roots(){
 const h=os.homedir();
 return [...new Set([process.env.V8_E02_DATA_ROOT,process.env.VIRALCINE_DATA_DIR,
  path.join(process.cwd(),'.data'),
  path.join(h,'Desktop','VSC','BestS','viral-cine-v7-integration','.data'),
  path.join(h,'Desktop','VSC','BestS','viral-cine-v7-cinema-core','.data'),
  path.join(h,'Desktop','VSC','BestS','viral-cine-ai','.data'),
  'C:\\Users\\martin\\Desktop\\VSC\\BestS\\viral-cine-v7-integration\\.data'
 ].filter(Boolean))];
}
async function bundleLocation(){
 const paths=roots().map(r=>path.join(r,'v7','films',FILM,'bundle.json'));
 for(const p of paths)if(await isFile(p))return p;
 throw Error('No existe el bundle.json original. Buscado: '+paths.join(' | ')+'. Sin escrituras.');
}
function collectShots(bundle){
 if(bundle?.film?.id!==FILM||!Array.isArray(bundle?.film?.acts))
  throw Error('El bundle no corresponde a la película V7 requerida.');
 // V7 uses internally-generated shot IDs; E02-P01...P07 are V8 slot aliases.
 const all=[];
 const ordered=(v)=>[...(v||[])].sort((a,b)=>Number(a?.order||0)-Number(b?.order||0));
 for(const act of ordered(bundle.film.acts))
  for(const seq of ordered(act.sequences))
   for(const scene of ordered(seq.scenes))all.push({scene,act,seq});
 const outline=all.map((entry,i)=>
  '#'+(i+1)+' sceneId='+String(entry.scene.id)+
  ' order='+String(entry.scene.order)+
  ' shots='+String(entry.scene.shots?.length??0)).join(' | ');
 const exact=new Map();
 for(const {scene} of all)for(const shot of scene.shots||[]){
  if(!IDS.includes(shot?.id))continue;
  if(exact.has(shot.id))throw Error('ID V8 duplicado dentro del bundle: '+shot.id);
  exact.set(shot.id,shot);
 }
 if(exact.size===7)return IDS.map(id=>exact.get(id));
 if(exact.size>0)throw Error('Identificadores E02 parciales: '+[...exact.keys()].join(', ')+
  '. No se mezcla orden con identificadores; escenas V7: '+outline);
 const explicit=all.filter(({scene})=>scene.id==='E02');
 if(explicit.length>1)throw Error('Varias escenas E02; la correspondencia no es única.');
 const source=explicit.length?explicit[0]:all[1];
 if(!source||(!explicit.length&&Number(source.scene.order)!==2))
  throw Error('No se identificó inequívocamente la segunda escena V7. Escenas: '+outline);
 const scenesShots=source.scene.shots;
 if(!Array.isArray(scenesShots)||scenesShots.length!==7)
  throw Error('La segunda escena original no tiene exactamente 7 tomas. Escenas: '+outline);
 const shots=ordered(scenesShots);
 const orders=shots.map(x=>Number(x?.order));
 if(orders.some((order,i)=>order!==i+1))
  throw Error('Las 7 tomas no tienen orden 1..7 único. Escenas: '+outline);
 const ids=shots.map(x=>x?.id);
 if(ids.some(id=>typeof id!=='string'||!id.trim())||new Set(ids).size!==7)
  throw Error('Identificadores originales ausentes o duplicados.');
 if(shots.some(x=>x.sceneId&&x.sceneId!==source.scene.id))
  throw Error('Una toma apunta a otra escena distinta de '+source.scene.id);
 console.log('MAPEO ORIGINAL V7 -> E02 (por orden inequívoco):');
 for(let i=0;i<7;i++)console.log(IDS[i]+' <= toma V7 '+shots[i].id+
  ' (orden '+shots[i].order+')');
 return shots;
}
function sourcePrompt(shot){
 const m=shot.motionSpec&&typeof shot.motionSpec==='object'?shot.motionSpec:{};
 const fields=[['Movimiento corporal',m.bodyMotion],['Movimiento de cámara',m.cameraMotion],
  ['Movimiento del entorno',m.environmentMotion],['Estado inicial',m.startState],
  ['Estado final',m.endState],['Cámara',shot.camera],
  ['Intención',shot.intention],['Descripción visual',shot.visualPrompt]];
 const parts=[],seen=new Set();let size=0;
 for(const [label,value] of fields){
  const v=text(value);if(!v||seen.has(v.toLowerCase()))continue;
  const part=label+': '+v;
  if(size+part.length+(parts.length?2:0)>1000)continue;
  parts.push(part);seen.add(v.toLowerCase());size+=part.length+(parts.length>1?2:0);
 }
 const prompt=parts.join('\n\n');
 if(prompt.length<15||prompt.length>1000)
  throw Error(shot.id+': faltan instrucciones originales utilizables (15-1000 caracteres).');
 return prompt;
}
function getSpecs(bundle){
 return collectShots(bundle).map((shot,index)=>{
  const original=Number(shot.durationSeconds);
  if(!Number.isFinite(original)||original<=0||original>10)
   throw Error(IDS[index]+' (V7 '+shot.id+'): duración original no representable en 5/10 s: '+shot.durationSeconds);
  return {id:IDS[index],sourceV7ShotId:shot.id,sourceSha:sha(Buffer.from(JSON.stringify(shot),'utf8')),
   original,runwayDuration:original<=5?5:10,
   prompt:sourcePrompt(shot),originalShot:shot};
 });
}
function parseEnv(raw){
 const vars={};
 for(const line of raw.split(/\r?\n/)){
  const m=line.match(/^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*)$/);if(!m)continue;
  let v=m[2].trim();
  if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);
  else v=v.replace(/\s+#.*$/,'');
  vars[m[1]]=v;
 }return vars;
}
async function config(){
 const dirs=[...new Set([process.cwd(),...roots().map(r=>path.dirname(r))])];
 const vars={};
 for(const dir of dirs)for(const name of ['.env','.env.local']){
  const f=path.join(dir,name);if(await isFile(f))Object.assign(vars,parseEnv(await readFile(f,'utf8')));
 }
 Object.assign(vars,process.env);
 const key=['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE','V7_SUPABASE_SERVICE_ROLE_KEY']
  .map(k=>vars[k]).find(v=>typeof v==='string'&&v.trim())?.trim();
 if(!key||key.startsWith('sb_anon_')||key.startsWith('sb_publishable_'))
  throw Error('Se necesita la clave privada Supabase existente en .env.local; no se imprimirá.');
 const url=(vars.SUPABASE_URL||vars.NEXT_PUBLIC_SUPABASE_URL||
  'https://'+PROJECT+'.supabase.co').trim().replace(/\/$/,'');
 if(url!=='https://'+PROJECT+'.supabase.co')throw Error('Proyecto Supabase incorrecto.');
 return {key,url};
}
function makeAPI({key,url}){
 return async (route,method='GET',body)=>{
  const headers={apikey:key,Authorization:'Bearer '+key};
  if(body!==undefined)headers['Content-Type']='application/json';
  const r=await fetch(url+route,{method,headers,
   ...(body===undefined?{}:{body:JSON.stringify(body)}),
   signal:AbortSignal.timeout(30000),cache:'no-store'});
  if(!r.ok)throw Error('Supabase '+r.status+' '+route.split('?')[0]+': '+
   (await r.text()).slice(0,220).replace(/[\r\n]/g,' '));
  return r.json();
 };
}
async function synchronize(api,specs){
 const q=new URLSearchParams({select:'shot_id,sha256,approved,active,status',
  film_id:'eq.'+FILM,scene_id:'eq.E02',active:'eq.true'});
 const refs=await api('/rest/v1/scene_reference_images?'+q);
 if(!Array.isArray(refs)||refs.length!==7||new Set(refs.map(r=>r.shot_id)).size!==7||
  !refs.every(r=>IDS.includes(r.shot_id)&&r.approved===true&&r.active===true&&r.status==='ready'))
   throw Error('Supabase no confirma las siete fotos aprobadas; no se escribió ninguna instrucción.');
 const hashes=new Map(refs.map(r=>[r.shot_id,r.sha256]));
 let errors=0;
 for(const s of specs){
  try{
   const result=await api('/rest/v1/rpc/v8_sync_e02_original_shot_spec','POST',{
    p_shot_id:s.id,p_reference_sha256:hashes.get(s.id),p_source_sha256:s.sourceSha,
    p_original_shot:s.originalShot,p_prompt_text:s.prompt,
    p_original_duration_seconds:s.original,p_runway_duration_seconds:s.runwayDuration
   });
   if(result?.synced!==true||result?.sourceSha256!==s.sourceSha||
      result?.paidCallExecuted!==false)throw Error('Respuesta RPC no verificable');
   console.log(s.id+': GUARDADA | original '+s.original+' s / Runway '+s.runwayDuration+' s | US$0');
  }catch(e){errors++;console.error(s.id+': ERROR '+String(e?.message||e));}
 }
 const qr=new URLSearchParams({select:'shot_id,source_sha256,reference_sha256,runway_duration_seconds',
  film_id:'eq.'+FILM,scene_id:'eq.E02'});
 const saved=await api('/rest/v1/v8_e02_shot_specs?'+qr);
 const rows=new Map(saved.map(r=>[r.shot_id,r]));
 const count=specs.filter(s=>rows.get(s.id)?.source_sha256===s.sourceSha&&
  rows.get(s.id)?.reference_sha256===hashes.get(s.id)&&
  rows.get(s.id)?.runway_duration_seconds===s.runwayDuration).length;
 console.log('GUIONES ORIGINALES VERIFICADOS EN SUPABASE: '+count+' / 7');
 if(count!==7||errors)throw Error('Sincronización incompleta. Se puede reintentar sin pagar ni duplicar.');
}
async function main(){
 const apply=process.argv.includes('--apply');
 console.log('=== VIRALCINE E02 — GUION ORIGINAL / 7 TOMAS ===');
 console.log('RUNWAY NO | AVATARES NO | CRÉDITOS USD 0');
 const source=await bundleLocation();
 const specs=getSpecs(JSON.parse(await readFile(source,'utf8')));
 for(const s of specs)console.log(s.id+' | original '+s.original+' s -> Runway '+s.runwayDuration+
  ' s | '+s.prompt.length+' caracteres de instrucciones');
 console.log('Fuente verificada: '+source);
 if(!apply){console.log('LECTURA OK. Para guardar usar --apply.');return;}
 await synchronize(makeAPI(await config()),specs);
 console.log('ESCENA 02: 7/7 INSTRUCCIONES GUARDADAS. NUEVOS RENDERS BLOQUEADOS.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 void main().catch(e=>{console.error('ERROR: '+String(e?.message||e));process.exitCode=1;});
export {collectShots,sourcePrompt,getSpecs,parseEnv};
