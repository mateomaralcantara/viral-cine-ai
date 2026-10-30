import {NextResponse} from 'next/server';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,rename,unlink,stat} from 'node:fs/promises';
import path from 'node:path';
import {localOriginAllowed,localAdminAuthorized} from '@/lib/v7/security/local-studio-session';
import {readV7FilmBundle,v7FilmRoot} from '@/lib/v7/storage/film-store';
import {E02_FILM_ID,E02_SHOTS,e02Shot} from '@/lib/v7/production/dos-toques-e02-shot-packets';
import {approvedE02References,getApprovedE02Image} from '@/lib/v7/production/e02-supabase-references';
import {readRunwayRecord,runwayEnabled,runwayReservedUsd,RUNWAY_MAX_SCENE_USD,
 submitRunwayShot,resumeRunwayShot,diagnoseRunwayShot} from '@/lib/v7/production/runway-e02-engine';
import {createCorrectionRevision,latestCorrectionRevision,readCorrectionRevision,
 usedCorrectionRevision} from '@/lib/v7/production/e02-correction-store';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const command=promisify(execFile);
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
type Context={params:Promise<{filmId:string}>};
function error(status:number,message:string){
 return NextResponse.json({ok:false,error:message},{status,
  headers:{'Cache-Control':'private,no-store'}});
}
function cleaned(e:unknown){
 return String(e instanceof Error?e.message:e).replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]')
  .replace(/https?:\/\/[^\s]+/g,'[PRIVATE_URL]').slice(0,450);
}
async function allowed(ctx:Context){
 const {filmId}=await ctx.params;
 if(filmId!==E02_FILM_ID)throw Error('Película no habilitada.');
 const film=await readV7FilmBundle(filmId);
 if(film.film.id!==E02_FILM_ID)throw Error('Película no coincide.');
}
function shotValid(id:unknown):id is string{
 return typeof id==='string'&&/^E02-P0[1-7]$/.test(id)&&Boolean(e02Shot(id));
}
function previewPath(id:string,revisionId:string){
 if(!/^v\d{17}-[a-f0-9-]{36}$/.test(revisionId))throw Error('Versión inválida.');
 return path.join(v7FilmRoot(E02_FILM_ID),id.toLowerCase(),'corrections','previews',revisionId+'.mp4');
}
async function previewExists(file:string){
 try{return (await stat(file)).size>10000;}
 catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e;}
}
async function buildPreview(id:string,revisionId:string){
 const revision=await readCorrectionRevision(id,revisionId);
 const image=await getApprovedE02Image(id);
 if(!image||image.hash!==revision.referenceSha256)
  throw Error('Referencia aprobada diferente. Previsualización cancelada.');
 const dest=previewPath(id,revisionId);
 if(await previewExists(dest))return dest;
 await mkdir(path.dirname(dest),{recursive:true});
 const input=path.join(path.dirname(dest),'.ref-'+randomUUID()+'.jpg');
 const tmp=path.join(path.dirname(dest),'.preview-'+randomUUID()+'.mp4');
 try{
  await writeFile(input,image.bytes,{flag:'wx',mode:0o600});
  await command('ffmpeg',['-hide_banner','-loglevel','error','-nostdin',
   '-loop','1','-framerate','24','-i',input,
   '-vf',"scale=1280:720,zoompan=z='min(zoom+0.001,1.13)':d=1:s=1280x720:fps=24,format=yuv420p",
   '-t','6','-an','-c:v','libx264','-crf','24','-pix_fmt','yuv420p',
   '-movflags','+faststart','-y',tmp],
   {timeout:90000,maxBuffer:512000,windowsHide:true});
  if(!(await previewExists(tmp)))throw Error('FFmpeg no generó una vista previa válida.');
  await rename(tmp,dest);
  return dest;
 }finally{
  await unlink(input).catch(()=>undefined);
  await unlink(tmp).catch(()=>undefined);
 }
}
export async function GET(request:Request,ctx:Context){
 if(!localOriginAllowed(request))return error(403,'Solo estudio local.');
 try{
  await allowed(ctx);
  const url=new URL(request.url);
  const id=url.searchParams.get('shotId');
  const revisionId=url.searchParams.get('revisionId');
  if(url.searchParams.get('preview')==='1'){
   if(!shotValid(id)||!revisionId)return error(400,'Referencia inválida.');
   await readCorrectionRevision(id,revisionId);
   const file=previewPath(id,revisionId);
   if(!(await previewExists(file)))return error(404,'Primero crea la simulación gratuita.');
   const bytes=await readFile(file);
   return new Response(new Uint8Array(bytes),{headers:{
    'Content-Type':'video/mp4','Content-Length':String(bytes.length),
    'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'
   }});
  }
  const refs=await approvedE02References();
  const shots=await Promise.all(E02_SHOTS.map(async shot=>{
   const [record,revision]=await Promise.all([
    readRunwayRecord(shot.id),latestCorrectionRevision(shot.id)
   ]);
   return {id:shot.id,title:shot.title,canonicalPrompt:shot.prompt,
    correction:revision,referenceReady:refs.shots[shot.id]?.readyForScene??false,
    status:record?.status??'not-started',taskKnown:Boolean(record?.taskId),
    videoReady:record?.status==='review-required',error:record?.error??null,
    correctionAttemptUsed:revision?await usedCorrectionRevision(shot.id,revision.revisionId):false,
    previewReady:revision?await previewExists(previewPath(shot.id,revision.revisionId)):false};
  }));
  return NextResponse.json({ok:true,shots,allReferencesReady:refs.referencesReady,
   providerEnabled:runwayEnabled(),reservedUsd:await runwayReservedUsd(),
   maxSceneUsd:RUNWAY_MAX_SCENE_USD,estimatedUsdPerShot:0.5},
   {headers:{'Cache-Control':'private,no-store'}});
 }catch(e){return error(503,cleaned(e));}
}
export async function POST(request:Request,ctx:Context){
 if(!localOriginAllowed(request))return error(403,'Solo estudio local.');
 if(!localAdminAuthorized(request))return error(403,'Abre ViralCine desde el iniciador para habilitar la sesión local.');
 try{
  await allowed(ctx);
  if(Number(request.headers.get('content-length')||0)>12000)
   return error(413,'Solicitud demasiado grande.');
  const payload=await request.json() as Record<string,unknown>;
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||!shotValid(payload.shotId))
   return error(400,'Toma inválida.');
  const id=payload.shotId;
  if(payload.action==='prepare'){
   if(typeof payload.promptText!=='string')return error(400,'Prompt requerido.');
   const img=await getApprovedE02Image(id);
   if(!img)return error(409,'No hay fotografía aprobada para esta toma.');
   const revision=await createCorrectionRevision(id,payload.promptText,img.hash);
   return NextResponse.json({ok:true,revision,additionalSpendUsd:0,newGenerationRequests:0});
  }
  if(payload.action==='diagnose'){
   const result=await diagnoseRunwayShot(id);
   return NextResponse.json({ok:true,...result,additionalSpendUsd:0,newGenerationRequests:0});
  }
  if(payload.action==='preview'){
   if(typeof payload.revisionId!=='string')return error(400,'Versión requerida.');
   const file=await buildPreview(id,payload.revisionId);
   return NextResponse.json({ok:true,previewReady:true,
    previewUrl:'/api/v7/films/'+E02_FILM_ID+'/scene02-corrections?preview=1&shotId='+
     encodeURIComponent(id)+'&revisionId='+encodeURIComponent(payload.revisionId),
    videoDurationSeconds:6,previewKind:'still-camera-simulation',
    additionalSpendUsd:0,newGenerationRequests:0,fileReady:Boolean(file)});
  }
  if(payload.action==='resume'){
   const result=await resumeRunwayShot(id);
   return NextResponse.json({ok:true,...result,newGenerationRequests:0});
  }
  if(payload.action==='submit'){
   if(payload.confirmHuman!==true||payload.explicitSpendConsent!==true||
     payload.approvedUsd!==0.5||typeof payload.revisionId!=='string'||
     typeof payload.promptHash!=='string')
    return error(400,'Autoriza explícitamente US$0.50 y la versión exacta.');
   const result=await submitRunwayShot(id,payload.promptHash,0.5,payload.revisionId);
   return NextResponse.json({ok:true,...result});
  }
  return error(400,'Acción inválida.');
 }catch(e){return error(409,cleaned(e));}
}
