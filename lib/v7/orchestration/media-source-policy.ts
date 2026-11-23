/**
 * ViralCine autonomous production — source isolation (phase before Avatares).
 *
 * This module is pure and does not call external APIs, import Avatares, or
 * read credentials. Adding AVATARES_* environment variables MUST NOT enable it.
 * Enabling Avatares requires a future explicit director approval, a code
 * change, and independent quality/cost tests.
 */
export const AVATARES_INTEGRATION_STATUS = 'disabled-until-explicit-approval' as const;
export type MediaSource =
 | 'existing-film-assets'
 | 'director-upload'
 | 'approved-third-party-provider'
 | 'avatares';

export type SourceDecision =
 | {allowed:true;source:Exclude<MediaSource,'avatares'>;requiresExternalSpendConsent:boolean}
 | {allowed:false;source:MediaSource;reason:string};

export function authorizeMediaSource(source:MediaSource):SourceDecision {
 if(source==='avatares')
  return {allowed:false,source,reason:
   'Avatares está excluido de esta fase. No se consultan sus imágenes, voces, APIs ni agentes.'};
 if(source==='existing-film-assets'||source==='director-upload')
  return {allowed:true,source,requiresExternalSpendConsent:false};
 if(source==='approved-third-party-provider')
  return {allowed:true,source,requiresExternalSpendConsent:true};
 // Exhaustive fallback (protects against untyped external inputs).
 return {allowed:false,source,reason:'Origen de archivo no permitido.'};
}
