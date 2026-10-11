import {NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {issueLocalSession,localOriginAllowed,LOCAL_SESSION_COOKIE} from '@/lib/v7/security/local-studio-session';

export const runtime='nodejs';
export const dynamic='force-dynamic';
let consumed=false;
export async function POST(request:Request){
 if(!localOriginAllowed(request))return NextResponse.json({ok:false,error:'Solo estudio local.'},{status:403});
 const provided=(await request.json().catch(()=>null)) as {pairCode?:unknown}|null;
 const expected=process.env.V7_STUDIO_PAIR_CODE??'';
 const input=provided?.pairCode;
 if(consumed||typeof input!=='string'||expected.length!==64||input.length!==64||
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
