import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {execFile} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,writeFile,rename,open,unlink,stat,link} from 'node:fs/promises';
import {promisify} from 'node:util';
import path from 'node:path';
import {v7FilmRoot} from '@/lib/v7/storage/film-store';
import {E01_FILM_ID,E01_SHOTS,e01ShotById} from '@/lib/v7/production/dos-toques-e01-shot-packets';
import {resolveV7ShotVideo} from '@/lib/v7/production/shot-video-source';

const command=promisify(execFile);
export const RUNWAY_MODEL='gen4_turbo';
export const RUNWAY_DURATION=10;
export const RUNWAY_RATE_USD_PER_SEC=0.05;
export const RUNWAY_SHOT_USD=0.50;
export const RUNWAY_MAX_SCENE_USD=2.50;
const headerVersion='2024-11-06';
const base='https://api.dev.runwayml.com/v1';
export type RunwayRecord={
 schemaVersion:1; filmId:string;shotId:string;provider:'runway';model:'gen4_turbo';
 status:'reserved'|'submitted'|'processing'|'review-required'|'failed-unknown';
 taskId?:string;candidateName?:string;referenceShotId:string;referenceSha256:string;
 referenceImageName:string;promptHash:string;promptText:string;
 durationSeconds:10;estimatedUsd:0.5;
 createdAt:string;updatedAt:string;error?:string;
};
function filmDir(){return v7FilmRoot(E01_FILM_ID);}
function shotDir(id:string){return path.join(filmDir(),id.toLowerCase());}
export function runwayRecordPath(id:string){
 return path.join(shotDir(id),'runway-gen4-turbo-operation.json');
}
export function runwayCandidatePath(id:string){
 return path.join(shotDir(id),id+'-runway-gen4-turbo.mp4');
}
function sha(input:string|Buffer){return createHash('sha256').update(input).digest('hex');}
async function hashFile(file:string){
 const digest=createHash('sha256');
 for await(const chunk of createReadStream(file))digest.update(chunk as Buffer);
 return digest.digest('hex');
}
function validShot(id:string){
 const packet=e01ShotById(id);
 if(!packet||packet.existing)throw new Error('Solo P03-P07 están habilitadas para Runway.');
 return packet;
}
export async function readRunwayRecord(id:string):Promise<RunwayRecord|null>{
 validShot(id);
 try{
  const r=JSON.parse(await readFile(runwayRecordPath(id),'utf8')) as RunwayRecord;
  if(r.filmId!==E01_FILM_ID||r.shotId!==id||r.provider!=='runway'||r.model!==RUNWAY_MODEL||
     r.durationSeconds!==10||r.estimatedUsd!==0.5)
    throw new Error('Registro Runway no coincide con el proyecto.');
  return r;
 }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
}
export async function runwayReservedUsd(){
 const records=await Promise.all(E01_SHOTS.filter(x=>!x.existing).map(s=>readRunwayRecord(s.id)));
 return Number(records.reduce((total,r)=>total+(r?.estimatedUsd??0),0).toFixed(2));
}
async function update(record:RunwayRecord){
 const dest=runwayRecordPath(record.shotId),tmp=dest+'.'+randomUUID()+'.tmp';
 record.updatedAt=new Date().toISOString();
 await writeFile(tmp,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});
 try{await rename(tmp,dest);}
 catch(e){await unlink(tmp).catch(()=>undefined);throw e;}
}
async function lock<T>(work:()=>Promise<T>):Promise<T>{
 await mkdir(filmDir(),{recursive:true});
 const file=path.join(filmDir(),'.runway-e01-submit.lock');
 const handle=await open(file,'wx').catch((e:NodeJS.ErrnoException)=>{
  if(e.code==='EEXIST')throw new Error('Ya existe una operación Runway en curso. Intenta recuperar la misma tarea.');
  throw e;
 });
 try{return await work();}finally{await handle.close();await unlink(file).catch(()=>undefined);}
}
function runwayKey(){
 const key=process.env.RUNWAYML_API_SECRET?.trim();
 if(!key||key.length<12)throw new Error('Falta RUNWAYML_API_SECRET en el servidor.');
 return key;
}
export function runwayEnabled(){
 return process.env.NODE_ENV==='development'&&
  process.env.V7_RUNWAY_E01_ENABLED==='true'&&
  Boolean(process.env.RUNWAYML_API_SECRET?.trim());
}
export function runwayAdminAuthorized(request:Request){
 const secret=process.env.V7_CINEMA_ADMIN_TOKEN??'';
 const supplied=request.headers.get('authorization')?.replace(/^Bearer /i,'')??'';
 if(secret.length<24||supplied.length!==secret.length)return false;
 const a=Buffer.from(secret),b=Buffer.from(supplied);
 return a.length===b.length&&timingSafeEqual(a,b);
}
function safeError(error:unknown){
 return String(error instanceof Error?error.message:error)
  .replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]')
  .replace(/key[_-]?[a-z0-9-]*/gi,'[REDACTED]')
  .replace(/https?:\/\/[^\s]+/g,'[REDACTED_URL]').slice(0,400);
}
function promptFor(id:string){
 const plans:Record<string,string>={
  'E01-P03':'Cinematic natural movement: The father keeps his blue motorcycle parked at the school. He helps the two children step down safely. The girl hands him a folded drawing. Soft morning light. Preserve facial identities, uniforms and the exact motorcycle from the reference frame. Realistic hands and expressions. No text overlays. No dialogue or sound.',
  'E01-P04':'Cinematic close-up: The same father gently studies the folded drawing and places it in his shirt pocket. His two children remain nearby and smile. Keep the blue motorcycle and school background consistent with the starting image. Soft gentle camera push-in, natural body movement, no abrupt scene cuts, no dialogue.',
  'E01-P05':'Cinematic family moment: The boy points playfully toward the stationary blue motorcycle while his father and sister exchange warm, silent smiles. Consistent faces, same wardrobe and daylight. Smooth medium camera framing. Silent expressions, no speaking, no text overlay or extra people.',
  'E01-P06':'Cinematic movement: The two children turn and walk safely along the pavement toward the school gate. They turn their heads to wave. Father stays beside the parked blue motorcycle. Realistic coherent walking, consistent uniforms and school architecture, gentle tracking camera. No dialogue.',
  'E01-P07':'Cinematic closing shot: Father at the stationary blue motorcycle lightly touches the horn button twice and looks toward the school gate where his two children wave back. Natural motion and consistent identity. Keep the bike, light and setting unchanged. The two horn sounds will be added in editing, not generated in this clip.'
 };
 const result=plans[id];
 if(!result)throw new Error('La toma no está preparada.');
 return result;
}
async function nearestReference(id:string){
 const n=Number(id.slice(-2));
 for(let index=n-1;index>=1;index--){
  const label='E01-P'+String(index).padStart(2,'0');
  const asset=await resolveV7ShotVideo(E01_FILM_ID,label);
  if(asset)return {shotId:label,file:asset.file,sha256:await hashFile(asset.file)};
 }
 throw new Error('No existe imagen de continuidad: revisa los MP4 aprobados de P01/P02.');
}
export async function runwayPreflight(id:string){
 validShot(id);
 const prior=await readRunwayRecord(id);
 const reference=await nearestReference(id);
 const prompt=promptFor(id);
 return {
  shotId:id,referenceShotId:reference.shotId,referenceHash:reference.sha256,
  videoReady:Boolean(prior?.status==='review-required'),status:prior?.status??'not-started',
  taskKnown:Boolean(prior?.taskId),
  promptText:prompt,promptHash:sha(prompt),
  durationSeconds:10,editSeconds:7,estimatedUsd:RUNWAY_SHOT_USD,
  providerEnabled:runwayEnabled(),reservedUsd:await runwayReservedUsd(),
  freePreflight:true,requiresHumanSpendAuthorization:true
 };
}
async function frameData(file:string,id:string){
 const dir=shotDir(id);
 await mkdir(dir,{recursive:true});
 const filename=id+'-runway-reference.jpg';
 const output=path.join(dir,filename);
 const tmp=output+'.'+randomUUID()+'.tmp.jpg';
 try{
  await command('ffmpeg',['-nostdin','-v','error','-y','-sseof','-0.25','-i',file,
   '-frames:v','1','-vf','scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
   '-q:v','5',tmp],{timeout:45000,maxBuffer:512*1024});
  const data=await readFile(tmp);
  if(data.byteLength<3000||data.byteLength>2500000)
   throw new Error('Fotograma de referencia inválido o demasiado grande.');
  return {dataUri:'data:image/jpeg;base64,'+data.toString('base64'),bytes:data,
   filename,workingFile:tmp,permanentFile:output};
 }catch(e){await unlink(tmp).catch(()=>undefined);throw e;}
}
async function runwayRequest(endpoint:string,init:RequestInit){
 const headers={'Authorization':'Bearer '+runwayKey(),
  'X-Runway-Version':headerVersion,
  ...init.method==='POST'?{'Content-Type':'application/json'}:{}};
 const response=await fetch(base+endpoint,{...init,headers,cache:'no-store',signal:AbortSignal.timeout(30000)});
 const data=await response.json() as Record<string,unknown>;
 if(!response.ok)throw new Error('Runway API '+response.status+': '+
  safeError(typeof data.error==='string'?data.error:JSON.stringify(data).slice(0,180)));
 return data;
}
export async function submitRunwayShot(id:string,confirmHash:string,approvedUsd:number){
 const packet=validShot(id);
 if(!runwayEnabled())throw new Error('Runway no está habilitado o falta su clave.');
 const prompt=promptFor(id);
 if(confirmHash!==sha(prompt)||approvedUsd!==RUNWAY_SHOT_USD)
  throw new Error('Autoriza el prompt y el costo exacto de esta toma.');
 return lock(async()=>{
  const existing=await readRunwayRecord(id);
  if(existing)throw new Error('Runway ya tiene una operación para esta toma. Recupera la misma, sin reenviar.');
  if(await runwayReservedUsd()+RUNWAY_SHOT_USD>RUNWAY_MAX_SCENE_USD+0.001)
   throw new Error('Límite de Runway para Escena 01 alcanzado.');
  const ref=await nearestReference(id);
  const frame=await frameData(ref.file,id);
  const now=new Date().toISOString();
  const record:RunwayRecord={
   schemaVersion:1,filmId:E01_FILM_ID,shotId:id,provider:'runway',model:'gen4_turbo',
   status:'reserved',referenceShotId:ref.shotId,referenceSha256:ref.sha256,
   referenceImageName:frame.filename,promptHash:sha(prompt),promptText:prompt,
   durationSeconds:10,estimatedUsd:0.5,createdAt:now,updatedAt:now
  };
  await writeFile(runwayRecordPath(id),JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});
  try{
   const result=await runwayRequest('/image_to_video',{method:'POST',
    body:JSON.stringify({model:'gen4_turbo',promptImage:frame.dataUri,
     promptText:prompt,ratio:'1280:720',duration:10})});
   if(typeof result.id!=='string'||!result.id.length)
    throw new Error('Runway respondió sin ID; no reintentar automáticamente.');
   record.taskId=result.id;record.status='submitted';
   await update(record);
   // Reference image remains stored locally as a durable continuity artifact.
   await rename(frame.workingFile,frame.permanentFile).catch(()=>undefined);
   return {shotId:id,status:record.status,taskKnown:true,newSpendAuthorizationUsd:0.5,
    provider:'runway',noAutomaticRetries:true};
  }catch(e){
   record.status='failed-unknown';record.error=safeError(e);await update(record);
   await unlink(frame.workingFile).catch(()=>undefined);
   throw new Error('Runway no confirmó el video. No se realizará un segundo envío: '+record.error);
  }
 });
}
export async function resumeRunwayShot(id:string){
 validShot(id);
 return lock(async()=>{
  const record=await readRunwayRecord(id);
  if(!record?.taskId)throw new Error('No existe ID recuperable de Runway. Nunca reenvíes esta toma.');
  if(record.status==='review-required')return {shotId:id,status:record.status,videoReady:true,providerCalls:0};
  const task=await runwayRequest('/tasks/'+encodeURIComponent(record.taskId),{method:'GET'});
  const status=task.status;
  if(status==='PENDING'||status==='THROTTLED'||status==='RUNNING'){
   record.status='processing';await update(record);
   return {shotId:id,status:'processing',videoReady:false,newGenerationRequests:0};
  }
  if(status!=='SUCCEEDED'){
   record.status='failed-unknown';record.error='Runway finalizó con estado '+safeError(status);
   await update(record);
   return {shotId:id,status:record.status,videoReady:false,newGenerationRequests:0};
  }
  const output=Array.isArray(task.output)?task.output[0]:null;
  if(typeof output!=='string'||!output.startsWith('https://')){
   record.status='failed-unknown';record.error='Runway terminó sin URL de video.';
   await update(record);
   return {shotId:id,status:record.status,videoReady:false,newGenerationRequests:0};
  }
  const target=runwayCandidatePath(id);
  let alreadyExists=false;
  try{alreadyExists=(await stat(target)).size>10000;}
  catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  if(!alreadyExists){
   const response=await fetch(output,{cache:'no-store',signal:AbortSignal.timeout(90000)});
   if(!response.ok)throw new Error('No se pudo descargar el video de Runway.');
   const size=Number(response.headers.get('content-length')||0);
   if(size>50000000)throw new Error('Video excede límite permitido.');
   const bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length<10000||bytes.length>50000000)throw new Error('Archivo MP4 inválido o demasiado grande.');
   const tmp=path.join(shotDir(id),'.runway-'+randomUUID()+'.mp4');
   try{
    await writeFile(tmp,bytes,{flag:'wx',mode:0o600});
    const {stdout}=await command('ffprobe',['-v','error','-show_entries',
     'format=duration:stream=codec_type','-of','json',tmp],{timeout:30000});
    const info=JSON.parse(stdout) as {format?:{duration?:string};streams?:Array<{codec_type?:string}>};
    if(Number(info.format?.duration??0)<9||Number(info.format?.duration??0)>11||
      !info.streams?.some(s=>s.codec_type==='video'))
     throw new Error('Video Runway no supera verificación técnica.');
    await link(tmp,target);
   }finally{await unlink(tmp).catch(()=>undefined);}
  }
  record.status='review-required';record.candidateName=path.basename(target);
  delete record.error;await update(record);
  return {shotId:id,status:'review-required',videoReady:true,newGenerationRequests:0};
 });
}
export function runwayShotSpecs(){
 return E01_SHOTS.filter(s=>!s.existing).map(s=>({
  id:s.id,title:s.title,action:s.action,editSeconds:s.editSeconds,
  promptText:promptFor(s.id),promptHash:sha(promptFor(s.id)),estimateUsd:RUNWAY_SHOT_USD
 }));
}
