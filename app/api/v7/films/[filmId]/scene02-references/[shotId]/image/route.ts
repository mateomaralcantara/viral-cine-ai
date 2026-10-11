import {NextResponse} from 'next/server';
import {localOriginAllowed,localAdminAuthorized} from '@/lib/v7/security/local-studio-session';
import {E02_FILM_ID,E02_SHOTS} from '@/lib/v7/production/dos-toques-e02-shot-packets';
import {getApprovedE02Image} from '@/lib/v7/production/e02-supabase-references';
import {readV7FilmBundle} from '@/lib/v7/storage/film-store';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Params={params:Promise<{filmId:string;shotId:string}>};
const fail=(status:number,message:string)=>NextResponse.json(
 {ok:false,error:message},{status,headers:{'Cache-Control':'private, no-store'}});

/**
 * Images remain in PRIVATE Supabase Storage. Only the existing,
 * authenticated local studio on localhost:3010 can preview them.
 * No public bucket, shared service key, cloud copy, or paid generation.
 */
export async function GET(request:Request,{params}:Params){
 if(!localOriginAllowed(request)||!localAdminAuthorized(request))
  return fail(403,'Vista privada: primero inicia la sesión del estudio local.');
 const {filmId,shotId}=await params;
 if(filmId!==E02_FILM_ID||!E02_SHOTS.some(s=>s.id===shotId))
  return fail(404,'La fotografía no pertenece a E02.');
 try{
  const bundle=await readV7FilmBundle(filmId);
  if(bundle.film.id!==E02_FILM_ID)return fail(404,'Película incorrecta.');
  const image=await getApprovedE02Image(shotId);
  if(!image)return fail(404,'Fotografía aún no consultable desde este servidor.');
  return new NextResponse(new Uint8Array(image.bytes),{
   status:200,
   headers:{
    'Content-Type':'image/jpeg',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
    'Content-Length':String(image.bytes.length),
    'ETag':'"'+image.hash+'"'
   }
  });
 }catch{
  return fail(503,'No fue posible recuperar la fotografía privada desde Supabase.');
 }
}
