/**
 * Director IA, fase 0: determinista y de solo lectura.
 * Decision next step for any scene WITHOUT submitting a provider request.
 * Later a durable cloud worker consumes the same decisions; browser lifecycle
 * must never be an execution dependency.
 */
export type DirectorShot = {
 id:string;
 imageReady:boolean;
 videoReady:boolean;
 taskKnown:boolean;
 status:string;
 approved?:boolean;
};
export type DirectorQuestion = {
 kind:'reference'|'credits-or-provider'|'economic-approval'|'artistic-review';
 message:string;
 shotId?:string;
};
export type DirectorNext =
 | {action:'ask-director';question:DirectorQuestion}
 | {action:'reconcile-existing';shotId:string}
 | {action:'submit-authorized';shotId:string;estimatedUsd:number}
 | {action:'assemble-local'}
 | {action:'complete'}
 | {action:'blocked-unknown';shotId:string;message:string};

export function decideNextSceneStep(input:{
 shots:readonly DirectorShot[];
 explicitBudgetUsd:number;
 authorizedBudgetUsd:number;
 sceneAssembled:boolean;
 sceneApproved:boolean;
 providerAvailable:boolean;
 estimatedUsdPerClip:number;
}):DirectorNext {
 const {shots}=input;
 if(shots.length===0)return {action:'blocked-unknown',shotId:'scene',message:'No hay tomas definidas.'};
 // Any known credit failure is a GLOBAL HOLD for this provider. Never allow
 // later shots to submit simply because those shots have images.
 const blocked=shots.find(s=>s.status==='blocked-credits'||s.status==='blocked-credentials');
 if(blocked){
  return {action:'ask-director',question:{kind:'credits-or-provider',shotId:blocked.id,
   message:blocked.status==='blocked-credits'
    ?'El proveedor no tiene créditos. Reponer saldo o escoger otro motor, sin reenviar automáticamente.'
    :'El proveedor rechazó credenciales. Corregir acceso antes de enviar.'}};
 }
 const unknown=shots.find(s=>s.status==='failed-unknown');
 if(unknown)return {action:'blocked-unknown',shotId:unknown.id,
  message:'Existe una operación de cobro incierto. Reconciliar primero; no crear duplicado.'};
 const missing=shots.find(s=>!s.imageReady&&!s.videoReady);
 if(missing)return {action:'ask-director',question:{kind:'reference',shotId:missing.id,
  message:'Necesito la imagen de esta toma para continuar.'}};
 const inFlight=shots.find(s=>s.taskKnown&&!s.videoReady);
 if(inFlight)return {action:'reconcile-existing',shotId:inFlight.id};
 const pending=shots.find(s=>!s.videoReady);
 if(pending){
  if(!input.providerAvailable)return {action:'ask-director',question:{kind:'credits-or-provider',
   shotId:pending.id,message:'No hay proveedor de video disponible. Elige un proveedor o configura el servidor.'}};
  if(input.explicitBudgetUsd<input.estimatedUsdPerClip||
    input.authorizedBudgetUsd<input.estimatedUsdPerClip){
    return {action:'ask-director',question:{kind:'economic-approval',shotId:pending.id,
     message:'Se requiere autorización económica explícita para la siguiente generación.'}};
  }
  return {action:'submit-authorized',shotId:pending.id,
   estimatedUsd:input.estimatedUsdPerClip};
 }
 const review=shots.find(s=>!s.approved);
 if(review)return {action:'ask-director',question:{kind:'artistic-review',shotId:review.id,
  message:'Revisa el MP4 y aprueba la toma, o solicita una corrección.'}};
 if(!input.sceneAssembled)return {action:'assemble-local'};
 if(!input.sceneApproved)return {action:'ask-director',question:{kind:'artistic-review',
  message:'Revisa y aprueba el montaje de la escena.'}};
 return {action:'complete'};
}
