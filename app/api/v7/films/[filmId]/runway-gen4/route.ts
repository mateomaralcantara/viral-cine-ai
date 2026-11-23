import {NextResponse} from 'next/server';
import {readV7FilmBundle} from '@/lib/v7/storage/film-store';
import {E01_FILM_ID} from '@/lib/v7/production/dos-toques-e01-shot-packets';
import {readRunwayRecord,runwayReservedUsd,runwayEnabled,runwayShotSpecs,
 runwayPreflight,runwayAdminAuthorized,submitRunwayShot,resumeRunwayShot,
 RUNWAY_MAX_SCENE_USD,RUNWAY_SHOT_USD} from '@/lib/v7/production/runway-gen4-turbo';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{filmId:string}>};
function localOnly(request:Request){
 const url=new URL(request.url);
 return process.env.NODE_ENV==='development'&&
  ['localhost','127.0.0.1','::1'].includes(url.hostname)&&
  (!request.headers.get('origin')||request.headers.get('origin')===url.origin);
}
async function filmAllowed(ctx:Context){
 const {filmId}=await ctx.params;
 if(filmId!==E01_FILM_ID)throw new Error('Película no habilitada.');
 const bundle=await readV7FilmBundle(filmId);
 if(bundle.film.id!==E01_FILM_ID)throw new Error('Película no coincide.');
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
   durationSeconds:10,editSecondsPerShot:7,estimatedUsdPerShot:RUNWAY_SHOT_USD,
   maxSceneUsd:RUNWAY_MAX_SCENE_USD,reservedUsd:await runwayReservedUsd(),
   configured:Boolean(process.env.RUNWAYML_API_SECRET),
   enabled:runwayEnabled(),newGenerationRequests:0,
   shots:specs.map((s,i)=>({...s,status:records[i]?.status??'not-started',
    taskKnown:Boolean(records[i]?.taskId),videoReady:records[i]?.status==='review-required',
    referenceShotId:records[i]?.referenceShotId??null,error:records[i]?.error??null}))},
   {headers:{'Cache-Control':'private, no-store'}});
 }catch{return responseError(404,'No se pudo abrir el tablero de Runway.');}
}
export async function POST(request:Request,ctx:Context){
 if(!localOnly(request))return responseError(403,'Origen no autorizado.');
 if(Number(request.headers.get('content-length')??0)>8000)return responseError(413,'Solicitud demasiado grande.');
 let body:Record<string,unknown>;
 try{body=await request.json() as Record<string,unknown>;}catch{return responseError(400,'JSON inválido.');}
 if(!body||typeof body!=='object'||Array.isArray(body))return responseError(400,'Solicitud inválida.');
 const action=body.action;
 const id=body.shotId;
 if(!['preflight','submit','resume'].includes(String(action))||
  typeof id!=='string'||!/^E01-P0[3-7]$/.test(id))return responseError(400,'Acción o toma inválida.');
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
