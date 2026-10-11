// ViralCine V8 E02: hosted CLOUD REHEARSAL ONLY.
// Contains NO Runway API hostname, NO provider POST, NO credit reservation calls.
// Authentication: 96-char per-project cron bearer-like token validated by
// service-role-only Supabase RPC. Public requests cannot read film data.
const FILM = "film-dos-toques-de-bocina-v7";
const PROJECT = "wrxeerltoapvybhaxlmu";
const SHOTS = Array.from({length:7},(_,i)=>"E02-P0"+(i+1));
type JsonRecord=Record<string,unknown>;
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{
 status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
});
const safeMsg=(err:unknown)=>err instanceof Error?err.message.slice(0,180):"unexpected";
Deno.serve(async (req:Request):Promise<Response>=>{
 if(req.method!=="POST")return json({error:"method-not-allowed"},405);
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const url=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
 if(!key||!url.includes(PROJECT))return json({error:"backend-not-configured"},503);
 const headers={"Content-Type":"application/json","apikey":key,
  "Authorization":"Bearer "+key};
 const api=async (route:string,method:"GET"|"POST"="GET",body?:unknown)=>{
  const res=await fetch(url+route,{
   method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),
   signal:AbortSignal.timeout(12000),cache:"no-store"
  });
  if(!res.ok)throw new Error("supabase-api-"+res.status+":"+route.split("?")[0]);
  const raw=await res.text();
  return raw.trim()?JSON.parse(raw):{};
 };
 const token=req.headers.get("x-v8-cron-token")||"";
 if(token.length!==96||!/^[a-f0-9]+$/.test(token))
  return json({error:"unauthorized"},401);
 try{
  const allowed=await api("/rest/v1/rpc/v8_verify_e02_cron_token","POST",{p_token:token});
  if(allowed!==true)return json({error:"unauthorized"},401);
 }catch{return json({error:"verification-unavailable"},503);}
 // NEVER read a price, prompt, film ID or provider from HTTP request body.
 try{
  const filters="film_id=eq."+FILM;
  const [intents,specs,refs,policies]=await Promise.all([
   api("/rest/v1/v8_e02_render_intents?"+filters+
    "&scene_id=eq.E02&select=shot_id,reference_sha256,reference_bucket,reference_path,prompt_text,duration_seconds,runway_model,output_ratio,state,runway_task_id"),
   api("/rest/v1/v8_e02_shot_specs?"+filters+
    "&scene_id=eq.E02&select=shot_id,source_sha256,reference_sha256,prompt_text,runway_duration_seconds"),
   api("/rest/v1/scene_reference_images?"+filters+
    "&scene_id=eq.E02&active=eq.true&select=shot_id,sha256,approved,active,status,storage_bucket,storage_path"),
   api("/rest/v1/v8_film_autonomy_policy?"+filters+
    "&select=director_mode,video_provider,avatares_enabled,authorized_spend_usd,spent_or_reserved_usd,provider_balance_confirmed,status")
  ]);
  const rows=(v:unknown)=>Array.isArray(v)?v as JsonRecord[]:[];
  const i=rows(intents),s=rows(specs),r=rows(refs),p=rows(policies);
  const specsBy=new Map(s.map(x=>[x.shot_id,x]));
  const refsBy=new Map(r.map(x=>[x.shot_id,x]));
  const intentionsBy=new Map(i.map(x=>[x.shot_id,x]));
  let verified=0;
  for(const shot of SHOTS){
   const it=intentionsBy.get(shot),sp=specsBy.get(shot),ref=refsBy.get(shot);
   if(!it||!sp||!ref)continue;
   if(it.reference_sha256!==sp.reference_sha256||
      it.reference_sha256!==ref.sha256||
      it.reference_bucket!==ref.storage_bucket||
      it.reference_path!==ref.storage_path||
      it.prompt_text!==sp.prompt_text||
      it.duration_seconds!==sp.runway_duration_seconds||
      it.runway_model!=="gen4_turbo"||
      it.output_ratio!=="1280:720"||
      it.duration_seconds!==10||
      typeof it.prompt_text!=="string"||
      it.prompt_text.length<15||it.prompt_text.length>1000||
      !/^[a-f0-9]{64}$/.test(String(sp.source_sha256))||
      !ref.approved||!ref.active||ref.status!=="ready"||
      !["waiting-credits","awaiting-executor"].includes(String(it.state))||
      it.runway_task_id!==null)continue;
   verified++;
  }
  const validCounts = i.length===7&&s.length===7&&r.length===7&&p.length===1;
  const policy=p[0];
  const validPolicy=!!policy&&policy.director_mode==="credits-only"&&
    policy.video_provider==="runway"&&policy.avatares_enabled===false;
  const balanceOk=policy?.provider_balance_confirmed===true&&
     policy?.status==="ready";
  const remaining=Number(policy?.authorized_spend_usd)-Number(policy?.spent_or_reserved_usd);
  const enough=Number.isFinite(remaining)&&remaining>=3.5;
  const status=!validCounts||verified!==7?"blocked-integrity":
    !validPolicy?"blocked-policy":
    !balanceOk||!enough?"blocked-credits":"awaiting-executor";
  const diagnostics={
   rehearsalOnly:true,ranAt:new Date().toISOString(),status,
   totalShots:7,verifiedShots:verified,blockedShots:7-verified,
   outputFormat:"1280:720",model:"gen4_turbo",plannedDurationSeconds:10,
   estimatedUsdTotal:3.50,paidCalls:0,runwayRequestSent:false,
   providerGenerationEnabled:false,
   possibleNextPhase:"independent-purchase-gated-runway-dispatcher"
  };
  await api("/rest/v1/v8_e02_worker_ticks","POST",{
   film_id:FILM,worker:"v8-e02-runway-dryrun",status,
   total_shots:7,verified_shots:verified,blocked_shots:7-verified,
   paid_calls:0,notes:{
    rehearsalOnly:true,referenceIntegrity:verified===7,
    requestedRunwayCalls:0,
    authorizationStillRequired:true
   }
  });
  return json(diagnostics);
 }catch(e){
  // Never perform a provider call from error recovery.
  return json({status:"error",error:safeMsg(e),
   rehearsalOnly:true,paidCalls:0,runwayRequestSent:false},503);
 }
});
