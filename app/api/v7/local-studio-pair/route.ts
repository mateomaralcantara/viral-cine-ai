import {NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {issueLocalSession,localOriginAllowed,hasLocalSession,LOCAL_SESSION_COOKIE} from '@/lib/v7/security/local-studio-session';

export const runtime='nodejs';
export const dynamic='force-dynamic';
let consumed=false;
export async function POST(request:Request){
 if(!localOriginAllowed(request))return NextResponse.json({ok:false,error:'Solo estudio local.'},{status:403});
 const provided=(await request.json().catch(()=>null)) as {pairCode?:unknown}|null;
 const expected=process.env.V7_STUDIO_PAIR_CODE??'';
 const expiration=Number(process.env.V7_STUDIO_PAIR_EXPIRES??'0');
 const input=provided?.pairCode;
 if(consumed||!Number.isFinite(expiration)||expiration<=Date.now()/1000||typeof input!=='string'||expected.length!==64||input.length!==64||
    !/^[a-f0-9]{64}$/.test(expected)||!/^[a-f0-9]{64}$/.test(input)||
    !timingSafeEqual(Buffer.from(input),Buffer.from(expected))){
  return NextResponse.json({ok:false,error:'Enlace de sesión expirado. Reinicia el estudio para autorizar.'},
   {status:403,headers:{'Cache-Control':'no-store'}});
 }
 const session=issueLocalSession(request);
 if(!session)return NextResponse.json({ok:false,error:'Sesión local no disponible.'},{status:403});
 consumed=true;
 const response=NextResponse.json({ok:true,paired:true},{headers:{'Cache-Control':'private,no-store'}});
 response.cookies.set(LOCAL_SESSION_COOKIE,session.value,{
  httpOnly:true,sameSite:'strict',secure:false,path:'/api/v7',maxAge:8*60*60
 });
 return response;
}

export async function GET(request:Request){
 if(!localOriginAllowed(request))return NextResponse.json({
  ok:false,authenticated:false,error:'Solo estudio local en 127.0.0.1.'
 },{status:403,headers:{'Cache-Control':'private,no-store'}});
 if(hasLocalSession(request)){
  return NextResponse.json({ok:true,authenticated:true,requiresPairing:false},{
   headers:{'Cache-Control':'private,no-store'}
  });
 }
 // Studio opens only on loopback in NODE_ENV=development. The status request
 // comes from the actual same-origin application, never from an external
 // web page or a cross-site navigation. Auto-pair only that browser context.
 // This removes the unreliable Windows background-job/browser pairing flow.
 const sameOriginFetch=request.headers.get('sec-fetch-site')==='same-origin'&&
  request.headers.get('sec-fetch-dest')==='empty';
 if(sameOriginFetch){
  const session=issueLocalSession(request);
  if(session){
   const response=NextResponse.json({
    ok:true,authenticated:true,requiresPairing:false,autoPaired:true,
    paidGenerationAutoAuthorized:false
   },{headers:{'Cache-Control':'private,no-store'}});
   response.cookies.set(LOCAL_SESSION_COOKIE,session.value,{
    httpOnly:true,sameSite:'strict',secure:false,path:'/api/v7',
    maxAge:8*60*60
   });
   return response;
  }
 }
 return NextResponse.json({
  ok:true,authenticated:false,requiresPairing:true,
  error:'No se pudo iniciar la sesión local; verifica que PowerShell haya levantado ViralCine con su token.'
 },{headers:{'Cache-Control':'private,no-store'}});
}
