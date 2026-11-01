import {NextResponse} from 'next/server';
import {localOriginAllowed} from '@/lib/v7/security/local-studio-session';
import {readV7FilmBundle} from '@/lib/v7/storage/film-store';
import {E02_FILM_ID} from '@/lib/v7/production/dos-toques-e02-shot-packets';
import {readRunwayRecord,runwayReservedUsd,runwayEffectiveSceneBudgetUsd,runwayEnabled,runwayShotSpecs,
 runwayPreflight,runwayAdminAuthorized,submitRunwayShot,resumeRunwayShot,
 saveE02Seed,e02SeedReady,saveE02ShotImage,e02ShotImageReady,
 RUNWAY_MAX_SCENE_USD,RUNWAY_SHOT_USD} from '@/lib/v7/production/runway-e02-engine';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{filmId:string}>};
function localOnly(request:Request){return localOriginAllowed(request);}
async function filmAllowed(ctx:Context){
 const {filmId}=await ctx.params;
 if(filmId!==E02_FILM_ID)throw new Error('Película no habilitada.');
 const bundle=await readV7FilmBundle(filmId);
 if(bundle.film.id!==E02_FILM_ID)throw new Error('Película no coincide.');
}
function responseError(code:number,message:string){
 return NextResponse.json({ok:false,error:message},{status:code,
  headers:{'Cache-Control':'private, no-store'}});
}
function scrub(e:unknown){
 const raw=String(e instanceof Error?e.message:e);
 return raw.replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]')
  .replace(/AIza[A-Za-z0-9_-]+/g,'[GOOGLE_KEY_REDACTED]')
  .replace(/https?:\/\/[^\s]+/g,'[PRIVATE_URL]').slice(0,350);
}
export async function GET(request:Request,ctx:Context){
 if(!localOnly(request))return responseError(403,'Solo estudio local.');
 try{
  await filmAllowed(ctx);
  const specs=runwayShotSpecs();
  const records=await Promise.all(specs.map(s=>readRunwayRecord(s.id)));
  return NextResponse.json({ok:true,provider:'runway',model:'gen4_turbo',
   durationSeconds:10,editDurationSeconds:55,estimatedUsdPerShot:RUNWAY_SHOT_USD,
   seedReady:await e02SeedReady(),
   maxSceneUsd:await runwayEffectiveSceneBudgetUsd(),reservedUsd:await runwayReservedUsd(),
   configured:Boolean(process.env.RUNWAYML_API_SECRET),
   enabled:runwayEnabled(),newGenerationRequests:0,
   shots:await Promise.all(specs.map(async(s,i)=>({...s,
    imageReady:await e02ShotImageReady(s.id),status:records[i]?.status??'not-started',
    taskKnown:Boolean(records[i]?.taskId),videoReady:records[i]?.status==='review-required',
    referenceShotId:records[i]?.referenceShotId??null,error:records[i]?.error??null})))},
   {headers:{'Cache-Control':'private, no-store'}});
 }catch{return responseError(404,'No se pudo abrir el tablero de Runway.');}
}
export async function POST(request:Request,ctx:Context){
 if(!localOnly(request))return responseError(403,'Origen no autorizado.');
 if(Number(request.headers.get('content-length')??0)>5000000)return responseError(413,'Solicitud demasiado grande.');
 const rawType=(request.headers.get('content-type')??'').split(';')[0].trim().toLowerCase();
 // Binary transport: avoid multipart formData() parsing and proxy upload
 // transformations. One file per request; guaranteed JSON responses here.
 if(['image/jpeg','image/png','image/webp'].includes(rawType)){
  if(!runwayAdminAuthorized(request))return responseError(403,'Sesión administrativa expirada. Reinicia el estudio local.');
  const id=request.headers.get('x-v7-shot-id')??'';
  if(!/^E02-P0[1-7]$/.test(id))return responseError(400,'Identificador de toma inválido.');
  try{
   await filmAllowed(ctx);
   const bytes=Buffer.from(await request.arrayBuffer());
   if(bytes.length<3000||bytes.length>4000000)
    return responseError(413,'La imagen debe medir entre 3 KB y 4 MB.');
   const saved=await saveE02ShotImage(id,bytes);
   const onDisk=await e02ShotImageReady(id);
   if(!onDisk)return responseError(500,'La imagen no quedó en disco. No se ha iniciado ningún render.');
   return NextResponse.json({ok:true,...saved,imageReady:onDisk,additionalSpendUsd:0,
    newGenerationRequests:0,transport:'binary'},{headers:{'Cache-Control':'private,no-store'}});
  }catch(e){return responseError(409,scrub(e));}
 }
 if(rawType==='multipart/form-data'){
  if(!runwayAdminAuthorized(request))return responseError(403,'Token incorrecto.');
  try{
   await filmAllowed(ctx);
   const data=await request.formData();
   if(!['upload-seed','upload-shot-image'].includes(String(data.get('action'))))
    return responseError(400,'Acción no válida.');
   const image=data.get('image');
   if(!(image instanceof File))return responseError(400,'Selecciona una imagen.');
   if(!['image/jpeg','image/png','image/webp'].includes(image.type))
    return responseError(415,'Formato admitido: JPG, PNG o WebP.');
   if(image.size>4000000||image.size<3000)return responseError(413,'Imagen fuera del tamaño permitido.');
   const action=String(data.get('action'));
   const id=data.get('shotId');
   if(action==='upload-shot-image'&&(typeof id!=='string'||!/^E02-P0[1-7]$/.test(id)))
    return responseError(400,'Toma de imagen inválida.');
   const result=action==='upload-seed'
    ?await saveE02Seed(Buffer.from(await image.arrayBuffer()))
    :await saveE02ShotImage(id as string,Buffer.from(await image.arrayBuffer()));
   return NextResponse.json({ok:true,...result,additionalSpendUsd:0,newGenerationRequests:0},
    {headers:{'Cache-Control':'no-store'}});
  }catch(e){return responseError(409,scrub(e));}
 }
 if(!rawType.includes('application/json'))return responseError(415,'Se requiere JSON.');
 let body:Record<string,unknown>;
 try{body=await request.json() as Record<string,unknown>;}catch{return responseError(400,'JSON inválido.');}
 if(!body||typeof body!=='object'||Array.isArray(body))return responseError(400,'Solicitud inválida.');
 const action=body.action;
 const id=body.shotId;
 if(!['preflight','submit','resume'].includes(String(action))||
  typeof id!=='string'||!/^E02-P0[1-7]$/.test(id))return responseError(400,'Acción o toma inválida.');
 if(action!=='preflight'&&!runwayAdminAuthorized(request))return responseError(403,'Token administrativo inválido.');
 try{
  await filmAllowed(ctx);
  if(action==='preflight')return NextResponse.json({ok:true,...await runwayPreflight(id),
   providerCalls:0,additionalSpendUsd:0});
  if(action==='resume')return NextResponse.json({ok:true,...await resumeRunwayShot(id),
   additionalNewGenerationRequests:0});
  if(body.confirmHuman!==true||body.explicitSpendConsent!==true||
    typeof body.promptHash!=='string'||body.approvedUsd!==RUNWAY_SHOT_USD)
   return responseError(400,'Debes confirmar expresamente el gasto de esta toma.');
  const result=await submitRunwayShot(id,body.promptHash,RUNWAY_SHOT_USD);
  return NextResponse.json({ok:true,...result},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return responseError(409,scrub(e));}
}
