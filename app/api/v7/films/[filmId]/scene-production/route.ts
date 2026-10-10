import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { readV7FilmBundle } from '@/lib/v7/storage/film-store';
import { approveBoardTarget, readSceneApprovalBoard } from '@/lib/v7/production/scene-approval-board';
import { planCompleteFilmScenes, SCENE_AGENT_FAMILIES } from '@/lib/v7/orchestration/scene-family-engine';
import { assembleApprovedSceneLocally } from '@/lib/v7/production/scene-local-assembler';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{filmId:string}>};
function localOnly(request:Request){
  const url=new URL(request.url);
  const origin=request.headers.get('origin');
  return process.env.NODE_ENV==='development' &&
    ['localhost','127.0.0.1','::1'].includes(url.hostname) &&
    (!origin||origin===url.origin);
}
function administrator(request:Request){
  const secret=process.env.V7_CINEMA_ADMIN_TOKEN||'';
  const supplied=request.headers.get('authorization')?.replace(/^Bearer /i,'')||'';
  if(secret.length<24||supplied.length!==secret.length)return false;
  const a=Buffer.from(secret,'utf8'),b=Buffer.from(supplied,'utf8');
  return a.length===b.length&&timingSafeEqual(a,b);
}
function responseError(code:number,message:string){
  return NextResponse.json({ok:false,error:message},{status:code,headers:{'Cache-Control':'private, no-store'}});
}
export async function GET(request:Request,ctx:Context){
  if(!localOnly(request))return responseError(403,'Solo estudio local.');
  try{
    const {filmId}=await ctx.params;
    const film=(await readV7FilmBundle(filmId)).film;
    const board=await readSceneApprovalBoard(film);
    // A single GET can serve an entire film, without N endpoints per shot.
    return NextResponse.json({ok:true,...board,families:SCENE_AGENT_FAMILIES,
      pipeline:{mode:'preflight-only',phase:'scene-families-v1',plannedSteps:planCompleteFilmScenes(film).steps.length,
        paidProviderDispatchEnabled:false,automaticPaidRetries:0}},
      {headers:{'Cache-Control':'private, no-store'}});
  }catch{
    return responseError(404,'No se pudo obtener el tablero de la película.');
  }
}
export async function POST(request:Request,ctx:Context){
  if(!localOnly(request)||!administrator(request))return responseError(403,'Token u origen inválido.');
  if(Number(request.headers.get('content-length')||0)>12000)return responseError(413,'Solicitud demasiado grande.');
  let body:unknown;
  try{body=await request.json();}
  catch{return responseError(400,'JSON inválido.');}
  if(!body||typeof body!=='object')return responseError(400,'Solicitud inválida.');
  const payload=body as Record<string,unknown>;
  if(payload.action==='assemble-local'){
    if(typeof payload.sceneId!=='string'||payload.sceneId.length>240)
      return responseError(400,'ID de escena inválido.');
    try{
      const film=(await readV7FilmBundle((await ctx.params).filmId)).film;
      const result=await assembleApprovedSceneLocally(film,payload.sceneId);
      return NextResponse.json({ok:true,...result,externalApiCalls:0,additionalSpendUsd:0});
    }catch{
      return responseError(409,'Montaje local no completado. Revisar que todos los clips estén aprobados e íntegros.');
    }
  }
  if(payload.action!=='approve-artistic'||payload.confirmHuman!==true||
     !['shot','scene'].includes(String(payload.targetType))||
     typeof payload.targetId!=='string'||payload.targetId.length>240||
     typeof payload.notes!=='string'||payload.notes.length>1000){
    return responseError(400,'Se exige aprobación humana explícita y un objetivo válido.');
  }
  const checks=payload.checks;
  if(!checks||typeof checks!=='object'||Array.isArray(checks))return responseError(400,'Verificaciones de calidad inválidas.');
  const validated=checks as Record<string,unknown>;
  if(validated.identityWardrobe!=='pass'||validated.voiceSound!=='pass'||
     validated.motionContinuity!=='pass')return responseError(400,'Las tres comprobaciones deben ser PASS.');
  try{
    const film=(await readV7FilmBundle((await ctx.params).filmId)).film;
    const result=await approveBoardTarget(film,{
      targetType:payload.targetType as 'shot'|'scene',targetId:payload.targetId as string,
      notes:payload.notes as string,
      checks:{identityWardrobe:'pass',voiceSound:'pass',motionContinuity:'pass'}
    });
    return NextResponse.json({ok:true, ...result,externalApiCalls:0,additionalSpendUsd:0},{
      headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    const e=error as NodeJS.ErrnoException;
    if(e.code==='EEXIST')return responseError(409,'Aprobación concurrente; actualiza tablero.');
    if(e.code==='ENOENT')return responseError(409,'Falta un archivo de la toma.');
    // Never leak provider errors, secrets or filesystem paths to the browser.
    return responseError(409,'Aprobación no disponible. Verifica el MP4 y las dependencias de la escena.');
  }
}
