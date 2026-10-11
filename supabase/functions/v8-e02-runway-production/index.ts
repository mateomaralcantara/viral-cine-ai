// ViralCine V8 E02 - real Runway dispatcher + recovery (no Avatares).
// Credit-gated: no generation without private Supabase authorization and
// confirmed provider balance. Idempotency: ONE reservation / E02 shot, forever.
// Handles ONE action per invocation: reconcile existing task, or submit 1 shot.
// Real paid submission is impossible while policy.authorized_spend_usd == 0.
const FILM="film-dos-toques-de-bocina-v7";
const PROJECT="wrxeerltoapvybhaxlmu";
const RUNWAY="https://api.dev.runwayml.com";
const MODEL="gen4_turbo";
const BUCKET="viralcine-scene-videos";
type Row=Record<string,any>;
const toJson=(x:unknown,status=200)=>new Response(JSON.stringify(x),
 {status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const fail=(status:string,extra:Row={})=>toJson({status,...extra,generated:false});
const hex=async(bytes:ArrayBuffer)=>{
 const arr=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
 return [...arr].map(b=>b.toString(16).padStart(2,"0")).join("");
};
function base64(bytes:Uint8Array):string{
 let out="";
 for(let i=0;i<bytes.length;i+=8192){
  out+=String.fromCharCode(...bytes.subarray(i,i+8192));
 }
 return btoa(out);
}
function safeProviderUrl(s:unknown):string{
 if(typeof s!=="string")throw Error("missing-provider-output");
 const u=new URL(s);
 if(u.protocol!=="https:"||!u.hostname.includes(".")||
  /^(\d{1,3}\.){3}\d{1,3}$/.test(u.hostname)||
  /^(localhost|127\.|169\.254\.|10\.|192\.168\.)/.test(u.hostname))
  throw Error("unsafe-provider-output");
 return s;
}
Deno.serve(async (request:Request):Promise<Response>=>{
 if(request.method!=="POST")return toJson({error:"method-not-allowed"},405);
 const url=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url.includes(PROJECT)||!key)return fail("blocked-backend-credentials");
 const auth={apikey:key,Authorization:"Bearer "+key};
 const api=async(route:string,method:"GET"|"POST"="GET",body?:unknown):Promise<any>=>{
  const response=await fetch(url+route,{
   method,headers:{...auth,"Content-Type":"application/json"},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),
   signal:AbortSignal.timeout(16000),cache:"no-store"
  });
  if(!response.ok)throw Error("supabase-"+response.status+" "+route.split("?")[0]);
  const txt=await response.text();
  return txt.trim()?JSON.parse(txt):{};
 };
 const token=request.headers.get("x-v8-cron-token")||"";
 if(!/^[a-f0-9]{96}$/.test(token))return toJson({error:"unauthorized"},401);
 try{
  const yes=await api("/rest/v1/rpc/v8_verify_e02_cron_token","POST",{p_token:token});
  if(yes!==true)return toJson({error:"unauthorized"},401);
 }catch{return fail("authentication-unavailable");}
 // Authenticated caller can't pass budget, video parameters, model or shot IDs.
 // All configuration must originate from locked service_role DB rows.
 try{
  const policyRows=await api("/rest/v1/v8_film_autonomy_policy?film_id=eq."+
   FILM+"&select=status,director_mode,video_provider,avatares_enabled,authorized_spend_usd,spent_or_reserved_usd,provider_balance_confirmed");
  const p=policyRows[0] as Row|undefined;
  if(!p||p.video_provider!=="runway"||p.director_mode!=="credits-only"||
    p.avatares_enabled!==false)return fail("blocked-policy");
  const runwayKey=Deno.env.get("RUNWAYML_API_SECRET")||"";
  // Reconcile first: known tasks are never resubmitted and have first priority.
  const reservations=await api("/rest/v1/v8_e02_runway_reservations?film_id=eq."+
   FILM+"&select=id,shot_id,state,provider_task_id,reference_sha256&order=shot_id.asc");
  const tasks=(reservations as Row[]).filter(r=>r.provider_task_id&&
     (r.state==="task-known"||r.state==="video-ready"));
  const existing=tasks.find(r=>r.state==="task-known");
  if(existing){
   if(runwayKey.length<8)return fail("blocked-runway-key",{shotId:existing.shot_id});
   const rq=await fetch(RUNWAY+"/v1/tasks/"+encodeURIComponent(existing.provider_task_id),{
    headers:{"Authorization":"Bearer "+runwayKey,"X-Runway-Version":"2024-11-06"},
    signal:AbortSignal.timeout(15000),cache:"no-store"
   });
   if(!rq.ok)return fail("runway-status-http-"+rq.status,{shotId:existing.shot_id});
   const task=await rq.json();
   const state=String(task.status||"UNKNOWN").toUpperCase();
   if(state==="FAILED"||state==="CANCELED"){
    await api("/rest/v1/rpc/v8_note_e02_runway_transition","POST",{
     p_reservation_id:existing.id,p_transition:"failed-review"
    });
    return fail("failed-needs-review",{shotId:existing.shot_id,taskId:existing.provider_task_id});
   }
   if(state!=="SUCCEEDED")return fail("provider-"+state.toLowerCase(),
     {shotId:existing.shot_id,taskId:existing.provider_task_id});
   const outputUrl=safeProviderUrl(Array.isArray(task.output)?task.output[0]:null);
   const download=await fetch(outputUrl,{
    signal:AbortSignal.timeout(60000),cache:"no-store"
   });
   if(!download.ok)return fail("provider-output-http-"+download.status,
    {shotId:existing.shot_id});
   const size=Number(download.headers.get("content-length")||0);
   if(size>100*1024*1024)return fail("output-too-large",{shotId:existing.shot_id});
   const bytes=await download.arrayBuffer();
   if(bytes.byteLength<10000||bytes.byteLength>100*1024*1024)
    return fail("output-size-invalid",{shotId:existing.shot_id});
   const b=new Uint8Array(bytes);
   if(new TextDecoder().decode(b.slice(4,8))!=="ftyp")
     return fail("mp4-container-invalid",{shotId:existing.shot_id});
   const hash=await hex(bytes);
   const path=FILM+"/e02/"+String(existing.shot_id).toLowerCase()+"/"+hash+".mp4";
   const uploaded=await fetch(url+"/storage/v1/object/"+BUCKET+"/"+path,{
    method:"POST",
    headers:{...auth,"Content-Type":"video/mp4","x-upsert":"false"},
    body:bytes,signal:AbortSignal.timeout(60000)
   });
   if(!uploaded.ok&&uploaded.status!==409)
    return fail("storage-upload-http-"+uploaded.status,{shotId:existing.shot_id});
   // Storage existence + hash-bound task ID are checked again by SQL RPC.
   await api("/rest/v1/rpc/v8_note_e02_runway_transition","POST",{
    p_reservation_id:existing.id,p_transition:"video-ready",
    p_task_id:existing.provider_task_id,p_video_sha256:hash,
    p_storage_path:path,p_file_bytes:bytes.byteLength
   });
   return toJson({status:"video-saved-qa-pending",shotId:existing.shot_id,
    taskId:existing.provider_task_id,videoSha256:hash,
    bytes:bytes.byteLength,runwayPostExecuted:false,paidCallsThisInvocation:0});
  }
  const uncertain=(reservations as Row[]).find(r=>
   ["reserved","submission-uncertain","failed-needs-review"].includes(r.state));
  if(uncertain)return fail("blocked-ambiguous-existing-submission",{
   shotId:uncertain.shot_id,manualReconciliationRequired:true
  });
  // The deliberate hard financial gate precedes download, reservation and POST.
  if(p.status!=="ready"||p.provider_balance_confirmed!==true||
     Number(p.authorized_spend_usd)<=Number(p.spent_or_reserved_usd))
    return fail("waiting-credit-authorization",{
     authorizedUsd:Number(p.authorized_spend_usd),reservedUsd:Number(p.spent_or_reserved_usd),
     runwayKeyConfigured:runwayKey.length>=8,providerBalanceConfirmed:p.provider_balance_confirmed===true
    });
  if(runwayKey.length<8)return fail("blocked-runway-key",{runwayKeyConfigured:false});
  const shots=await api("/rest/v1/v8_e02_render_intents?film_id=eq."+
   FILM+"&scene_id=eq.E02&select=shot_id,state,reference_sha256,reference_bucket,reference_path,prompt_text,duration_seconds,runway_model,output_ratio,runway_task_id&order=shot_id.asc");
  if(!Array.isArray(shots)||shots.length!==7)return fail("incomplete-shot-manifest");
  const pending=(shots as Row[]).filter(i=>
    ["waiting-credits","awaiting-executor"].includes(i.state) &&
    i.runway_task_id===null);
  if(!pending.length)return fail("no-unsubmitted-shots");
  const chosen=pending[0];
  const id=String(chosen.shot_id);
  if(!/^E02-P0[1-7]$/.test(id)||chosen.runway_model!==MODEL||
   chosen.output_ratio!=="1280:720"||chosen.duration_seconds!==10||
   typeof chosen.prompt_text!=="string"||
   chosen.prompt_text.trim().length<15||chosen.prompt_text.length>1000||
   chosen.reference_bucket!=="viralcine-scene-references"||
   typeof chosen.reference_path!=="string"||
   !chosen.reference_path.startsWith(FILM+"/e02/"+id.toLowerCase()+"/")||
   !chosen.reference_path.endsWith("/"+chosen.reference_sha256+".jpg"))
   return fail("invalid-shot-spec",{shotId:id});
  const source=await fetch(url+"/storage/v1/object/authenticated/"+
    chosen.reference_bucket+"/"+chosen.reference_path,{
    headers:auth,signal:AbortSignal.timeout(20000),cache:"no-store"
   });
  if(!source.ok)return fail("source-download-http-"+source.status,{shotId:id});
  const sourceBytes=await source.arrayBuffer();
  const image=new Uint8Array(sourceBytes);
  if(sourceBytes.byteLength<3000||sourceBytes.byteLength>3_500_000||
    image[0]!==255||image[1]!==216)return fail("invalid-jpeg",{shotId:id});
  if(await hex(sourceBytes)!==chosen.reference_sha256)
    return fail("reference-hash-mismatch",{shotId:id});
  // Reservation function obtains a DB row lock, checks source provenance,
  // confirmed balance, authorized limit and existing unique reservation.
  const reserved=await api("/rest/v1/rpc/v8_reserve_e02_first_runway_render","POST",
   {p_shot_id:id});
  if(reserved.status!=="reserved-no-provider-call")
    return fail(reserved.status||"reservation-blocked",{shotId:id});
  const rid=reserved.reservationId;
  if(typeof rid!=="string")return fail("reservation-id-missing",{shotId:id});
  // Commit submission-uncertain BEFORE calling Runway. Network timeouts
  // cannot cause duplicate charge: no automatic retry for this shot.
  await api("/rest/v1/rpc/v8_note_e02_runway_transition","POST",{
   p_reservation_id:rid,p_transition:"about-to-submit"
  });
  let taskId:string|null=null;
  try{
   const post=await fetch(RUNWAY+"/v1/image_to_video",{
    method:"POST",
    headers:{"Authorization":"Bearer "+runwayKey,"X-Runway-Version":"2024-11-06",
      "Content-Type":"application/json"},
    body:JSON.stringify({model:MODEL,promptImage:"data:image/jpeg;base64,"+
       base64(image),promptText:chosen.prompt_text,
       ratio:"1280:720",duration:10}),
    signal:AbortSignal.timeout(35000),cache:"no-store"
   });
   if(!post.ok)return fail("runway-submission-uncertain-http-"+post.status,{
      shotId:id,requiresReview:true});
   const reply=await post.json();
   if(typeof reply.id==="string"&&reply.id.length>=8)taskId=reply.id;
  }catch{
   return fail("runway-submission-uncertain-network",{
    shotId:id,requiresReview:true
   });
  }
  if(!taskId)return fail("runway-submission-uncertain-no-task-id",{
    shotId:id,requiresReview:true});
  await api("/rest/v1/rpc/v8_note_e02_runway_transition","POST",{
   p_reservation_id:rid,p_transition:"task-known",p_task_id:taskId
  });
  return toJson({status:"runway-task-submitted",shotId:id,taskId,
   maxReservedUsd:0.5,expectedCredits:50,videoReady:false,
   qaReady:false,paidCallsThisInvocation:1});
 }catch(e){
  // Never retry POST from catch. A reserved unknown stays blocked.
  return toJson({status:"worker-error",message:e instanceof Error?e.message.slice(0,160):"error",
   noAutomaticRetry:true},503);
 }
});
