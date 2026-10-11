import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {E02_FILM_ID,E02_SHOTS} from '@/lib/v7/production/dos-toques-e02-shot-packets';

export const E02_REFERENCE_BUCKET='viralcine-scene-references';
export const E02_REFERENCE_SCENE='E02';
export const E02_REFERENCE_MAX_UPLOAD=4000000;
export type E02ApprovedReference={
 shotId:string;approved:boolean;readyForScene:boolean;status:'ready';
 sha256:string;storagePath:string;
};
export type E02ReferenceBoard={
 ok:true;configured:boolean;approvedCount:number;requiredCount:7;
 referencesReady:boolean;generationQueueEnabled:boolean;
 shots:Record<string,{approved:boolean;readyForScene:boolean;sha256?:string;storagePath?:string}>;
};

function config(){
 const url=(process.env.SUPABASE_URL||
  process.env.NEXT_PUBLIC_SUPABASE_URL||'').trim().replace(/\/$/,'');
 const secret=(process.env.SUPABASE_SERVICE_ROLE_KEY||
  process.env.SUPABASE_SECRET_KEY||'').trim();
 if(!url||!secret)throw new Error('Supabase Storage no está configurado en el servidor: falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
 const target=new URL(url);
 if(target.protocol!=='https:'||!/^https:\/\/[^/]+\.supabase\.co$/.test(url))
  throw new Error('URL de Supabase inválida.');
 return {url,secret};
}
export function e02CloudConfigured(){
 try{config();return true;}catch{return false;}
}
async function supabase(pathname:string,init:RequestInit){
 const {url,secret}=config();
 // Supabase JWT service-role keys use Authorization: Bearer. New sb_secret_
 // keys authenticate via apikey; they are NOT valid JWT bearer tokens.
 return fetch(url+pathname,{...init,headers:{
  apikey:secret,
  ...(secret.startsWith('eyJ')?{Authorization:'Bearer '+secret}:{}),
  ...(init.headers||{})},cache:'no-store',signal:AbortSignal.timeout(30000)});
}
function assertShot(id:string){
 if(!E02_SHOTS.some(s=>s.id===id))throw Error('La toma debe estar entre E02-P01 y E02-P07.');
}
function objectPath(id:string,hash:string){
 return E02_FILM_ID+'/e02/'+id.toLowerCase()+'/'+hash+'.jpg';
}
export async function approvedE02References():Promise<E02ReferenceBoard>{
 const shots:E02ReferenceBoard['shots']=Object.fromEntries(E02_SHOTS.map(s=>[s.id,
  {approved:false,readyForScene:false}]));
 if(!e02CloudConfigured())return {ok:true,configured:false,approvedCount:0,
  requiredCount:7,referencesReady:false,generationQueueEnabled:false,shots};
 const params=new URLSearchParams({
  select:'shot_id,approved,status,sha256,storage_path,active',
  film_id:'eq.'+E02_FILM_ID,
  scene_id:'eq.'+E02_REFERENCE_SCENE,active:'eq.true'});
 const response=await supabase('/rest/v1/scene_reference_images?'+params.toString(),{method:'GET'});
 if(!response.ok)throw Error('No se pudo consultar las referencias en Supabase (HTTP '+response.status+').');
 const records=await response.json() as Array<{
  shot_id:string;approved:boolean;status:string;sha256:string;storage_path:string;active:boolean
 }>;
 for(const ref of records){
  if(!(ref.shot_id in shots))continue;
  shots[ref.shot_id]={
   approved:ref.approved===true,readyForScene:ref.approved===true&&ref.status==='ready'&&ref.active,
   sha256:ref.sha256,storagePath:ref.storage_path
  };
 }
 const count=Object.values(shots).filter(s=>s.readyForScene).length;
 return {ok:true,configured:true,approvedCount:count,requiredCount:7,
  referencesReady:count===7,generationQueueEnabled:count===7,shots};
}

export async function uploadAndApproveE02Reference(id:string,bytes:Buffer,filename:string){
 assertShot(id);
 if(bytes.length<3000||bytes.length>E02_REFERENCE_MAX_UPLOAD)
  throw Error('Fotografía fuera del límite de 3 KB a 4 MB.');
 if(!filename||filename.length>240)throw Error('Nombre de archivo inválido.');
 // Detect supported image formats by decoder rather than trusting request MIME.
 const img=sharp(bytes,{failOn:'error',limitInputPixels:25000000});
 const meta=await img.metadata();
 if(!['jpeg','png','webp'].includes(meta.format||'')||
  (meta.width||0)<640||(meta.height||0)<360)
  throw Error('Se requiere fotografía JPG, PNG o WebP de al menos 640 × 360.');
 const normalized=await img.rotate()
  .resize(1280,720,{fit:'cover',position:'attention'})
  .jpeg({quality:88}).toBuffer();
 if(normalized.length<3000||normalized.length>2500000)
  throw Error('El JPG convertido no cumple los límites del almacenamiento.');
 const hash=createHash('sha256').update(normalized).digest('hex');
 const key=objectPath(id,hash);
 const storagePath='/storage/v1/object/'+E02_REFERENCE_BUCKET+'/'+
  key.split('/').map(encodeURIComponent).join('/');
 const put=await supabase(storagePath,{method:'POST',headers:{
  'Content-Type':'image/jpeg','Cache-Control':'31536000','x-upsert':'false'},
  body:new Uint8Array(normalized)});
 if(!put.ok&&put.status!==409)
  throw Error('No se pudo guardar la imagen en Supabase Storage (HTTP '+put.status+').');
 // Protect against falsely approving references that never reached Storage.
 const head=await supabase('/storage/v1/object/authenticated/'+E02_REFERENCE_BUCKET+'/'+
  key.split('/').map(encodeURIComponent).join('/'),{method:'HEAD'});
 if(!head.ok)throw Error('Supabase todavía no confirma el archivo (HTTP '+head.status+').');
 const result=await supabase('/rest/v1/rpc/v8_save_approved_e02_reference',
  {method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({
    p_film_id:E02_FILM_ID,p_scene_id:E02_REFERENCE_SCENE,p_shot_id:id,
    p_bucket:E02_REFERENCE_BUCKET,p_path:key,p_filename:filename,
    p_mime:'image/jpeg',p_bytes:normalized.length,p_sha256:hash,
    p_width:1280,p_height:720
   })});
 if(!result.ok)throw Error('Imagen guardada, pero no aprobada en Supabase (HTTP '+result.status+').');
 const ref=await result.json() as {
  approved?:boolean;readyForScene?:boolean;referenceCoverage?:number;
  sceneReady?:boolean;storagePath?:string;sha256?:string
 };
 if(!ref.approved||!ref.readyForScene||ref.sha256!==hash)
  throw Error('Supabase no confirmó la aprobación automática.');
 return {ok:true,shotId:id,approved:true,readyForScene:true,
  status:'ready',approvalMode:'auto-on-upload',storageBucket:E02_REFERENCE_BUCKET,
  storagePath:key,sha256:hash,referenceCoverage:ref.referenceCoverage??0,
  sceneReady:ref.sceneReady===true,additionalSpendUsd:0,newGenerationRequests:0};
}
export async function getApprovedE02Image(id:string):Promise<{bytes:Buffer;hash:string}|null>{
 assertShot(id);
 if(!e02CloudConfigured())return null;
 const board=await approvedE02References();
 const current=board.shots[id];
 if(!current?.readyForScene||!current.storagePath||!current.sha256)return null;
 const endpoint='/storage/v1/object/authenticated/'+E02_REFERENCE_BUCKET+'/'+
  current.storagePath.split('/').map(encodeURIComponent).join('/');
 const response=await supabase(endpoint,{method:'GET'});
 if(!response.ok)throw Error('La referencia aprobada no existe en Storage (HTTP '+response.status+').');
 const bytes=Buffer.from(await response.arrayBuffer());
 if(createHash('sha256').update(bytes).digest('hex')!==current.sha256)
  throw Error('La fotografía almacenada no coincide con el hash aprobado.');
 return {bytes,hash:current.sha256};
}
