import {NextResponse} from 'next/server';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {localOriginAllowed,localAdminAuthorized} from '@/lib/v7/security/local-studio-session';
import {v7FilmRoot,readV7FilmBundle} from '@/lib/v7/storage/film-store';
import {E02_FILM_ID,E02_SHOTS} from '@/lib/v7/production/dos-toques-e02-shot-packets';
import {approvedE02References,uploadAndApproveE02Reference}
 from '@/lib/v7/production/e02-supabase-references';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Ctx={params:Promise<{filmId:string}>};
function failure(status:number,error:string){
 return NextResponse.json({ok:false,error},{status,headers:{'Cache-Control':'private,no-store'}});
}
async function validFilm(ctx:Ctx){
 const {filmId}=await ctx.params;
 if(filmId!==E02_FILM_ID)throw Error('Película no habilitada.');
 const bundle=await readV7FilmBundle(filmId);
 if(bundle.film.id!==E02_FILM_ID)throw Error('Película no coincide.');
}
export async function GET(req:Request,ctx:Ctx){
 if(!localOriginAllowed(req))return failure(403,'Solo estudio local.');
 if(!localAdminAuthorized(req))return failure(403,'Sesión local no autorizada.');
 try{
  await validFilm(ctx);
  return NextResponse.json(await approvedE02References(),{
   headers:{'Cache-Control':'private,no-store'}});
 }catch(e){return failure(503,e instanceof Error?e.message:'No se pudo leer Supabase.');}
}
export async function POST(req:Request,ctx:Ctx){
 if(!localOriginAllowed(req))return failure(403,'Origen no autorizado.');
 if(!localAdminAuthorized(req))return failure(403,'Sesión local no autorizada.');
 try{await validFilm(ctx);}
 catch(e){return failure(404,e instanceof Error?e.message:'Película no encontrada.');}
 const len=Number(req.headers.get('content-length')||'0');
 if(len>4500000)return failure(413,'La imagen excede 4 MB.');
 const type=(req.headers.get('content-type')||'').split(';')[0].toLowerCase();
 if(type==='application/json'){
  const body=await req.json().catch(()=>null) as {action?:string}|null;
  if(body?.action!=='sync-existing')return failure(400,'Acción no reconocida.');
  const output:{shotId:string;approved:boolean;reason?:string}[]=[];
  for(const shot of E02_SHOTS){
   const board=await approvedE02References();
   if(board.shots[shot.id]?.approved&&board.shots[shot.id].readyForScene){
    output.push({shotId:shot.id,approved:true});continue;
   }
   const local=path.join(v7FilmRoot(E02_FILM_ID),shot.id.toLowerCase(),
    shot.id+'-image-reference.jpg');
   try{
    const bytes=await readFile(local);
    const result=await uploadAndApproveE02Reference(shot.id,bytes,path.basename(local));
    output.push({shotId:shot.id,approved:result.approved});
   }catch(e){
    output.push({shotId:shot.id,approved:false,
     reason:e instanceof Error?e.message.slice(0,160):'No existe JPG local'});
   }
  }
  const board=await approvedE02References();
  return NextResponse.json({ok:true,imported:output,board,
   newGenerationRequests:0,additionalSpendUsd:0},{headers:{'Cache-Control':'private,no-store'}});
 }
 const id=req.headers.get('x-v7-shot-id')||'';
 if(!E02_SHOTS.some(s=>s.id===id))return failure(400,'Toma inválida.');
 if(!['image/jpeg','image/png','image/webp'].includes(type))
  return failure(415,'Selecciona JPG, PNG o WebP.');
 const filename=(req.headers.get('x-v7-filename')||id+'.jpg').slice(0,240);
 try{
  const bytes=Buffer.from(await req.arrayBuffer());
  const result=await uploadAndApproveE02Reference(id,bytes,filename);
  return NextResponse.json(result,{headers:{'Cache-Control':'private,no-store'}});
 }catch(e){return failure(422,e instanceof Error?e.message:'No se pudo guardar la imagen en Supabase.');}
}
