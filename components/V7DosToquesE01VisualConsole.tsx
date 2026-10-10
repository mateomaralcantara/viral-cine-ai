'use client';
import {useCallback,useEffect,useState} from 'react';
import {Clapperboard,CheckCircle2,Film,RefreshCcw,ShieldCheck,Play,ClipboardCheck} from 'lucide-react';

type Packet={
 id:string;title:string;startSeconds:number;editSeconds:number;providerSeconds:number;
 existing:boolean;action:string;camera:string;continuity:string[];
 voiceCharacter:string|null;voiceLine:string|null;promptEnglish:string|null;promptSha256:string|null;
 estimatedUsd:number;recordStatus:string;providerOperationKnown:boolean;
 videoReady:boolean;hasSubmittedOrReserved:boolean;error:string|null;
 diagnosis?:{classification:string;providerStatus:string|null;providerCode:string|null;providerMessage:string|null;filteredCount:number;filteredReasons:string[];checkedAt:string}|null;
};
type Production={ok:boolean;packets:Packet[];providerEnabled:boolean;priceConfigurationVerified:boolean;
 adminTokenConfigured:boolean;credentialConfigured:boolean;perShotCapUsd:number;totalCapUsd:number;
 committedUsd:number;priceDisclaimer:string;automaticProviderRetries:number;haltedForReconciliation:boolean};
