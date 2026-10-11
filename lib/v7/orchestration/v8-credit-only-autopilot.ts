/**
 * ViralCine V8: DIRECTOR mode, credit approval only.
 * Pure, side-effect-free coordinator; the worker must persist every transition.
 * No Avatares, no alternate video providers and no paid API calls in this module.
 *
 * Important: quality attestations must be created by trusted agent workers from
 * the exact MP4 bytes, never accepted from a browser-supplied JSON payload.
 */
export type TechnicalGate = 'decode'|'duration'|'identity'|'continuity'|'motion';
export type FinalGate = 'montage'|'timing'|'dialogue'|'music'|'mix';
export type Attestation<T extends string> = {
 assetSha256:string;
 checks:Partial<Record<T,'pass'|'fail'|'unknown'>>;
 verifiedBy:string; // server-side worker ID, not user input
};
export type AutoShot = {
 id:string;referenceReady:boolean;videoReady:boolean;videoSha256?:string;
 providerTaskId?:string;status:string;autoApproved?:boolean;
 freeRepairsUsed?:number;paidRendersUsed?:number;
 qa?:Attestation<TechnicalGate>;
};
export type AutoScene = {
 shots:readonly AutoShot[];
 montageReady:boolean;montageSha256?:string;approved:boolean;
 qa?:Attestation<FinalGate>;
};
export type AutopilotPolicy = {
 provider:'runway';avatares:false;directorInteraction:'credits-only';
 maxFreeRepairs:number;maxPaidRendersPerShot:number;
 pricePerRenderUsd:number;authorizedRemainingUsd:number;
 creditBalanceConfirmed:boolean;
 };
export type AutopilotAction =
 | {kind:'hold-internal';reason:string;shotId?:string}
 | {kind:'request-credits';reason:string;minimumUsd:number;shotId?:string}
 | {kind:'reconcile-task';shotId:string;providerTaskId:string}
 | {kind:'start-render';shotId:string;maximumUsd:number;requiresAtomicLedger:true}
 | {kind:'run-shot-qa';shotId:string;required:readonly TechnicalGate[]}
 | {kind:'repair-locally';shotId:string;attempt:number}
 | {kind:'approve-shot-automatically';shotId:string;assetSha256:string}
 | {kind:'assemble-scene-automatically'}
 | {kind:'run-scene-qa';required:readonly FinalGate[]}
 | {kind:'approve-scene-automatically';assetSha256:string}
 | {kind:'advance-to-next-scene'};

export const requiredShotGates = [
 'decode','duration','identity','continuity','motion'
] as const satisfies readonly TechnicalGate[];
export const requiredFinalGates = [
 'montage','timing','dialogue','music','mix'
] as const satisfies readonly FinalGate[];

