/** No delegated spend approval for E01-P02. Explicit creator approval required. */
export const DOS_TOQUES_SECOND_SHOT_BUDGET = Object.freeze({filmId:'film-dos-toques-de-bocina-v7',shotId:'E01-P02',model:'veo-3.1-fast-generate-preview',providerSeconds:8,providerRateUsdPerSecond:0.10,maxTotalUsd:0,maxProviderSubmissions:0,automaticRetries:0} as const);
export function secondShotQuotedUsd(rate:number):number { if (!Number.isFinite(rate)||rate<=0) throw new Error('Tarifa invalida'); return Math.round(rate*8*100)/100; }
export function maySubmitSecondShot(_args: unknown):boolean {return false;}