type ApprovalBoard={ok:boolean;scenes:Array<{label:string;shots:Array<{label:string;approved:boolean;hasVideo:boolean}>}>};
const routeFor=(filmId:string)=>'/api/v7/films/'+encodeURIComponent(filmId);
export default function V7DosToquesE01VisualConsole({filmId}:{filmId:string}){
 const [production,setProduction]=useState<Production|null>(null);
 const [approvals,setApprovals]=useState<ApprovalBoard|null>(null);
 const [token,setToken]=useState('');
 const [accepted,setAccepted]=useState<Record<string,boolean>>({});
 const [busy,setBusy]=useState('');
 const [messages,setMessages]=useState<Record<string,string>>({});
 const [error,setError]=useState('');
 const url=routeFor(filmId)+'/scene01-production';
 const statusUrl=routeFor(filmId)+'/scene-production';
 const refresh=useCallback(async()=>{
  const [p,a]=await Promise.all([
   fetch(url,{cache:'no-store'}),fetch(statusUrl,{cache:'no-store'})
  ]);
  const pdata=await p.json() as Production&{error?:string};
  const adata=await a.json() as ApprovalBoard&{error?:string};
  if(!p.ok||!pdata.ok)throw Error(pdata.error||'No se pudo cargar producción E01.');
  if(!a.ok||!adata.ok)throw Error(adata.error||'No se pudieron verificar aprobaciones.');
  setProduction(pdata);setApprovals(adata);setError('');
 },[url,statusUrl]);
 useEffect(()=>{
  void refresh().catch(e=>setError(e instanceof Error?e.message:String(e)));
  const timer=setInterval(()=>{void refresh().catch(()=>undefined);},12000);
  return()=>clearInterval(timer);
 },[refresh]);
 const notice=(id:string,value:string)=>setMessages(old=>({...old,[id]:value}));
 async function act(id:string,action:'preflight'|'submit'|'resume'|'inspect',pkt?:Packet){
  if(action!=='preflight'&&!token){notice(id,'Introduce tu token administrativo en el campo superior.');return;}
  if(action==='submit'&&(!pkt||!accepted[id]||!production?.providerEnabled)){
   notice(id,'Falta confirmación del importe o está bloqueado el proveedor.');return;
  }
  setBusy(id);notice(id,'');
  try{
   const reply=await fetch(url,{method:'POST',
    headers:action==='preflight'?{'Content-Type':'application/json'}:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action,shotId:id,...(action==='submit'?{
      confirm:true,pricingConfirmed:true,promptSha256:pkt!.promptSha256,
      approvedUsd:pkt!.estimatedUsd}:{})})});
   const body=await reply.json() as {ok?:boolean;error?:string;status?:string;summary?:string};
   if(!reply.ok||!body.ok)throw Error(body.error||'Operación no completada.');
   setAccepted(x=>({...x,[id]:false}));
   notice(id,action==='preflight'?'Preflight: preparado sin costo.':action==='submit'?
     'Enviado UNA sola vez. Espera y usa Recuperar operación.':action==='inspect'?
     'Diagnóstico de Google: '+(body.summary||'Consulta realizada sin generar video.'):'Recuperación: '+body.status);
   await refresh();
  }catch(e){notice(id,e instanceof Error?e.message:String(e));}
  finally{setBusy('');}
 }
 const firstScene=approvals?.scenes.find(s=>s.label==='E01');
 return <section className="panel mt-6 rounded-3xl p-5 md:p-8">
  <header className="flex flex-wrap items-start justify-between gap-4">
   <div>
    <p className="text-xs font-black tracking-[.18em] text-violet-300">DOS TOQUES DE BOCINA · DIRECTOR DE PRODUCCIÓN</p>
    <h2 className="mt-2 flex items-center gap-2 text-2xl font-black">
     <Clapperboard className="h-6 w-6 text-violet-300"/> Escena 01 · La señal
    </h2>
    <p className="mt-2 text-sm text-slate-300">7 tomas · 50 segundos de montaje · todos los bloques en un solo panel.</p>
   </div>
   <button className="button-secondary" type="button" onClick={()=>void refresh().catch(e=>setError(String(e)))}>
    <RefreshCcw className="mr-1 inline h-4 w-4"/> Actualizar
   </button>
  </header>
  <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
   <div className="rounded-xl border border-white/10 p-3"><p className="text-xs text-slate-400">Tomas planificadas</p>
    <strong className="text-xl">{production?.packets.length??'—'}</strong></div>
   <div className="rounded-xl border border-white/10 p-3"><p className="text-xs text-slate-400">Aprobadas</p>
    <strong className="text-xl">{firstScene?.shots.filter(s=>s.approved).length??'—'}/7</strong></div>
   <div className="rounded-xl border border-white/10 p-3"><p className="text-xs text-slate-400">Montaje objetivo</p>
    <strong className="text-xl">00:50</strong></div>
   <div className="rounded-xl border border-white/10 p-3"><p className="text-xs text-slate-400">Nuevos compromisos estimados</p>
    <strong className="text-xl">{production?'US$'+production.committedUsd.toFixed(2):'—'}</strong></div>
  </div>
  <div className="mt-4 rounded-xl border border-violet-400/20 p-4">
   <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-violet-300"/>
    <strong className="text-sm">Control de ejecución</strong></div>
   <p className="mt-2 text-xs leading-5 text-slate-300">
    P01 y P02 se reutilizan. P03–P07 tienen preflight y recuperación propia.
    No hay reintentos pagados automáticos ni gastos al consultar o preparar.
    Las voces se añadirán en producción sonora posterior.
   </p>
   <p className="mt-2 text-xs text-amber-200">{production?.haltedForReconciliation?
    'ALTO: P03/P05 u otra toma sin video. Nuevas generaciones bloqueadas hasta conciliar operaciones y facturación.':
    production?.providerEnabled?
    'Proveedor habilitado: cada envío requiere confirmación económica separada.':
    'Generación pagada bloqueada por configuración. Puedes preparar y revisar las tomas sin costo.'}</p>
   <p className="mt-1 text-xs text-amber-200">{production?.priceDisclaimer}</p>
   <input type="password" autoComplete="off" aria-label="Token administrativo de Escena 01"
    className="mt-3 w-full rounded-lg border border-white/20 bg-slate-950 p-3 text-sm"
    value={token} onChange={e=>setToken(e.target.value)}
    placeholder="Token administrativo · solo permanece en esta sesión"/>
  </div>
  {error&&<p className="mt-3 text-sm text-red-300" role="alert">{error}</p>}
  <div className="mt-5 grid gap-4 lg:grid-cols-2">
   {production?.packets.map(p=>{
    const snapshot=firstScene?.shots.find(s=>s.label===p.id);
    const approved=Boolean(snapshot?.approved);
    const videoReady=Boolean(snapshot?.hasVideo);
    const blocked=p.hasSubmittedOrReserved&&p.recordStatus!=='review-required';
    return <article key={p.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
     <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-black text-violet-200">{p.id} · {p.title}</p>
      <span className={'text-xs font-bold '+(approved?'text-emerald-300':'text-amber-200')}>
       {approved?'APROBADA':videoReady?'VIDEO EN REVISIÓN':p.existing?'COMPROBAR ORIGINAL':
        blocked?'OPERACIÓN '+p.recordStatus.toUpperCase():'LISTA PARA PREFLIGHT'}
      </span>
     </div>
     <p className="mt-2 text-sm text-slate-300">{p.action}</p>
     <p className="mt-2 text-xs text-slate-400">{String(p.startSeconds).padStart(2,'0')}s →
      {String(p.startSeconds+p.editSeconds).padStart(2,'0')}s · Corte {p.editSeconds}s ·
      {p.existing?' MP4 original':' Render propuesto 8s'}</p>
     <p className="mt-2 text-xs text-slate-400">Cámara: {p.camera}</p>
     {p.voiceLine&&<p className="mt-2 rounded-lg bg-white/[.04] p-2 text-xs text-slate-200">
      <strong>Voz posterior · {p.voiceCharacter}:</strong> «{p.voiceLine}»</p>}
     <details className="mt-3 text-xs text-slate-300">
      <summary className="cursor-pointer font-semibold">Continuidad y prompt</summary>
      <ul className="mt-2 list-inside list-disc space-y-1">
       {p.continuity.map((x,i)=><li key={i}>{x}</li>)}
      </ul>
      {p.promptEnglish&&<textarea className="mt-3 min-h-32 w-full rounded-lg border border-white/10 bg-slate-950 p-3 text-xs"
       readOnly value={p.promptEnglish} aria-label={'Prompt de '+p.id}/>}
     </details>
     <div className="mt-4 flex flex-wrap gap-2">
      {videoReady&&<a className="button-secondary text-sm" target="_blank" rel="noreferrer"
       href={statusUrl+'/video?shotId='+encodeURIComponent(filmId+'-scene-01-shot-'+p.id.slice(-2))}>
       <Play className="mr-1 inline h-4 w-4"/> Ver MP4
      </a>}
      {p.existing?<span className="rounded-lg border border-emerald-400/20 px-3 py-2 text-xs text-emerald-300">
        <CheckCircle2 className="mr-1 inline h-4 w-4"/> Reutilizar, sin nuevos gastos</span>:
       <>
        <button className="button-secondary text-sm" type="button" disabled={!!busy}
         onClick={()=>void act(p.id,'preflight')}>{busy===p.id?'Preparando…':'Preparar toma · Gratis'}</button>
        {p.hasSubmittedOrReserved?
         <>
          <button className="button-secondary text-sm" type="button"
           disabled={!!busy||!p.providerOperationKnown} onClick={()=>void act(p.id,'inspect')}>
           <ShieldCheck className="mr-1 inline h-4 w-4"/> Diagnosticar en Google · Sin nuevo render
          </button>
          {(p.recordStatus!=='failed-unknown'||p.diagnosis?.classification==='video-ready')&&
           <button className="button-secondary text-sm" type="button"
            disabled={!!busy||!p.providerOperationKnown} onClick={()=>void act(p.id,'resume')}>
            <RefreshCcw className="mr-1 inline h-4 w-4"/> Recuperar mismo render
           </button>}
         </>:
         <>
          <label className="flex items-center gap-2 rounded-lg border border-white/10 p-2 text-xs">
           <input type="checkbox" checked={Boolean(accepted[p.id])}
            onChange={e=>setAccepted(v=>({...v,[p.id]:e.target.checked}))}/>
           Confirmar una generación · US$0.80
          </label>
          <button className="button-primary text-sm" type="button"
           disabled={!accepted[p.id]||!production?.providerEnabled||!!busy}
           onClick={()=>void act(p.id,'submit',p)}>Generar toma · US$0.80</button>
         </>
        }
       </>
      }
     </div>
     {p.diagnosis&&<div className="mt-3 rounded-lg border border-amber-400/20 p-3 text-xs text-amber-100">
      <strong>Diagnóstico de Google: {p.diagnosis.classification}</strong>
      {p.diagnosis.providerStatus&&<p className="mt-1">Estado: {p.diagnosis.providerStatus}</p>}
      {p.diagnosis.providerCode&&<p>Código: {p.diagnosis.providerCode}</p>}
      {p.diagnosis.providerMessage&&<p className="mt-1">Motivo: {p.diagnosis.providerMessage}</p>}
      {p.diagnosis.filteredReasons.map((reason,i)=><p key={i} className="mt-1">Filtro: {reason}</p>)}
      {p.diagnosis.classification==='no-video-unexplained'&&<p className="mt-1">Sin causa específica informada por Google. Se requiere conciliación con el proveedor.</p>}
      <p className="mt-1 text-slate-400">El diagnóstico no confirma facturación ni autoriza otro envío.</p>
     </div>}
     {messages[p.id]&&<p className="mt-3 text-xs text-amber-200" role="status">{messages[p.id]}</p>}
    </article>;
   })}
  </div>
  <div className="mt-5 rounded-xl border border-white/10 p-4">
   <div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-violet-300"/>
    <strong className="text-sm">Aprobación artística y montaje</strong></div>
   <p className="mt-2 text-xs text-slate-300">
    Los botones permanentes de aprobación y montaje están en la pestaña Escenas.
    Cada MP4 recuperado aparecerá allí automáticamente, sin instalar otro módulo por toma.
    El montaje de 50 s solo se habilita cuando las siete tomas estén aprobadas.
   </p>
   <a className="button-secondary mt-3 inline-flex" href={'/v7/films/'+encodeURIComponent(filmId)+'?tab=scenes'}>
    <Film className="mr-1 h-4 w-4"/> Ir a aprobación y montaje
   </a>
  </div>
 </section>;
}
