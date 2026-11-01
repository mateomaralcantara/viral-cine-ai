import {NextResponse} from 'next/server';
import {localOriginAllowed} from '@/lib/v7/security/local-studio-session';
import {approvedE02References,getApprovedE02Image} from '@/lib/v7/production/e02-supabase-references';
import {E02_FILM_ID,E02_SHOTS} from '@/lib/v7/production/dos-toques-e02-shot-packets';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{filmId:string}>};
const cache={'Cache-Control':'private,no-store'};

export async function GET(request:Request,ctx:Context){
 if(!localOriginAllowed(request))
  return NextResponse.json({ok:false,error:'Solo estudio local.'},{status:403,headers:cache});
 const {filmId}=await ctx.params;
 if(filmId!==E02_FILM_ID)
  return NextResponse.json({ok:false,error:'Pelicula no habilitada.'},{status:404,headers:cache});
 try{
  const shotId=new URL(request.url).searchParams.get('shot');
  if(shotId!==null){
   if(!E02_SHOTS.some(s=>s.id===shotId))
    return NextResponse.json({ok:false,error:'Toma desconocida.'},{status:404,headers:cache});
   const image=await getApprovedE02Image(shotId);
   if(!image)return NextResponse.json({ok:false,error:'Imagen no disponible.'},{status:404,headers:cache});
   return new Response(new Uint8Array(image.bytes),{headers:{
    ...cache,'Content-Type':'image/jpeg','X-Content-Type-Options':'nosniff',
    ETag:'"'+image.hash+'"'
   }});
  }
  const board=await approvedE02References();
  return NextResponse.json({ok:true,configured:board.configured,approvedCount:board.approvedCount,
   requiredCount:7,images:E02_SHOTS.map(s=>({
    id:s.id,approved:board.shots[s.id]?.approved===true,
    ready:board.shots[s.id]?.readyForScene===true,
    sha256:board.shots[s.id]?.sha256??null,
    url:board.shots[s.id]?.readyForScene
     ?'/api/v7/films/'+encodeURIComponent(E02_FILM_ID)+'/scene02-gallery?shot='+encodeURIComponent(s.id)
     :null
   }))},{headers:cache});
 }catch{
  return NextResponse.json({ok:false,error:'Galeria de fotos no verificable.'},
   {status:503,headers:cache});
 }
}
