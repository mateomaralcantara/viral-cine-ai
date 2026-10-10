import {createHash, randomUUID, timingSafeEqual} from 'node:crypto';
import {execFile} from 'node:child_process';
import {mkdir, open, readFile, rename, stat, unlink, writeFile, link} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {GenerateVideosOperation, GoogleGenAI} from '@google/genai';
import {NextResponse} from 'next/server';
import {readV7FilmBundle, v7FilmRoot} from '@/lib/v7/storage/film-store';
import {E01_FILM_ID, E01_PROVIDER_MODEL, E01_SHOTS, E01_ESTIMATE_USD,
  E01_MODEL_RATE_USD_PER_SECOND, e01ShotById} from '@/lib/v7/production/dos-toques-e01-shot-packets';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const probe=promisify(execFile);
const NEW_SHOTS=E01_SHOTS.filter(x=>!x.existing);
const RESERVED_TOTAL_LIMIT_USD=4.00;
type Context={params:Promise<{filmId:string}>};
type RecordState='reserved'|'submitted'|'processing'|'review-required'|'failed-unknown';
type Ledger={
  filmId:string;shotId:string;model:string;status:RecordState;providerSeconds:8;
  estimatedUsd:number;maximumApprovedUsd:number;promptSha256:string;
  providerOperationName?:string;candidateName?:string;error?:string;
  createdAt:string;updatedAt:string;
};
const root=()=>path.join(v7FilmRoot(E01_FILM_ID),'scene01-paid-shots');
const recordPath=(id:string)=>path.join(root(),id.toLowerCase(),'provider-operation.json');
const outputPath=(id:string)=>path.join(v7FilmRoot(E01_FILM_ID),id.toLowerCase(),id+'-veo-candidato.mp4');
function allowed(request:Request){
  const u=new URL(request.url);
  return process.env.NODE_ENV==='development' &&
    ['localhost','127.0.0.1','::1'].includes(u.hostname)&&
    (!request.headers.get('origin')||request.headers.get('origin')===u.origin);
}
function authorized(request:Request){
  const saved=process.env.V7_CINEMA_ADMIN_TOKEN||'';
  const input=request.headers.get('authorization')?.replace(/^Bearer /i,'')||'';
  if(saved.length<24||saved.length!==input.length)return false;
  const a=Buffer.from(saved,'utf8'),b=Buffer.from(input,'utf8');
  return a.length===b.length&&timingSafeEqual(a,b);
}
function priceVerified(){
  return Number(process.env.V7_SCENE01_RATE_USD_PER_SECOND)===E01_MODEL_RATE_USD_PER_SECOND &&
    Number(process.env.V7_SCENE01_PER_SHOT_CAP_USD)===E01_ESTIMATE_USD &&
    Number(process.env.V7_SCENE01_TOTAL_CAP_USD)===RESERVED_TOTAL_LIMIT_USD;
}
function enabled(){
  return process.env.PRODUCTION_MODE==='real' &&
    process.env.V7_SCENE01_PAID_ENABLED==='true' &&
    process.env.V7_CINEMA_PAID_ENABLED!=='true' &&
    process.env.ALLOW_PAID_GENERATION!=='true' &&
    process.env.ALLOW_EXTERNAL_API_CALLS!=='true'&&priceVerified();
}
function client(){
  const key=process.env.GEMINI_API_KEY||'';
  if(key.length<12)throw Error('Falta GEMINI_API_KEY.');
  return new GoogleGenAI({apiKey:key});
}
function digest(input:string){return createHash('sha256').update(input).digest('hex');}
function blank(status:number,error:string){
  return NextResponse.json({ok:false,error},{status,headers:{'Cache-Control':'private, no-store'}});
}
function message(e:unknown){
  return String(e instanceof Error?e.message:e).replace(/AIza[A-Za-z0-9_-]+/g,'[GOOGLE_KEY_REDACTED]')
    .replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').slice(0,350);
}
async function ensureFilm(ctx:Context){
  if((await ctx.params).filmId!==E01_FILM_ID)throw Error('Película no autorizada.');
  const saved=await readV7FilmBundle(E01_FILM_ID);
  if(saved.film.id!==E01_FILM_ID)throw Error('Bundle incorrecto.');
}
async function readLedger(id:string):Promise<Ledger|null>{
  try{
    const r=JSON.parse(await readFile(recordPath(id),'utf8')) as Ledger;
    if(r.filmId!==E01_FILM_ID||r.shotId!==id||r.model!==E01_PROVIDER_MODEL||
      r.estimatedUsd!==E01_ESTIMATE_USD||r.maximumApprovedUsd!==E01_ESTIMATE_USD)
      throw Error('Ledger inesperado: reconciliar antes de continuar.');
    return r;
  }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
}
async function storeLedger(r:Ledger){
  const destination=recordPath(r.shotId),tmp=destination+'.'+randomUUID()+'.tmp';
  r.updatedAt=new Date().toISOString();
  await writeFile(tmp,JSON.stringify(r,null,2)+'\n',{flag:'wx',mode:0o600});
  try{await rename(tmp,destination);}
  catch(e){await unlink(tmp).catch(()=>{});throw e;}
}
async function exposure(){
  let commitments=0;
  for(const shot of NEW_SHOTS){
    const r=await readLedger(shot.id);
    if(r)commitments+=r.maximumApprovedUsd;
  }
  return Number(commitments.toFixed(2));
}
async function locked<T>(work:()=>Promise<T>):Promise<T>{
  await mkdir(root(),{recursive:true});
  const name=path.join(root(),'.scene01-provider-lock');
  const handle=await open(name,'wx').catch((e:NodeJS.ErrnoException)=>{
    if(e.code==='EEXIST')throw Error('Hay otra tarea de E01 activa. No se duplicará.');
    throw e;
  });
  try{return await work();}
  finally{await handle.close();await unlink(name).catch(()=>{});}
}
function publicRecord(r:Ledger|null){
  return {recordStatus:r?.status??'not-started',providerOperationKnown:Boolean(r?.providerOperationName),
    videoReady:r?.status==='review-required',hasSubmittedOrReserved:Boolean(r),
    error:r?.error??null};
}
async function status(ctx:Context){
  await ensureFilm(ctx);
  const ledger=await Promise.all(NEW_SHOTS.map(s=>readLedger(s.id)));
  const packets=E01_SHOTS.map(s=>{
    const idx=NEW_SHOTS.findIndex(x=>x.id===s.id);
    const record=idx>=0?ledger[idx]:null;
    return {id:s.id,title:s.title,startSeconds:s.startSeconds,editSeconds:s.editSeconds,
      providerSeconds:8,existing:s.existing,action:s.action,camera:s.camera,
      continuity:s.continuity,voiceCharacter:s.voiceCharacter??null,voiceLine:s.voiceLine??null,
      promptEnglish:s.existing?null:s.promptEnglish,promptSha256:s.existing?null:digest(s.promptEnglish),
      estimatedUsd:s.existing?0:E01_ESTIMATE_USD,...publicRecord(record)};
  });
  return {ok:true,filmId:E01_FILM_ID,sceneId:'E01',packets,
    priceConfigurationVerified:priceVerified(),providerEnabled:enabled(),
    credentialConfigured:Boolean(process.env.GEMINI_API_KEY),
    adminTokenConfigured:Boolean(process.env.V7_CINEMA_ADMIN_TOKEN?.length&&process.env.V7_CINEMA_ADMIN_TOKEN.length>=24),
    priceDisclaimer:'La tarifa de USD 0.10/s es una hipótesis de configuración local, NO verificación de facturación de Google.',
    perShotCapUsd:E01_ESTIMATE_USD,totalCapUsd:RESERVED_TOTAL_LIMIT_USD,
    committedUsd:await exposure(),automaticProviderRetries:0,externalCallsFromGet:0};
}
export async function GET(request:Request,ctx:Context){
  if(!allowed(request))return blank(403,'Solo localhost en desarrollo.');
  try{return NextResponse.json(await status(ctx),{headers:{'Cache-Control':'private, no-store'}});}
  catch{return blank(404,'No se pudo abrir el expediente de E01.');}
}
export async function POST(request:Request,ctx:Context){
  if(!allowed(request)||!authorized(request))return blank(403,'Origen o token administrativo inválido.');
  if(Number(request.headers.get('content-length')||0)>12000)return blank(413,'Solicitud demasiado grande.');
  let body:{action?:string;shotId?:string;confirm?:boolean;
    promptSha256?:string;approvedUsd?:number;pricingConfirmed?:boolean};
  try{body=await request.json() as typeof body;}catch{return blank(400,'JSON inválido.');}
  if(!['preflight','submit','resume'].includes(body.action||''))return blank(400,'Acción no válida.');
  const shot=e01ShotById(body.shotId||'');
  if(!shot||shot.existing)return blank(403,'Solo P03–P07; P01 y P02 nunca se regeneran.');
  try{
    await ensureFilm(ctx);
    if(body.action==='preflight'){
      const current=await readLedger(shot.id);
      return NextResponse.json({ok:true,shotId:shot.id,promptSha256:digest(shot.promptEnglish),
        continuationReady:true,hasSubmittedOrReserved:Boolean(current),
        estimatedUsd:E01_ESTIMATE_USD,providerSeconds:8,editSeconds:shot.editSeconds,
        voiceProductionDeferred:Boolean(shot.voiceLine),providerEnabled:enabled(),
        providerCalls:0,automaticRetries:0});
    }
    return await locked(async()=>{
      const existing=await readLedger(shot.id);
      if(body.action==='resume'){
        if(!existing)throw Error('No hay operación original que recuperar.');
        if(existing.status==='review-required')return NextResponse.json({ok:true,status:'review-required',
          videoReady:true,alreadyRecovered:true,providerCalls:0});
        if(!existing.providerOperationName)throw Error('No hay ID seguro de Veo: prohibido reintentar.');
        const sdk=client();
        const saved=new GenerateVideosOperation();
        saved.name=existing.providerOperationName;
        const op=await sdk.operations.getVideosOperation({operation:saved});
        if(!op.done){
          existing.status='processing';await storeLedger(existing);
          return NextResponse.json({ok:true,status:'processing',providerCalls:0});
        }
        const video=op.response?.generatedVideos?.[0]?.video;
        if(!video){
          existing.status='failed-unknown';existing.error='Operación finalizada sin video. Conciliar con proveedor antes de generar nuevamente.';
          await storeLedger(existing);
          return NextResponse.json({ok:true,status:'failed-unknown',providerCalls:0});
        }
        const target=outputPath(shot.id);
        try{await stat(target);}
        catch(e){
          if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
          const tmp=path.join(root(),'.'+randomUUID()+'.mp4');
          try{
            await sdk.files.download({file:video,downloadPath:tmp});
            if((await stat(tmp)).size<10000)throw Error('Video incompleto.');
            const {stdout}=await probe('ffprobe',['-v','error','-show_entries',
              'format=duration:stream=codec_type','-of','json',tmp],{maxBuffer:1024*1024});
            const info=JSON.parse(stdout) as {format?:{duration?:string};streams?:Array<{codec_type?:string}>};
            if(Number(info.format?.duration||0)<7.7||Number(info.format?.duration||0)>8.3||
              !info.streams?.some(x=>x.codec_type==='video'))throw Error('Video no supera revisión técnica básica.');
            await mkdir(path.dirname(target),{recursive:true});
            await link(tmp,target);
          }finally{await unlink(tmp).catch(()=>{});}
        }
        existing.status='review-required';existing.candidateName=path.basename(target);existing.error=undefined;
        await storeLedger(existing);
        return NextResponse.json({ok:true,status:'review-required',videoReady:true,providerCalls:0});
      }
      // Paid action can ONLY happen after separate shot-level final click.
      if(existing)throw Error('Operación previamente registrada. Usa Recuperar, nunca Generar.');
      if(!enabled())throw Error('Proveedor deshabilitado o tarifa/caps no validados en configuración.');
      if(!process.env.GEMINI_API_KEY||!process.env.V7_CINEMA_ADMIN_TOKEN)throw Error('Faltan credenciales locales.');
      if(body.confirm!==true||body.pricingConfirmed!==true||
        body.approvedUsd!==E01_ESTIMATE_USD||body.promptSha256!==digest(shot.promptEnglish)){
        throw Error('Falta confirmación explícita del costo, tarifa y prompt de esta toma.');
      }
      if(await exposure()+E01_ESTIMATE_USD>RESERVED_TOTAL_LIMIT_USD)
        throw Error('Se agotó el máximo reservado para tomas nuevas de E01.');
      const timestamp=new Date().toISOString();
      const record:Ledger={filmId:E01_FILM_ID,shotId:shot.id,model:E01_PROVIDER_MODEL,
        status:'reserved',providerSeconds:8,estimatedUsd:E01_ESTIMATE_USD,
        maximumApprovedUsd:E01_ESTIMATE_USD,promptSha256:digest(shot.promptEnglish),
        createdAt:timestamp,updatedAt:timestamp};
      const name=recordPath(shot.id);
      await mkdir(path.dirname(name),{recursive:true});
      await writeFile(name,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});
      // A timeout here might have charged. Never automatically submit a second time.
      try{
        const sdk=client();
        const operation=await sdk.models.generateVideos({model:E01_PROVIDER_MODEL,
          source:{prompt:shot.promptEnglish},
          config:{aspectRatio:'16:9',numberOfVideos:1,durationSeconds:8,
            resolution:'720p',personGeneration:'allow_all'}});
        if(!operation.name)throw Error('Proveedor no devolvió ID: operación incierta.');
        record.status='submitted';record.providerOperationName=operation.name;
        await storeLedger(record);
        return NextResponse.json({ok:true,shotId:shot.id,status:'submitted',
          estimatedUsd:E01_ESTIMATE_USD,automaticRetries:0});
      }catch(e){
        record.status='failed-unknown';record.error=message(e);
        await storeLedger(record);
        throw Error('Operación incierta; se bloqueó un segundo envío. '+record.error);
      }
    });
  }catch(e){return blank(409,message(e));}
}
