// ViralCine V8 E02: JSON-only control API for same-origin Next.js frontend.
// Browser cannot access Supabase service-role credentials or Vault directly.
const PROJECT="wrxeerltoapvybhaxlmu",FILM="film-dos-toques-de-bocina-v7";
type Obj=Record<string,any>;
const res=(x:unknown,status=200)=>new Response(JSON.stringify(x),{
 status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return res({error:"method-not-allowed"},405);
 const url=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url.includes(PROJECT)||key.length<20)return res({error:"backend-not-ready"},503);
 const auth={Authorization:"Bearer "+key,apikey:key,"Content-Type":"application/json"};
 const api=async(path:string,method="GET",payload?:unknown):Promise<any>=>{
  const rr=await fetch(url+path,{method,headers:auth,...(payload===undefined?{}:
   {body:JSON.stringify(payload)}),signal:AbortSignal.timeout(14000),cache:"no-store"});
  if(!rr.ok)throw Error("supabase-api-http-"+rr.status+":"+path.split("?")[0]);
  const raw=await rr.text();return raw.trim()?JSON.parse(raw):{};
 };
 const rpc=(name:string,payload:Obj={})=>api("/rest/v1/rpc/"+name,"POST",payload);
 try{
  const raw=await req.text();
  if(raw.length>6000)return res({error:"payload-too-large"},413);
  const body=JSON.parse(raw) as Obj;
  if(!body||typeof body!=="object"||Array.isArray(body))return res({error:"invalid-request"},400);
  const action=String(body.action||"");
  if(action==="info"){
   const v=await rpc("v8_e02_panel_auth",{p_action:"info"});
   const session=String(req.headers.get("x-v8-owner-session")||"");
   const valid=await rpc("v8_e02_panel_auth",{p_action:"verify",p_session:session});
   return res({ok:true,setupRequired:v.setupRequired===true,authenticated:valid.ok===true});
  }
  if(action==="setup"||action==="login"){
   const x=await rpc("v8_e02_panel_auth",{
    p_action:action,p_bootstrap:action==="setup"?String(body.code||""):null,
    p_password:String(body.password||"")
   });
   if(x.ok!==true)return res({error:x.error||"invalid-credentials"},401);
   return res({ok:true,ownerSession:x.session});
  }
  const session=String(req.headers.get("x-v8-owner-session")||"");
  if(action==="logout"){
   await rpc("v8_e02_panel_auth",{p_action:"logout",p_session:session});
   return res({ok:true});
  }
  const valid=await rpc("v8_e02_panel_auth",{p_action:"verify",p_session:session});
  if(valid.ok!==true)return res({error:"Acceso vencido; inicia sesión nuevamente"},401);
  const runway=async(secret:string)=>{
   const rr=await fetch("https://api.dev.runwayml.com/v1/organization",{
    headers:{Authorization:"Bearer "+secret,"X-Runway-Version":"2024-11-06"},
    signal:AbortSignal.timeout(14000),cache:"no-store"});
   if(!rr.ok)throw Error("Runway API devolvió HTTP "+rr.status);
   const j=await rr.json();const credits=Number(j.creditBalance);
   if(!Number.isFinite(credits)||credits<0)throw Error("No se pudo comprobar el saldo real de Runway");
   return Math.floor(credits);
  };
  const getKey=async()=>{
   const secret=await rpc("v8_e02_get_runway_secret");
   if(typeof secret!=="string"||secret.length<20)throw Error("Conecta tu clave de Runway primero");
   return secret;
  };
  if(action==="save-key"){
   const k=String(body.key||"").trim();
   if(k.length<20||k.length>500||!/^[A-Za-z0-9_-]+$/.test(k))
    return res({error:"Clave de Runway inválida"},400);
   const creditBalance=await runway(k);
   await rpc("v8_e02_panel_store_runway_secret",{p_secret:k});
   return res({ok:true,creditBalance,configured:true});
  }
  if(action==="balance"){
   const creditBalance=await runway(await getKey());
   return res({ok:true,creditBalance,requiredCredits:350,sufficient:creditBalance>=350});
  }
  if(action==="launch"){
   const creditBalance=await runway(await getKey());
   if(creditBalance<350)return res({error:"Runway dispone de "+creditBalance+
    " créditos API; hacen falta 350 para E02."},409);
   const x=await rpc("v8_e02_panel_control",{p_action:"launch",p_available_credits:creditBalance});
   if(x.status!=="armed")return res({error:"Lanzamiento bloqueado: "+(x.reason||"política financiera")},409);
   return res({ok:true,...x,creditBalance});
  }
  if(action==="pause"){
   const x=await rpc("v8_e02_panel_control",{p_action:"pause"});
   return res({ok:true,...x});
  }
  if(action!=="status")return res({error:"unknown-action"},400);
  const f="film_id=eq."+FILM;
  const [policies,intents,refs,outputs,reservations,qa]=await Promise.all([
   api("/rest/v1/v8_film_autonomy_policy?"+f+
    "&select=status,authorized_spend_usd,spent_or_reserved_usd,provider_balance_confirmed,video_provider"),
   api("/rest/v1/v8_e02_render_intents?"+f+
    "&scene_id=eq.E02&select=shot_id,state,duration_seconds,runway_task_id,reference_sha256&order=shot_id.asc"),
   api("/rest/v1/scene_reference_images?"+f+
    "&scene_id=eq.E02&active=eq.true&select=shot_id,approved,status,storage_bucket,storage_path"),
   api("/rest/v1/v8_e02_render_outputs?"+f+
    "&scene_id=eq.E02&select=shot_id,storage_bucket,storage_path,video_sha256,qa_status"),
   api("/rest/v1/v8_e02_runway_reservations?"+f+
    "&scene_id=eq.E02&select=shot_id,state,provider_task_id,maximum_usd"),
   api("/rest/v1/v8_e02_video_qa?"+f+"&scene_id=eq.E02&select=shot_id,approved")
  ]);
  const of=(arr:Obj[],id:string)=>arr.find(x=>x.shot_id===id);
  const signed=async(bucket:string,path:string)=>{
   try{
    const encoded=path.split("/").map(encodeURIComponent).join("/");
    const x=await api("/storage/v1/object/sign/"+bucket+"/"+encoded,
      "POST",{expiresIn:1200});
    const s=String(x.signedURL||"");
    return s.startsWith("/object/")?url+"/storage/v1"+s:
      s.startsWith("https://"+PROJECT+".supabase.co")?s:null;
   }catch{return null;}
  };
  const shots=await Promise.all((intents as Obj[]).map(async(i:Obj)=>{
   const r=of(refs,i.shot_id),o=of(outputs,i.shot_id),v=of(reservations,i.shot_id);
   return {id:i.shot_id,state:i.state,duration:i.duration_seconds,
    referenceReady:r?.approved===true&&r?.status==="ready",
    imageUrl:r?await signed(r.storage_bucket,r.storage_path):null,
    videoUrl:o?await signed(o.storage_bucket,o.storage_path):null,
    videoSha256:o?.video_sha256||null,
    qaApproved:of(qa,i.shot_id)?.approved===true,
    taskId:i.runway_task_id||null,
    reservation:v?.state||null};
  }));
  const sk=await rpc("v8_e02_get_runway_secret");
  return res({ok:true,shots,total:shots.length,policy:policies[0]||null,
   runwayKeyConfigured:typeof sk==="string"&&sk.length>20,
   videoCount:outputs.length,qaCount:qa.filter((x:Obj)=>x.approved).length,
   updatedAt:new Date().toISOString()});
 }catch(e){
  return res({error:e instanceof Error?e.message.slice(0,180):"Error interno"},400);
 }
});
