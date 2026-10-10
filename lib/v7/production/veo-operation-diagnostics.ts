import type { GenerateVideosOperation } from '@google/genai';

export type VeoDiagnosis = {
  classification:'processing'|'video-ready'|'provider-error'|'rai-filtered'|'no-video-unexplained';
  done:boolean;videoAvailable:boolean;
  providerStatus:string|null;providerCode:string|null;providerMessage:string|null;
  filteredCount:number;filteredReasons:string[];
  checkedAt:string;
};
function safeText(value:unknown,max=400):string|null{
  if(typeof value!=='string'&&typeof value!=='number')return null;
  return String(value)
    .replace(/AIza[A-Za-z0-9_-]+/g,'[REDACTED_KEY]')
    .replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]')
    .replace(/(?:https?:\/\/)[^\s]+/gi,'[REDACTED_URL]')
    .slice(0,max);
}
/**
 * Interpret Google's existing Veo operation. Never returns a raw operation
 * name, prompt, URL, response asset or SDK metadata to the client.
 * This diagnostic NEVER generates videos and NEVER decides billing.
 */
export function diagnoseVeoOperation(op:Pick<GenerateVideosOperation,'done'|'error'|'response'>,
  checkedAt=new Date().toISOString()):VeoDiagnosis {
  const error=op.error;
  const response=op.response;
  const filteredReasons=Array.isArray(response?.raiMediaFilteredReasons)
    ?response.raiMediaFilteredReasons.slice(0,6).map(x=>safeText(x,150)).filter((x):x is string=>!!x):[];
  const filteredCount=typeof response?.raiMediaFilteredCount==='number'&&
    Number.isFinite(response.raiMediaFilteredCount)
    ?Math.max(0,Math.floor(response.raiMediaFilteredCount)):0;
  const done=op.done===true;
  const videoAvailable=Boolean(response?.generatedVideos?.some(item=>item?.video));
  const classification:VeoDiagnosis['classification']=!done?'processing':
    videoAvailable?'video-ready':
    error?'provider-error':
    filteredReasons.length||filteredCount>0?'rai-filtered':'no-video-unexplained';
  return {
    classification,done,videoAvailable,
    providerStatus:safeText(error?.status,100),
    providerCode:safeText(error?.code,40),
    providerMessage:safeText(error?.message,400),
    filteredCount,filteredReasons,checkedAt
  };
}
export function diagnosisSummary(d:VeoDiagnosis):string{
  if(d.classification==='provider-error')
    return 'Google devolvió un error: '+(d.providerMessage||d.providerStatus||'sin detalles.');
  if(d.classification==='rai-filtered')
    return 'Google filtró el resultado'+(d.filteredReasons.length?': '+d.filteredReasons.join('; '):'.');
  if(d.classification==='no-video-unexplained')
    return 'Google informó que terminó, pero no incluyó video ni causa específica.';
  if(d.classification==='video-ready')return 'Google informa que existe video; recuperar la MISMA operación.';
  return 'Google sigue procesando la misma operación.';
}
