import {createHash,randomUUID} from 'node:crypto';
import {localAdminAuthorized} from '@/lib/v7/security/local-studio-session';
import {classifyRunwaySubmitError,RunwayKnownRejection,isLegacyCreditRejection} from '@/lib/v7/orchestration/provider-failure-policy';
import {execFile} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,writeFile,rename,open,unlink,stat,link} from 'node:fs/promises';
import {promisify} from 'node:util';
import path from 'node:path';
import {v7FilmRoot} from '@/lib/v7/storage/film-store';
import {E02_FILM_ID,E02_SHOTS,e02Shot,E02_MAX_USD,E02_COST_PER_SHOT} from '@/lib/v7/production/dos-toques-e02-shot-packets';
import sharp from 'sharp';
import {resolveV7ShotVideo} from '@/lib/v7/production/shot-video-source';

const command=promisify(execFile);
export const RUNWAY_MODEL='gen4_turbo';
export const RUNWAY_DURATION=10;
export const RUNWAY_RATE_USD_PER_SEC=0.05;
export const RUNWAY_SHOT_USD=E02_COST_PER_SHOT;
export const RUNWAY_MAX_SCENE_USD=E02_MAX_USD;
const headerVersion='2024-11-06';
const base='https://api.dev.runwayml.com/v1';
export type RunwayRecord={
 schemaVersion:1; filmId:string;shotId:string;provider:'runway';model:'gen4_turbo';
 status:'reserved'|'submitted'|'processing'|'review-required'|'failed-unknown'|'blocked-credits'|'blocked-credentials';
 taskId?:string;candidateName?:string;referenceShotId:string;referenceSha256:string;
 referenceImageName:string;promptHash:string;promptText:string;
 durationSeconds:10;estimatedUsd:0.5;
 createdAt:string;updatedAt:string;error?:string;
};
function filmDir(){return v7FilmRoot(E02_FILM_ID);}
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
 const packet=e02Shot(id);
 if(!packet)throw new Error('Solo las siete tomas de E02 están habilitadas.');
 return packet;
}
export async function readRunwayRecord(id:string):Promise<RunwayRecord|null>{
 validShot(id);
 try{
  const r=JSON.parse(await readFile(runwayRecordPath(id),'utf8')) as RunwayRecord;
  if(r.filmId!==E02_FILM_ID||r.shotId!==id||r.provider!=='runway'||r.model!==RUNWAY_MODEL||
     r.durationSeconds!==10||r.estimatedUsd!==0.5)
    throw new Error('Registro Runway no coincide con el proyecto.');
  // Read-only normalization: old Runway 400/no-credit records are definitive
  // provider rejections, not unresolved paid generations. Keep their audit
  // bytes intact on disk while surfacing the correct state in the UI.
  if(isLegacyCreditRejection(r))return {...r,status:'blocked-credits'};
  return r;
 }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
}
export async function runwayReservedUsd(){
 const records=await Promise.all(E02_SHOTS.map(s=>readRunwayRecord(s.id)));
 return Number(records.reduce((total,r)=>
  total+(r&&!['blocked-credits','blocked-credentials'].includes(r.status)
   ?r.estimatedUsd:0),0).toFixed(2));
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
 const file=path.join(filmDir(),'.runway-e02-submit.lock');
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
  process.env.V7_RUNWAY_E02_ENABLED==='true'&&
  Boolean(process.env.RUNWAYML_API_SECRET?.trim());
}
export function runwayAdminAuthorized(request:Request){
 return localAdminAuthorized(request);
}
function safeError(error:unknown){
 return String(error instanceof Error?error.message:error)
  .replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]')
  .replace(/key[_-]?[a-z0-9-]*/gi,'[REDACTED]')
  .replace(/https?:\/\/[^\s]+/g,'[REDACTED_URL]').slice(0,400);
}
function promptFor(id:string){return validShot(id).prompt;}
const seedPath=()=>path.join(filmDir(),'scenes','e02','scene02-seed.jpg');
const shotImagePath=(id:string)=>path.join(shotDir(id),id+'-image-reference.jpg');
export async function e02ShotImageReady(id:string){
 validShot(id);
 return fileExists(shotImagePath(id));
}
async function fileExists(file:string){
 try{return (await stat(file)).size>3000;}
 catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e;}
}
export async function saveE02ShotImage(id:string,bytes:Buffer){
 validShot(id);
 if(bytes.length<3000||bytes.length>4000000)
  throw new Error('Imagen fuera del límite: entre 3 KB y 4 MB.');
 if(await readRunwayRecord(id))
  throw new Error('La toma ya tiene un intento registrado. Su referencia no puede modificarse.');
 const dest=shotImagePath(id);
 const normalized=await sharp(bytes,{failOn:'error',limitInputPixels:25000000})
  .resize(1280,720,{fit:'cover',position:'attention'})
  .jpeg({quality:88}).toBuffer();
 if(normalized.length<3000||normalized.length>2500000)
  throw new Error('Imagen inválida después de convertir.');
 await mkdir(shotDir(id),{recursive:true});
 if(await fileExists(dest)){
  const existing=await readFile(dest);
  if(existing.equals(normalized))return {shotId:id,imageReady:true,bytes:existing.length,
   alreadySaved:true,newGenerationRequests:0};
  throw new Error('Esta toma ya tiene una imagen distinta guardada. Se conserva la original.');
 }
 try{await writeFile(dest,normalized,{flag:'wx',mode:0o600});}
 catch(e){
  if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;
  const existing=await readFile(dest);
  if(!existing.equals(normalized))throw new Error('Ya se guardó otra imagen. No se sobrescribirá.');
  return {shotId:id,imageReady:true,bytes:existing.length,alreadySaved:true,
   newGenerationRequests:0};
 }
 return {shotId:id,imageReady:true,bytes:normalized.length,alreadySaved:false,
  newGenerationRequests:0};
}
async function existsSeed(){
 try{return (await stat(seedPath())).size>3000;}catch(e){
  if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e;
 }
}
export async function e02SeedReady(){return (await existsSeed())||(await e02ShotImageReady('E02-P01'));}
export async function saveE02Seed(bytes:Buffer){
 if(bytes.length<3000||bytes.length>4000000)throw new Error('Imagen inválida; máximo 4 MB.');
 if((await runwayReservedUsd())>0)throw new Error('Producción iniciada: la referencia ya no puede cambiar.');
 const result=await sharp(bytes,{failOn:'error',limitInputPixels:25000000})
  .resize(1280,720,{fit:'cover',position:'attention'})
  .jpeg({quality:88}).toBuffer();
 if(result.length<3000||result.length>2500000)throw Error('JPEG no válido.');
 await mkdir(path.dirname(seedPath()),{recursive:true});
 await writeFile(seedPath(),result,{flag:'wx',mode:0o600});
 return {seedReady:true,bytes:result.length};
}
async function nearestReference(id:string){
 // A director-supplied image takes precedence for its own shot. This allows
 // seven independent storyboard frames and avoids identity drift.
 const own=shotImagePath(id);
 if(await fileExists(own))
  return {shotId:id+'-IMAGE',file:own,sha256:await hashFile(own),still:true};
 const n=Number(id.slice(-2));
 if(n===1){
  if(!(await existsSeed()))throw new Error('Sube una imagen inicial del interior de la casa para P01.');
  const file=seedPath();
  return {shotId:'E02-SEED',file,sha256:await hashFile(file),still:true};
 }
 const label='E02-P'+String(n-1).padStart(2,'0');
 const asset=await resolveV7ShotVideo(E02_FILM_ID,label);
 if(!asset)throw new Error('Falta el MP4 anterior de '+label+'. No se enviará una generación sin continuidad.');
 return {shotId:label,file:asset.file,sha256:await hashFile(asset.file),still:false};
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
  durationSeconds:10,editSeconds:validShot(id).editSeconds,estimatedUsd:RUNWAY_SHOT_USD,
  providerEnabled:runwayEnabled(),reservedUsd:await runwayReservedUsd(),
  freePreflight:true,requiresHumanSpendAuthorization:true
 };
}
async function frameData(file:string,id:string,still:boolean){
 const dir=shotDir(id);
 await mkdir(dir,{recursive:true});
 const filename=id+'-runway-reference.jpg';
 const output=path.join(dir,filename);
 const tmp=output+'.'+randomUUID()+'.tmp.jpg';
 try{
  if(still){
   await writeFile(tmp,await readFile(file),{flag:'wx',mode:0o600});
  }else{
   await command('ffmpeg',['-nostdin','-v','error','-y','-sseof','-0.25','-i',file,
    '-frames:v','1','-vf','scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
    '-q:v','5',tmp],{timeout:45000,maxBuffer:512*1024});
  }
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
 if(!response.ok){
  const detail=safeError(typeof data.error==='string'?data.error:JSON.stringify(data).slice(0,180));
  const decision=classifyRunwaySubmitError(response.status,detail);
  if(decision.kind==='blocked-credits')
   throw new RunwayKnownRejection('blocked-credits',
    'Runway no tiene créditos suficientes para esta generación (HTTP '+response.status+
    '). No se creó ninguna tarea; no repetir automáticamente. Recarga Runway o autoriza otro proveedor.');
  if(decision.kind==='blocked-credentials')
   throw new RunwayKnownRejection('blocked-credentials',
    'Runway rechazó las credenciales (HTTP '+response.status+
    '). No repetir automáticamente.');
  throw new Error('Runway API '+response.status+': '+detail);
 }
 return data;
}
export async function submitRunwayShot(id:string,confirmHash:string,approvedUsd:number){
 validShot(id);
 if(!runwayEnabled())throw new Error('Runway no está habilitado o falta su clave.');
 const prompt=promptFor(id);
 if(confirmHash!==sha(prompt)||approvedUsd!==RUNWAY_SHOT_USD)
  throw new Error('Autoriza el prompt y el costo exacto de esta toma.');
 return lock(async()=>{
  const existing=await readRunwayRecord(id);
  if(existing)throw new Error('Runway ya tiene una operación para esta toma. Recupera la misma, sin reenviar.');
  // Provider-wide balance block: refuse direct API submissions of P02-P07
  // too, not just clicks on the browser's disabled button.
  const sceneRecords=await Promise.all(E02_SHOTS.map(s=>readRunwayRecord(s.id)));
  if(sceneRecords.some(r=>r&&['blocked-credits','blocked-credentials'].includes(r.status)))
   throw new Error('Producción pausada: Runway carece de saldo o credenciales. No se enviará ninguna toma nueva.');
  if(await runwayReservedUsd()+RUNWAY_SHOT_USD>RUNWAY_MAX_SCENE_USD+0.001)
   throw new Error('Límite de Runway para Escena 02 alcanzado.');
  const ref=await nearestReference(id);
  const frame=await frameData(ref.file,id,ref.still);
  const now=new Date().toISOString();
  const record:RunwayRecord={
   schemaVersion:1,filmId:E02_FILM_ID,shotId:id,provider:'runway',model:'gen4_turbo',
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
   record.status=e instanceof RunwayKnownRejection?e.kind:'failed-unknown';
   record.error=safeError(e);await update(record);
   await unlink(frame.workingFile).catch(()=>undefined);
   if(e instanceof RunwayKnownRejection)throw e;
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
 return E02_SHOTS.map(s=>({
  id:s.id,title:s.title,action:s.action,editSeconds:s.editSeconds,voiceCode:s.voiceCode,dialog:s.dialog,
  promptText:promptFor(s.id),promptHash:sha(promptFor(s.id)),estimateUsd:RUNWAY_SHOT_USD
 }));
}
