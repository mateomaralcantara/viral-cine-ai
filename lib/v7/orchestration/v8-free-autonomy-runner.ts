import {decideNextSceneStep,type DirectorShot} from './autonomous-director-policy';

export type FreeAutonomyJob = {
  id:string;job_key:string;film_id:string;scene_id:string;shot_id?:string|null;
  action:'source-check'|'provider-reconcile'|'director-plan'|'quality-check';
  payload:Record<string,unknown>;attempt:number;max_attempts:number;
};
export type FreeAutonomyOutcome = {
  state:'completed'|'retry-wait'|'waiting-assets'|'waiting-provider'|
   'waiting-approval'|'blocked-unknown'|'failed';
  result:Record<string,unknown>;
  error?:string;
  retrySeconds?:number;
};
export type ReferencedObject = {bucket:string;path:string};
export type ExistingProviderTask = {status:string;outputUri?:string|null};

export type AutonomyDependencies = {
  verifyStoredAsset:(file:ReferencedObject)=>Promise<'present'|'missing'|'unauthorized'>;
  reconcileExistingTask:(provider:string,taskId:string)=>Promise<ExistingProviderTask>;
};

function safeObjects(value:unknown):ReferencedObject[] {
 if(!Array.isArray(value)||value.length===0||value.length>50)
  throw Error('La tarea requiere entre 1 y 50 referencias de almacenamiento.');
 return value.map((item:unknown)=>{
  if(!item||typeof item!=='object')throw Error('Referencia no válida.');
  const v=item as Record<string,unknown>;
  if(typeof v.bucket!=='string'||typeof v.path!=='string'||
     !/^[a-z0-9][a-z0-9_-]{1,60}$/i.test(v.bucket)||
     v.path.length>500||!v.path||v.path.startsWith('/')||v.path.includes('..'))
    throw Error('Ruta o bucket no válido.');
  return {bucket:v.bucket,path:v.path};
 });
}
function transient(error:unknown,attempt:number):FreeAutonomyOutcome {
 const reason=error instanceof Error?error.message:String(error);
 return {state:'retry-wait',result:{technicalRetryOnly:true},
  error:reason.slice(0,320),
  retrySeconds:Math.min(3600,Math.max(30,30*Math.pow(2,Math.min(attempt,6))))};
}

/**
 * Worker performs FREE checks only. No function here invokes POST /tasks,
 * creates an image, modifies an approved MP4, or starts a paid regeneration.
 */
export async function executeFreeAutonomyJob(
 job:FreeAutonomyJob,deps:AutonomyDependencies
):Promise<FreeAutonomyOutcome> {
 try {
  const payload=job.payload??{};
  if(payload.mediaSource==='avatares')
   return {state:'blocked-unknown',result:{error:'Avatares está excluido de esta fase.'}};
  if(job.action==='source-check'||job.action==='quality-check'){
   const files=safeObjects(payload.files);
   const missing:string[]=[];
   for(const f of files){
    const exists=await deps.verifyStoredAsset(f);
    if(exists==='unauthorized')
     return {state:'waiting-provider',result:{reason:'Cloud storage sin permisos. No se repetirá un gasto.'}};
    if(exists==='missing')missing.push(f.bucket+'/'+f.path);
   }
   if(missing.length)
    return {state:'waiting-assets',result:{missing,verifiedCount:files.length-missing.length}};
   return {state:'completed',result:{
    checkedAssets:files.length,
    validation:'storage-presence-only',
    cinematicQaApproved:false,
    nextStep:job.action==='quality-check'?'manual-or-ffmpeg-qa':'preflight-or-video-generation'
   }};
  }
  if(job.action==='provider-reconcile'){
   const provider=payload.provider;
   const taskId=payload.taskId;
   const knownError=payload.lastError;
   if(typeof knownError==='string'&&/not (?:have )?enough credits|insufficient balance/i.test(knownError))
    return {state:'waiting-provider',result:{reason:'Proveedor sin créditos. Sin envíos automáticos.'}};
   if(provider!=='runway')return {state:'waiting-provider',
    result:{reason:'El director ha seleccionado exclusivamente Runway para esta fase. No se usará otro proveedor.'}};
   if(typeof taskId!=='string'||!taskId.trim())
    return {state:'waiting-provider',result:{reason:'Sin ID verificable de tarea. No se puede reenviar.'}};
   const task=await deps.reconcileExistingTask(provider,taskId);
   const status=task.status.toLowerCase();
   if(['succeeded','success','completed'].includes(status))
    return {state:'completed',result:{provider,providerTaskId:taskId,
     outputUri:task.outputUri??null,
     outputVerified:false,requiresIndependentQa:true}};
   if(['failed','canceled','cancelled'].includes(status))
    return {state:'waiting-provider',result:{provider,providerTaskId:taskId,
     reason:'Tarea terminada sin video aprobado. No se creará otra sin autorización.'}};
   if(['queued','pending','processing','running','throttled'].includes(status))
    return {state:'retry-wait',retrySeconds:120,
     result:{provider,providerTaskId:taskId,reason:'Recuperar la MISMA tarea; no generar otra.'}};
   return {state:'blocked-unknown',result:{provider,providerTaskId:taskId,status}};
  }
  if(job.action==='director-plan'){
   const shots=payload.shots;
   if(!Array.isArray(shots)||shots.length===0)
    return {state:'waiting-assets',result:{reason:'No hay tomas registradas en la nube.'}};
   const plan=decideNextSceneStep({
    shots:shots as DirectorShot[],
    explicitBudgetUsd:0,authorizedBudgetUsd:0, // NEVER infer consent from a queue payload
    sceneAssembled:payload.sceneAssembled===true,
    sceneApproved:payload.sceneApproved===true,
    providerAvailable:payload.providerAvailable===true,
    estimatedUsdPerClip:0.5,mediaSource:'existing-film-assets'
   });
   if(plan.action==='reconcile-existing')
    return {state:'completed',result:{nextAction:plan,paidCallExecuted:false}};
   if(plan.action==='assemble-local')
    return {state:'waiting-assets',result:{nextAction:plan,reason:'Se requiere un worker con FFmpeg y MP4 en almacenamiento.'}};
   if(plan.action==='complete')
    return {state:'completed',result:{nextAction:plan}};
   if(plan.action==='ask-director')
    return {state:plan.question.kind==='reference'?'waiting-assets':
      plan.question.kind==='credits-or-provider'?'waiting-provider':'waiting-approval',
     result:{nextAction:plan}};
   if(plan.action==='blocked-unknown')
    return {state:'blocked-unknown',result:{nextAction:plan}};
   return {state:'waiting-approval',result:{
    reason:'Nuevo render externo requiere autorización verificable; este worker nunca lo ejecuta.',
    nextAction:plan
   }};
  }
  return {state:'failed',result:{reason:'Acción desconocida.'}};
 }catch(e){return transient(e,job.attempt);}
}
