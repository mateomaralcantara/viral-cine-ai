'use client';
import {useCallback,useEffect,useState} from 'react';
import {ensureLocalStudioSession} from '@/lib/v7/security/local-studio-client';

type Revision={revisionId:string;promptText:string;promptHash:string;referenceSha256:string;createdAt:string};
type Shot={id:string;title:string;canonicalPrompt:string;correction:Revision|null;
 referenceReady:boolean;status:string;taskKnown:boolean;videoReady:boolean;
 error:string|null;correctionAttemptUsed:boolean;previewReady:boolean};
type Board={ok:boolean;shots:Shot[];cloudConfigured:boolean;allReferencesReady:boolean;providerEnabled:boolean;
 reservedUsd:number;maxSceneUsd:number;estimatedUsdPerShot:number};
type Result={ok?:boolean;error?:string;previewUrl?:string;revision?:Revision;
 failureCode?:string|null;failure?:string|null;status?:string;
 referenceShotId?:string;videoReady?:boolean;newGenerationRequests?:number};
const initialId='E02-P04';

export default function V7Scene02CorrectionPanel({filmId}:{filmId:string}){
 const endpoint='/api/v7/films/'+encodeURIComponent(filmId)+'/scene02-corrections';
 const [board,setBoard]=useState<Board|null>(null);
 const [selected,setSelected]=useState(initialId);
 const [prompt,setPrompt]=useState('');
 const [busy,setBusy]=useState('');
 const [notice,setNotice]=useState('');
 const [failure,setFailure]=useState('');
 const [preview,setPreview]=useState('');
 const [diagnostic,setDiagnostic]=useState('');
 const [authorization,setAuthorization]=useState('');
 const [agree,setAgree]=useState(false);
 const current=board?.shots.find(s=>s.id===selected);
 const load=useCallback(async()=>{
  const response=await fetch(endpoint,{cache:'no-store',credentials:'same-origin'});
  const data=await response.json() as Board&{error?:string};
  if(!response.ok||!data.ok)throw Error(data.error??'No se pudo leer el estado de correcciones.');
  setBoard(data);return data;
 },[endpoint]);
 useEffect(()=>{
  void load().then(b=>{
   const shot=b.shots.find(s=>s.id===initialId);
   if(shot)setPrompt(shot.correction?.promptText??shot.canonicalPrompt);
  }).catch(e=>setFailure(String(e)));
 },[load]);
 function choose(id:string){
  setSelected(id);setPreview('');setNotice('');setFailure('');setDiagnostic('');
  setAgree(false);setAuthorization('');
  const shot=board?.shots.find(s=>s.id===id);
  setPrompt(shot?.correction?.promptText??shot?.canonicalPrompt??'');
 }
 async function request(action:string,extra:Record<string,unknown>={}):Promise<Result>{
  // Only trusted loopback sessions can write revisions or authorize paid jobs.
  await ensureLocalStudioSession();
  const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',
   headers:{'Content-Type':'application/json'},cache:'no-store',
   body:JSON.stringify({action,shotId:selected,...extra})});
  const raw=await response.text();
  let data:Result;
  try{data=JSON.parse(raw) as Result;}
  catch{throw Error('Respuesta no válida (HTTP '+response.status+').');}
  if(!response.ok||!data.ok)throw Error(data.error??'Operación rechazada (HTTP '+response.status+').');
  return data;
 }
 async function act(name:string,work:()=>Promise<void>){
  if(busy)return;
  setBusy(name);setFailure('');setNotice('');
  try{await work();}
  catch(e){
   setFailure(e instanceof Error?e.message:String(e));
   // A provider might have accepted a task before a network error was returned:
   // always reload the durable attempt receipt; never resubmit automatically.
   void load().catch(()=>undefined);
  }
  finally{setBusy('');}
 }
 async function prepare(){
  await act('Preparando versión',async()=>{
   const result=await request('prepare',{promptText:prompt});
   await load();
   setPreview('');setAgree(false);setAuthorization('');
   setNotice('Versión '+result.revision?.revisionId+' guardada. Sin llamadas a proveedores.');
  });
 }
 async function simulate(){
  if(!current?.correction)return;
  await act('Creando simulación local',async()=>{
   const r=await request('preview',{revisionId:current.correction?.revisionId});
   if(r.previewUrl)setPreview(r.previewUrl+'&t='+Date.now());
   setNotice('Simulación local de 6 segundos: cámara sobre fotografía, NO prueba de movimiento generado por IA. Costo de proveedor: US$0.');
   await load();
  });
 }
 async function diagnose(){
  await act('Consultando tarea original',async()=>{
   if(!board?.providerEnabled){
    // Offline-safe audit of already persisted records; never invoke the provider.
    setDiagnostic('Diagnóstico LOCAL (registro guardado): '+(current?.status??'no disponible')+
     ' · Tarea identificada: '+(current?.taskKnown?'sí':'no')+
     (current?.error?' · '+current.error:'')+
     '. El estado actual de Runway no se puede verificar sin conectar el proveedor.');
    setNotice('Historial local consultado. No se utilizó ninguna API pagada ni se reenvió tarea.');
    return;
   }
   const r=await request('diagnose');
   setDiagnostic('Estado verificado en Runway: '+(r.status??'desconocido')+
    ' · Código: '+(r.failureCode??'no disponible')+
    (r.failure?' · '+r.failure:''));
   setNotice('Consulta de tarea existente, sin nueva generación.');
  });
 }
 async function resume(){
  await act('Recuperando tarea existente',async()=>{
   const r=await request('resume');
   setNotice('Tarea consultada: '+r.status+
    '. Video disponible: '+Boolean(r.videoReady)+'. No hubo un nuevo envío.');
   await load();
  });
 }
 async function submit(){
  if(!current?.correction||!agree||authorization!=='AUTORIZO '+selected)return;
  await act('Enviando un único render',async()=>{
   const r=await request('submit',{revisionId:current.correction?.revisionId,
    promptHash:current.correction?.promptHash,approvedUsd:0.5,
    confirmHuman:true,explicitSpendConsent:true});
   setAgree(false);setAuthorization('');
   setNotice('Runway recibió la solicitud de '+selected+' ('+r.status+
    '). Usa «Recuperar misma tarea»; no la vuelvas a enviar.');
   await load();
  });
 }
 const readyToSubmit=Boolean(current?.correction&&!current.correctionAttemptUsed&&
  !current.videoReady&&current.referenceReady&&board?.allReferencesReady&&
  board?.providerEnabled&&
  (current.status==='not-started'||(current.status==='failed-unknown'&&current.taskKnown))&&
  agree&&authorization==='AUTORIZO '+selected&&!busy);
 return <section className="mt-6 rounded-3xl border border-emerald-500/30 bg-emerald-500/[.04] p-5 md:p-7">
  <h2 className="text-xl font-black">ViralCine · Centro de correcciones</h2>
  <p className="mt-2 text-sm text-slate-300">
   Corrige solo la toma afectada. Las versiones, los intentos y los videos existentes se conservan.
   Las simulaciones locales son gratuitas; los renders de Runway requieren autorización individual.
  </p>
  <div className="mt-4 flex flex-wrap gap-2">
   {board?.shots.map(s=><button key={s.id} type="button" onClick={()=>choose(s.id)}
    className={'rounded-lg border px-3 py-2 text-xs font-bold '+
     (s.id===selected?'border-emerald-300 bg-emerald-800 text-white':'border-white/20 text-slate-300')}>
    {s.id} · {s.videoReady?'MP4 listo':s.status}
   </button>)}
  </div>
  {current&&<div className="mt-5 space-y-3 rounded-xl border border-white/10 p-4">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <h3 className="font-bold">{selected} · {current.title}</h3>
    <span className="text-xs text-amber-200">{current.status.toUpperCase()}</span>
   </div>
   <p className="text-xs text-slate-300">Fotografía aprobada: {current.referenceReady?'Sí':'No'} ·
    Versión: {current.correction?.revisionId??'Sin corrección guardada'}</p>
   {current.error&&<p className="text-xs text-amber-200">Registro anterior: {current.error}</p>}
   <label className="block text-sm font-semibold" htmlFor="e02-correction-prompt">Prompt visual de esta toma</label>
   <textarea id="e02-correction-prompt" value={prompt} rows={6} onChange={e=>setPrompt(e.target.value)}
    className="w-full rounded-lg border border-white/20 bg-slate-950/70 p-3 text-sm text-white"
    placeholder="Describe el movimiento, la identidad y el encuadre."/>
   <div className="flex flex-wrap gap-2">
    <button type="button" disabled={!!busy||!current.referenceReady||!board?.cloudConfigured||prompt.trim().length<60}
     title={!board?.cloudConfigured?'Conecta Supabase y una sesión local administrativa para preparar una versión verificable.':'Guardar una nueva versión inmutable'}
     className="button-secondary text-xs" onClick={()=>void prepare()}>
     Guardar versión · gratis
    </button>
    <button type="button" disabled={!!busy||!current.correction}
     className="button-secondary text-xs" onClick={()=>void simulate()}>
     Simular cámara · gratis
    </button>
    <button type="button" disabled={!!busy||!current.taskKnown}
     className="button-secondary text-xs" onClick={()=>void diagnose()}>
     {board?.providerEnabled?'Diagnosticar Runway · gratis':'Ver diagnóstico local · gratis'}
    </button>
    <button type="button" disabled={!!busy||!current.taskKnown||!board?.providerEnabled}
     title={!board?.providerEnabled?'Proveedor desactivado: no se puede recuperar desde Runway en este servidor.':'Consultar la tarea existente sin reenviarla'}
     className="button-secondary text-xs" onClick={()=>void resume()}>
     Recuperar misma tarea
    </button>
   </div>
   {(preview||(current.previewReady&&current.correction))&&
    <div className="space-y-2">
     <p className="text-sm font-semibold">Simulación local (fotografía con acercamiento, no render de IA)</p>
     <video controls playsInline className="w-full max-w-xl rounded-lg"
      src={preview||endpoint+'?preview=1&shotId='+encodeURIComponent(selected)+
       '&revisionId='+encodeURIComponent(current.correction?.revisionId??'')}/>
    </div>}
   {diagnostic&&<p role="status" className="text-sm text-amber-100">{diagnostic}</p>}
   <div className="mt-4 rounded-lg border border-amber-400/30 p-3">
    <p className="text-sm font-bold">Nueva generación de Runway · US$0.50 por toma</p>
    <p className="mt-1 text-xs text-slate-300">
     Presupuesto bruto registrado: US$ {board?.reservedUsd.toFixed(2)??'--'} /
     US$ {board?.maxSceneUsd.toFixed(2)??'--'}.
    </p>
    {!current.correction&&<p role="status" className="mt-2 text-xs text-amber-200">
     Primero pulsa «Guardar versión · gratis» para autorizar exactamente el prompt que usarás.
    </p>}
    {!board?.cloudConfigured&&<p role="status" className="mt-2 text-xs text-amber-200">
     Supabase no está conectado en este servidor de pruebas. Las fotografías del proyecto principal
     no se pueden verificar desde aquí; no las vuelvas a cargar.
    </p>}
    {board?.cloudConfigured&&!current.referenceReady&&<p role="alert" className="mt-2 text-xs text-red-200">
     Esta toma no tiene una fotografía aprobada verificable en Supabase. No se puede generar.
    </p>}
    {!board?.providerEnabled&&<p role="alert" className="mt-2 text-xs text-amber-200">
     Runway está deshabilitado en el servidor. No se llamará al proveedor.
     Para habilitarlo, configura V7_RUNWAY_E02_ENABLED=true en el estudio local.
    </p>}
    {current.status==='failed-unknown'&&!current.taskKnown&&<p role="alert" className="mt-2 text-xs text-red-200">
     Fallo antiguo sin ID: generación bloqueada. Necesita reconciliación antes de intentar pagar.
    </p>}
    <p className="mt-1 text-xs text-slate-300">
     Nunca se repetirá una tarea en curso ni una revisión ya enviada.
     Si el intento anterior existe, Runway debe confirmar que terminó en FAILED.
     El video original y el historial se mantienen.
    </p>
    <label className="mt-3 flex items-start gap-2 text-sm">
     <input type="checkbox" checked={agree} onChange={e=>setAgree(e.target.checked)}
      disabled={!!busy||!current.correction||current.correctionAttemptUsed}/>
     Confirmo un único render pagado de {selected} por US$0.50.
    </label>
    <label htmlFor="e02-correction-authorization" className="mt-2 block text-xs text-slate-300">
     Escribe AUTORIZO {selected} para ejecutar exactamente una solicitud.
    </label>
    <input id="e02-correction-authorization" value={authorization}
     onChange={e=>setAuthorization(e.target.value)} placeholder={'AUTORIZO '+selected}
     disabled={!!busy||!current.correction||current.correctionAttemptUsed}
     className="mt-1 w-full max-w-sm rounded-lg border border-white/20 bg-slate-950/70 p-2 text-sm text-white"/>
    <button type="button" disabled={!readyToSubmit}
     className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
     onClick={()=>void submit()}>Autorizar y generar solo {selected}</button>
    {current.correctionAttemptUsed&&<p className="mt-2 text-xs text-amber-200">
     Esta versión ya se utilizó: se bloquea cualquier segundo envío.
    </p>}
   </div>
   {busy&&<p role="status" className="text-xs text-sky-200">{busy}…</p>}
   {notice&&<p role="status" className="text-sm text-emerald-200">{notice}</p>}
   {failure&&<p role="alert" className="text-sm text-red-300">{failure}</p>}
  </div>}
  <p className="mt-3 text-xs text-slate-400">
   La preparación, el diagnóstico y la simulación no llaman a image_to_video.
   El botón de generación es la única acción que puede solicitar una tarea pagada.
  </p>
 </section>;
}
