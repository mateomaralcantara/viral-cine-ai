import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COOKIE = 'v8e02_owner';
const ENDPOINT = 'https://wrxeerltoapvybhaxlmu.supabase.co/functions/v1/viralcine-v8-console-api';
const allowed = new Set(['info','setup','login','logout','status','save-key','balance','launch','pause']);

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({error:'Solicitud de otro sitio bloqueada.'},{status:403});
  }
  try {
    const body = await request.text();
    if(body.length>6000) return NextResponse.json({error:'Solicitud demasiado grande.'},{status:413});
    const parsed = JSON.parse(body) as Record<string,unknown>;
    const action = parsed?.action;
    if(typeof action!=='string'||!allowed.has(action)){
      return NextResponse.json({error:'Acción no permitida.'},{status:400});
    }
    const upstream = await fetch(ENDPOINT,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-v8-owner-session':request.cookies.get(COOKIE)?.value||''
      },
      body:JSON.stringify(parsed),
      cache:'no-store',
      signal:AbortSignal.timeout(25000)
    });
    const output = await upstream.json() as Record<string,unknown>;
    const session = output.ownerSession;
    delete output.ownerSession; // NEVER return the bearer session to browser JS.
    const response = NextResponse.json(output,{status:upstream.status,headers:{
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer'
    }});
    if(upstream.ok&&(action==='setup'||action==='login')&&
       typeof session==='string'&&session.length>=48) {
      response.cookies.set(COOKIE,session,{
        httpOnly:true,secure:process.env.NODE_ENV==='production',
        sameSite:'strict',path:'/api/v8/scene2',
        maxAge:48*60*60
      });
    }
    if(action==='logout'){
      response.cookies.set(COOKIE,'',{path:'/api/v8/scene2',maxAge:0});
    }
    return response;
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'Error de conexión'},
      {status:503,headers:{'Cache-Control':'no-store'}});
  }
}
