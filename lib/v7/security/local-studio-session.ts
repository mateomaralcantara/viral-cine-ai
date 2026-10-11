import {createHmac,timingSafeEqual} from 'node:crypto';

export const LOCAL_SESSION_COOKIE='viralcine_v7_local_session';
const lifetime=8*60*60;
const localhost=new Set(['localhost','127.0.0.1','::1']);
export function localOriginAllowed(request:Request){
 const url=new URL(request.url);
 const origin=request.headers.get('origin');
 const site=request.headers.get('sec-fetch-site');
 return process.env.NODE_ENV==='development' &&
  localhost.has(url.hostname) &&
  (!origin||origin===url.origin) &&
  (!site||site==='same-origin'||site==='none');
}
function secret(){
 const token=process.env.V7_CINEMA_ADMIN_TOKEN?.trim()??'';
 if(!/^[a-fA-F0-9]{64}$/.test(token))return null;
 return token;
}
function signature(payload:string,key:string){
 return createHmac('sha256',key).update('v7-local-session:'+payload).digest('hex');
}
export function issueLocalSession(request:Request,now=Math.floor(Date.now()/1000)){
 if(!localOriginAllowed(request))return null;
 const key=secret();
 if(!key)return null;
 const expires=now+lifetime;
 const payload=String(expires);
 return {value:payload+'.'+signature(payload,key),expires};
}
export function hasLocalSession(request:Request,now=Math.floor(Date.now()/1000)){
 if(!localOriginAllowed(request))return false;
 const key=secret();
 if(!key)return false;
 const cookies=request.headers.get('cookie')??'';
 const token=cookies.split(';').map(x=>x.trim())
  .find(x=>x.startsWith(LOCAL_SESSION_COOKIE+'='))
  ?.slice(LOCAL_SESSION_COOKIE.length+1);
 if(!token)return false;
 const pieces=token.split('.');
 if(pieces.length!==2||!/^[0-9]{10}$/.test(pieces[0])||
  !/^[a-f0-9]{64}$/.test(pieces[1]))return false;
 const exp=Number(pieces[0]);
 if(exp<=now||exp>now+lifetime+60)return false;
 const a=Buffer.from(pieces[1],'hex');
 const b=Buffer.from(signature(pieces[0],key),'hex');
 return a.length===b.length&&timingSafeEqual(a,b);
}
export function localAdminAuthorized(request:Request){
 if(!localOriginAllowed(request))return false;
 if(hasLocalSession(request))return true;
 const key=secret();
 const bearer=request.headers.get('authorization')?.replace(/^Bearer /i,'').trim()??'';
 if(!key||bearer.length!==key.length)return false;
 const a=Buffer.from(key),b=Buffer.from(bearer);
 return a.length===b.length&&timingSafeEqual(a,b);
}