function qaStatus<T extends string>(
 evidence:Attestation<T>|undefined,
 hash:string|undefined,
 gates:readonly T[]
):'pass'|'fail'|'missing' {
 if(!hash||!evidence||evidence.assetSha256!==hash||!evidence.verifiedBy.trim())
  return 'missing';
 if(gates.some(g=>evidence.checks[g]==='fail'))return 'fail';
 if(gates.some(g=>evidence.checks[g]!=='pass'))return 'missing';
 return 'pass';
}
function availableBudget(p:AutopilotPolicy):boolean{
 return Number.isFinite(p.authorizedRemainingUsd)&&
  Number.isFinite(p.pricePerRenderUsd)&&p.pricePerRenderUsd>0&&
  p.authorizedRemainingUsd+1e-9>=p.pricePerRenderUsd;
}
function creditDecision(p:AutopilotPolicy,shotId:string):AutopilotAction|null{
 if(!p.creditBalanceConfirmed)
  return {kind:'request-credits',shotId,
   reason:'Runway no tiene saldo confirmado. Aprobar o recargar créditos antes de enviar un render.',
   minimumUsd:p.pricePerRenderUsd};
 if(!availableBudget(p))
  return {kind:'request-credits',shotId,
   reason:'El presupuesto autorizado para Runway está agotado. Autoriza créditos adicionales para continuar.',
   minimumUsd:Math.max(0.01,Math.round((p.pricePerRenderUsd-Math.max(0,p.authorizedRemainingUsd))*100)/100)};
 return null;
}
export function decideCreditOnlyAction(
 scene:AutoScene,p:AutopilotPolicy
):AutopilotAction {
 if(p.provider!=='runway'||p.avatares!==false||
    p.directorInteraction!=='credits-only')
  return {kind:'hold-internal',reason:'Política inválida: solo Runway, sin Avatares y aprobaciones únicamente de créditos.'};
 if(!Number.isInteger(p.maxFreeRepairs)||p.maxFreeRepairs<0||
    !Number.isInteger(p.maxPaidRendersPerShot)||p.maxPaidRendersPerShot<1)
  return {kind:'hold-internal',reason:'Límites de reparación inválidos.'};
 if(!scene.shots.length)
  return {kind:'hold-internal',reason:'No se registraron tomas para esta escena.'};
 // A known insufficient-balance response is a global provider HOLD.
 // Even authorized budget is not the same as actual provider credits.
 const providerBlocked=scene.shots.find(s=>s.status==='blocked-credits');
 if(providerBlocked)
  return {kind:'request-credits',shotId:providerBlocked.id,
   reason:'Runway rechazó el envío por falta de créditos; no repetir antes de comprobar saldo.',
   minimumUsd:p.pricePerRenderUsd};
 const credentialBlock=scene.shots.find(s=>s.status==='blocked-credentials');
 if(credentialBlock)return {kind:'hold-internal',shotId:credentialBlock.id,
  reason:'Credenciales de Runway inválidas; el agente de infraestructura debe recuperarlas sin generar cargos.'};
 const ambiguous=scene.shots.find(s=>s.status==='failed-unknown');
 if(ambiguous)return {kind:'hold-internal',shotId:ambiguous.id,
  reason:'Operación ambigua: reconciliar el ID/cargo antes de reintentar. Prohibido emitir un segundo render.'};

 for(const shot of scene.shots){
  if(!shot.referenceReady&&!shot.videoReady)
   return {kind:'hold-internal',shotId:shot.id,
    reason:'La imagen de referencia debe sincronizarse desde los activos existentes, sin pedirla otra vez.'};
  if(shot.providerTaskId&&!shot.videoReady)
   return {kind:'reconcile-task',shotId:shot.id,providerTaskId:shot.providerTaskId};
  if(!shot.videoReady){
   if((shot.paidRendersUsed??0)>=p.maxPaidRendersPerShot)
    return {kind:'hold-internal',shotId:shot.id,
     reason:'Se agotó el límite de renders por toma; no permitir nuevos cargos sin un plan de reparación.'};
   return creditDecision(p,shot.id)??{kind:'start-render',shotId:shot.id,
    maximumUsd:p.pricePerRenderUsd,requiresAtomicLedger:true};
  }
  // Approval never overrides a missing or mismatched evidence hash.
  const qa=qaStatus(shot.qa,shot.videoSha256,requiredShotGates);
  if(shot.autoApproved&&qa==='pass')continue;
  if(qa==='missing')
   return {kind:'run-shot-qa',shotId:shot.id,required:requiredShotGates};
  if(qa==='fail'){
   if((shot.freeRepairsUsed??0)<p.maxFreeRepairs)
    return {kind:'repair-locally',shotId:shot.id,attempt:(shot.freeRepairsUsed??0)+1};
   if((shot.paidRendersUsed??0)<p.maxPaidRendersPerShot)
    return creditDecision(p,shot.id)??{kind:'start-render',shotId:shot.id,
     maximumUsd:p.pricePerRenderUsd,requiresAtomicLedger:true};
   return {kind:'hold-internal',shotId:shot.id,
    reason:'El video no pasó QA y las reparaciones autorizadas se agotaron. Conservar evidencia, no aprobar.'};
  }
  return {kind:'approve-shot-automatically',shotId:shot.id,
   assetSha256:shot.videoSha256!};
 }
 if(!scene.montageReady)return {kind:'assemble-scene-automatically'};
 const final=qaStatus(scene.qa,scene.montageSha256,requiredFinalGates);
 if(final==='missing')return {kind:'run-scene-qa',required:requiredFinalGates};
 if(final==='fail')return {kind:'hold-internal',
  reason:'La escena falló QA de montaje/audio: iniciar corrección interna y nueva evaluación; nunca aprobar un master defectuoso.'};
 if(!scene.approved)return {kind:'approve-scene-automatically',
  assetSha256:scene.montageSha256!};
 return {kind:'advance-to-next-scene'};
}
