/**
 * V7 provider failure classification; pure, side-effect-free.
 * A confirmed provider rejection with NO task ID is not an in-flight render.
 * Never infer actual provider billing from a local authorization/reservation.
 */
export type ProviderSubmissionDecision =
  | {kind:'blocked-credits';canReuseSubmission:false;needsUserChoice:true;autoRetry:false;exposure:'rejected'}
  | {kind:'blocked-credentials';canReuseSubmission:false;needsUserChoice:true;autoRetry:false;exposure:'rejected'}
  | {kind:'provider-capacity';canReuseSubmission:false;needsUserChoice:false;autoRetry:false;exposure:'unconfirmed'}
  | {kind:'unknown';canReuseSubmission:false;needsUserChoice:true;autoRetry:false;exposure:'unconfirmed'};

export function classifyRunwaySubmitError(httpStatus:number,body:string):ProviderSubmissionDecision{
 const normalized=body.trim().toLowerCase();
 const credit=/\b(not enough credits|insufficient credits|insufficient balance|credit balance too low|out of credits)\b/.test(normalized);
 if([400,402].includes(httpStatus)&&credit)
  return {kind:'blocked-credits',canReuseSubmission:false,needsUserChoice:true,autoRetry:false,exposure:'rejected'};
 if([401,403].includes(httpStatus))
  return {kind:'blocked-credentials',canReuseSubmission:false,needsUserChoice:true,autoRetry:false,exposure:'rejected'};
 if([429,503].includes(httpStatus))
  return {kind:'provider-capacity',canReuseSubmission:false,needsUserChoice:false,autoRetry:false,exposure:'unconfirmed'};
 return {kind:'unknown',canReuseSubmission:false,needsUserChoice:true,autoRetry:false,exposure:'unconfirmed'};
}

export class RunwayKnownRejection extends Error {
 constructor(public readonly kind:'blocked-credits'|'blocked-credentials',message:string){
  super(message);this.name='RunwayKnownRejection';
 }
}

export function isLegacyCreditRejection(record:{
 status:string;taskId?:string;error?:string
}):boolean{
 return record.status==='failed-unknown'&&!record.taskId&&
  /(?:Runway API\s*(?:400|402):\s*)?(?:you do not have enough credits|not enough credits|insufficient credits|out of credits|insufficient balance)/i
  .test(record.error??'');
}
