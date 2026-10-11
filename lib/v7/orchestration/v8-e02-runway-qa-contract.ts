/**
 * ViralCine V8 E02 — contract for real MP4 quality control.
 * This file is PURE: no Runway POST, no image generation, no credit spending.
 *
 * Technical metadata QA cannot independently prove identity, continuity or
 * motion quality. They must remain 'unknown' until independent verified QA
 * evidence tied to the exact MP4 SHA-256 has been persisted.
 */
export type GateResult='pass'|'fail'|'unknown';
export type E02Gate='decode'|'duration'|'identity'|'continuity'|'motion';
export const E02_GATES=['decode','duration','identity','continuity','motion'] as const;
export type QARecord={
  shotId:string;
  videoSha256:string;
  verifiedBy:string|null;
  gates:Partial<Record<E02Gate,GateResult>>;
};
export type DispatchPreflight={
  filmId:string;
  shotId:string;
  referenceReady:boolean;
  promptText:string|null;
  durationSeconds:number|null;
  provider:string;
  model:string;
  authorizedRemainingUsd:number;
  providerBalanceConfirmed:boolean;
  existingTaskId?:string|null;
};
const HEX=/^[a-f0-9]{64}$/;
export function assessE02VideoQA(expectedShotId:string,assetSha256:string,qa:QARecord|null){
  if(!qa||qa.shotId!==expectedShotId||!HEX.test(assetSha256)||
      qa.videoSha256!==assetSha256||!qa.verifiedBy?.trim()){
    return {approved:false,missing:[...E02_GATES],failed:[] as E02Gate[],reason:'missing-independent-hash-bound-evidence'};
  }
  const missing=E02_GATES.filter(g=>qa.gates[g]!=='pass'&&qa.gates[g]!=='fail');
  const failed=E02_GATES.filter(g=>qa.gates[g]==='fail');
  return {approved:missing.length===0&&failed.length===0,missing,failed,
    reason:failed.length?'qa-failed':missing.length?'qa-incomplete':'qa-passed'};
}
/** Evaluate only. Real paid dispatch MUST obtain atomic DB spend reservation. */
export function assessE02RunwayPreflight(p:DispatchPreflight) {
  const reasons:string[]=[];
  if(p.filmId!=='film-dos-toques-de-bocina-v7'||!/^E02-P0[1-7]$/.test(p.shotId))
    reasons.push('invalid-film-or-shot');
  if(p.provider!=='runway'||p.model!=='gen4_turbo')reasons.push('unsupported-provider-or-model');
  if(!p.referenceReady)reasons.push('reference-not-ready');
  if(!p.promptText||p.promptText.trim().length<15||p.promptText.trim().length>1000)
    reasons.push('shot-instructions-not-synced');
  if(p.durationSeconds!==5&&p.durationSeconds!==10)
    reasons.push('invalid-duration');
  if(p.existingTaskId)reasons.push('existing-provider-task-must-be-reconciled');
  if(!p.providerBalanceConfirmed)reasons.push('runway-balance-not-confirmed');
  const estimateUsd=(p.durationSeconds===5||p.durationSeconds===10)
    ?p.durationSeconds*0.05:null; // gen4_turbo: 5 credits/sec at $0.01/credit (2026-10-11)
  if(!Number.isFinite(p.authorizedRemainingUsd)||p.authorizedRemainingUsd<0||
     estimateUsd===null||p.authorizedRemainingUsd+1e-9<estimateUsd)
    reasons.push('insufficient-authorized-budget');
  return {eligibleForIndependentAtomicReservation:reasons.length===0,
    paidCallExecuted:false,estimatedUsd:estimateUsd,reasons};
}
