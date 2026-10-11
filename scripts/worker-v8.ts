/**
 * Real headless V8 worker. It does not need the Next.js dev server or Chrome.
 * HOSTING NEEDED: this script must run inside an explicitly provisioned,
 * managed, continuously scheduled container. Its code has NO provider POSTs.
 *
 * Startup: V8_AUTONOMY_ENABLED=true, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Run once for a health check: V8_WORKER_ONCE=true npm run worker:v8
 */
import {executeFreeAutonomyJob,type FreeAutonomyJob,type ReferencedObject,
 type AutonomyDependencies} from '../lib/v7/orchestration/v8-free-autonomy-runner';

const enabled=process.env.V8_AUTONOMY_ENABLED==='true';
const serviceUrl=(process.env.SUPABASE_URL||process.env.V8_SUPABASE_URL||'').replace(/\/$/,'');
const adminKey=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const waitMs=Number(process.env.V8_WORKER_POLL_MS||15000);

function runtimeReady() {
 if(!enabled)throw Error('V8_AUTONOMY_ENABLED no está en true. No se realizan solicitudes.');
 const target=new URL(serviceUrl);
 if(target.protocol!=='https:'||!target.hostname.endsWith('.supabase.co'))
  throw Error('La URL Supabase debe ser HTTPS y un proyecto .supabase.co.');
 if(adminKey.length<50)throw Error('Supabase service role no configurada en secretos del servidor.');
 if(!Number.isFinite(waitMs)||waitMs<5000||waitMs>3600000)
  throw Error('Intervalo de trabajo fuera de límites.');
}
async function request(
 path:string,method:'GET'|'POST'|'HEAD',payload?:unknown
):Promise<Response>{
 const response=await fetch(serviceUrl+path,{
  method,headers:{
   apikey:adminKey,Authorization:'Bearer '+adminKey,
   ...(method==='POST'?{'Content-Type':'application/json'}:{})
  },...(method==='POST'?{body:JSON.stringify(payload)}:{}),
  signal:AbortSignal.timeout(30000)
 });
 return response;
}
async function rpc<T>(name:string,body:unknown):Promise<T>{
 const result=await request('/rest/v1/rpc/'+name,'POST',body);
 if(!result.ok)throw Error('Supabase RPC '+name+' HTTP '+result.status);
 return await result.json() as T;
}

const deps:AutonomyDependencies={
 async verifyStoredAsset(file:ReferencedObject){
  const bucket=encodeURIComponent(file.bucket);
  const key=file.path.split('/').map(encodeURIComponent).join('/');
  const r=await request('/storage/v1/object/authenticated/'+bucket+'/'+key,'HEAD');
  if(r.ok)return 'present';
  if(r.status===404)return 'missing';
  if(r.status===401||r.status===403)return 'unauthorized';
  throw Error('Storage HEAD HTTP '+r.status);
 },
 async reconcileExistingTask(provider:string,taskId:string){
  if(provider!=='runway')throw Error('Proveedor fuera de los conectores de lectura.');
  if(!/^[0-9a-f-]{16,80}$/i.test(taskId))throw Error('ID de tarea inválido.');
  const key=process.env.RUNWAYML_API_SECRET||process.env.RUNWAY_API_KEY||'';
  if(!key)throw Error('No se configuró la clave Runway de solo consulta en este worker.');
  const r=await fetch('https://api.dev.runwayml.com/v1/tasks/'+encodeURIComponent(taskId),{
   headers:{Authorization:'Bearer '+key,'X-Runway-Version':'2024-11-06'},
   signal:AbortSignal.timeout(30000)
  });
  if(r.status===401||r.status===403)return {status:'credentials-blocked'};
  if(r.status===404)return {status:'unrecognized'};
  if(!r.ok)throw Error('Runway consulta de tarea HTTP '+r.status);
  const payload=await r.json() as {status?:string;output?:unknown};
  const uri=Array.isArray(payload.output)&&typeof payload.output[0]==='string'
   ?payload.output[0]:null;
  return {status:payload.status||'unrecognized',outputUri:uri};
 }
};

async function tick():Promise<boolean> {
 const rows=await rpc<Array<FreeAutonomyJob&{lock_token:string}>>(
  'v8_claim_autonomy_job',{p_lease_seconds:600});
 if(!Array.isArray(rows)||!rows.length)return false;
 const row=rows[0];
 let result:Awaited<ReturnType<typeof executeFreeAutonomyJob>>;
 try{result=await executeFreeAutonomyJob(row,deps);}
 catch(e){
  result={state:'retry-wait',result:{technicalRetryOnly:true},
   error:e instanceof Error?e.message.slice(0,320):'unknown',retrySeconds:120};
 }
 const committed=await rpc<boolean>('v8_finish_autonomy_job',{
  p_id:row.id,p_lock_token:row.lock_token,p_state:result.state,
  p_result:result.result,p_error:result.error??null,
  p_retry_seconds:result.retrySeconds??60
 });
 if(!committed)throw Error('La tarea perdió su lease; se necesita reconciliación.');
 console.log('[V8 worker]',row.job_key,'→',result.state,
  'attempt',row.attempt+'/'+row.max_attempts);
 return true;
}

async function main(){
 runtimeReady();
 console.log('V8 Free-Only Supervisor. Avatares=DISABLED. PAID_POST=DISABLED.');
 const once=process.env.V8_WORKER_ONCE==='true';
 do{
  try{await tick();}
  catch(e){console.error('[V8 worker]',e instanceof Error?e.message:'unexpected failure');}
  if(once)break;
  await new Promise(resolve=>setTimeout(resolve,waitMs));
 }while(true);
}
void main().catch(e=>{
 console.error('[V8 startup]',e instanceof Error?e.message:'unexpected failure');
 process.exitCode=1;
});
