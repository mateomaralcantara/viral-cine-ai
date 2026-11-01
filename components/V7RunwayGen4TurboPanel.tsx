'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Clapperboard,CheckCircle2,RefreshCcw,ShieldCheck,Film} from 'lucide-react';

type Shot={id:string;title:string;action:string;editSeconds:number;
 promptText:string;promptHash:string;estimateUsd:number;
 status:string;taskKnown:boolean;videoReady:boolean;referenceShotId:string|null;error:string|null};
type Board={ok:boolean;enabled:boolean;configured:boolean;shots:Shot[];
 reservedUsd:number;maxSceneUsd:number;estimatedUsdPerShot:number;durationSeconds:number};
type Detail={ok?:boolean;error?:string;status?:string;referenceShotId?:string;videoReady?:boolean};
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
export default function V7RunwayGen4TurboPanel({filmId}:{filmId:string}){
 const endpoint='/api/v7/films/'+encodeURIComponent(filmId)+'/runway-gen4';
 const [board,setBoard]=useState<Board|null>(null);
 const [token,setToken]=useState('');
 const [allowSpend,setAllowSpend]=useState(false);
 const [busy,setBusy]=useState(false);
 const [detail,setDetail]=useState('');
 const [error,setError]=useState('');
 const running=useRef(false);
 const cancel=useRef(false);
 const refresh=useCallback(async()=>{
  const response=await fetch(endpoint,{cache:'no-store'});
  const data=await response.json() as Board&{error?:string};
  if(!response.ok||!data.ok)throw Error(data.error||'Runway no está disponible.');
  setBoard(data);setError('');
  return data;
 },[endpoint]);
 useEffect(()=>{
  void refresh().catch(e=>setError(String(e)));
  const timer=setInterval(()=>{if(!running.current)void refresh().catch(()=>undefined);},14000);
  return ()=>{cancel.current=true;clearInterval(timer);};
 },[refresh]);
 async function request(action:'preflight'|'submit'|'resume',shotId:string,shot?:Shot){
  const response=await fetch(endpoint,{method:'POST',
   headers:action==='preflight'?{'Content-Type':'application/json'}:
    {'Content-Type':'application/json',Authorization:'Bearer '+token},
   body:JSON.stringify({action,shotId,...(action==='submit'?{
    confirmHuman:true,explicitSpendConsent:true,approvedUsd:0.5,
    promptHash:shot?.promptHash}:{})})});
  const body=await response.json() as Detail;
  if(!response.ok||!body.ok)throw Error(shotId+': '+(body.error||'No se completó la solicitud.'));
  return body;
 }
 async function preflight(id:string){
  try{
   setError('');const r=await request('preflight',id);
   setDetail(id+': referencia disponible de '+r.referenceShotId+'. Preparada sin gasto.');
  }catch(e){setError(String(e));}
 }
 async function resume(id:string){
  if(!token){setError('Pega el token administrativo para recuperar la tarea.');return;}
  try{
   setError('');const r=await request('resume',id);
   setDetail(id+': '+r.status+'. Sin una nueva generación.');
   await refresh();
  }catch(e){setError(String(e));}
 }
 async function produceAll(){
  if(running.current||!board?.enabled||!token||!allowSpend)return;
  const notStarted=board.shots.filter(s=>s.status==='not-started');
  const budget=Number((notStarted.length*.5).toFixed(2));
  if(budget+board.reservedUsd>board.maxSceneUsd+0.001){
   setError('Presupuesto superado. No se enviará ninguna nueva tarea.');return;
  }
  running.current=true;cancel.current=false;
  setBusy(true);setAllowSpend(false);setError('');
  try{
   for(const shot of board.shots){
    if(cancel.current)break;
    let state=(await refresh()).shots.find(s=>s.id===shot.id)!;
    if(state.status==='review-required'){setDetail(shot.id+' lista.');continue;}
    if(state.status==='failed-unknown')throw Error(shot.id+' tiene una operación fallida. Sin reintento automático.');
    if(state.status==='not-started'){
     setDetail('Generando '+shot.id+' con Runway · costo autorizado US$0.50');
     await request('submit',shot.id,state);
     state=(await refresh()).shots.find(s=>s.id===shot.id)!;
    }
    if(!state.taskKnown)throw Error(shot.id+' sin identificador de Runway. Detenido para evitar gasto duplicado.');
    let finished=false;
    for(let i=0;i<40;i++){
     if(cancel.current)break;
     await wait(i===0?1000:18000);
     const result=await request('resume',shot.id);
     await refresh();
     if(result.status==='review-required'){
      finished=true;setDetail(shot.id+' MP4 recuperado. Continuando con la siguiente toma.');
      break;
     }
     if(result.status==='failed-unknown')throw Error(shot.id+' falló; detengo la producción para no repetir gastos.');
     setDetail(shot.id+' procesándose en Runway · consulta #'+(i+1)+'.');
    }
    if(!finished)throw Error('La sesión quedó pendiente en '+shot.id+
      '. Puedes recuperar la misma tarea desde su botón, sin volver a pagar.');
   }
   if(!cancel.current)setDetail('Todos los MP4 Runway disponibles. Revisa y aprueba las tomas en Escenas para montar el corte.');
  }catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{running.current=false;setBusy(false);void refresh().catch(()=>undefined);}
 }
 const outstanding=board?.shots.filter(s=>s.status==='not-started')??[];
 const outstandingCost=outstanding.length*.5;
 return <section className="rounded-3xl border border-violet-400/30 bg-violet-400/[.04] p-5 md:p-7">
  <p className="text-xs font-bold uppercase tracking-[.16em] text-violet-300">Proveedor principal de la Escena 01</p>
  <h2 className="mt-2 flex items-center gap-2 text-xl font-black">
   <Clapperboard className="h-6 w-6"/> Runway Gen-4 Turbo · Producción visual
  </h2>
  <p className="mt-2 text-sm text-slate-300">
   P01 y P02 se conservan. P03–P07 se animan desde un fotograma del video anterior.
   Cada nuevo render produce 10 segundos; el montaje utiliza 7 segundos de cada uno.
   Las voces, efectos y dos bocinazos se incorporarán después.
  </p>
  <div className="mt-4 grid gap-3 sm:grid-cols-3">
   <div className="rounded-xl border border-white/10 p-3">
    <p className="text-xs text-slate-400">Nuevas solicitudes pendientes</p>
    <strong className="text-xl">{outstanding.length}</strong>
   </div>
   <div className="rounded-xl border border-white/10 p-3">
    <p className="text-xs text-slate-400">Máximo adicional actual</p>
    <strong className="text-xl">US$ {outstandingCost.toFixed(2)}</strong>
   </div>
   <div className="rounded-xl border border-white/10 p-3">
    <p className="text-xs text-slate-400">Reservado en Runway</p>
    <strong className="text-xl">US$ {(board?.reservedUsd??0).toFixed(2)} / 2.50</strong>
   </div>
  </div>
  <div className="mt-4 rounded-xl border border-amber-400/20 p-3 text-sm text-amber-100">
   <ShieldCheck className="mr-2 inline h-4 w-4"/>
   {board?.enabled?'Proveedor habilitado: se necesita tu autorización explícita para nuevos cargos.':
   board?.configured?'Clave encontrada. Activa V7_RUNWAY_E01_ENABLED=true al iniciar el servidor.':
   'RUNWAYML_API_SECRET no configurada: el panel puede preparar pero no generar.'}
   Ninguna solicitud pagada se inicia automáticamente por abrir esta página.
  </div>
  <input className="mt-3 w-full rounded-lg border border-white/20 bg-slate-950 p-3 text-sm"
   aria-label="Token administrativo de Runway" type="password" autoComplete="off"
   placeholder="Token administrativo local (el mismo de ViralCine)" value={token}
   onChange={e=>setToken(e.target.value)}/>
  <label className="mt-4 flex items-center gap-3 text-sm">
   <input type="checkbox" checked={allowSpend} disabled={busy||!outstanding.length}
    onChange={e=>setAllowSpend(e.target.checked)}/>
   Autorizo hasta US$ {outstandingCost.toFixed(2)} para los {outstanding.length} clips pendientes, sin reintentos pagados
  </label>
  <button className="button-primary mt-3" type="button" onClick={()=>void produceAll()}
   disabled={busy||!token||!allowSpend||!board?.enabled||!outstanding.length||
    (board?board.reservedUsd+outstandingCost>board.maxSceneUsd+0.001:true)}>
   {busy?'Generando y recuperando clips…':'Producir bloques faltantes con Runway'}
  </button>
  {detail&&<p className="mt-3 text-sm text-emerald-200" role="status">{detail}</p>}
  {error&&<p className="mt-3 text-sm text-red-300" role="alert">{error}</p>}
  <div className="mt-5 space-y-3">
   {board?.shots.map(s=><div className="rounded-xl border border-white/10 p-4" key={s.id}>
    <div className="flex flex-wrap justify-between gap-2">
     <strong className="text-sm">{s.id} · {s.title}</strong>
     <span className={'text-xs '+(s.videoReady?'text-emerald-300':'text-amber-200')}>{s.status.toUpperCase()}</span>
    </div>
    <p className="mt-2 text-xs text-slate-300">{s.action}</p>
    <p className="mt-1 text-xs text-slate-400">Imagen inicial: {s.referenceShotId??'se selecciona del video anterior'}
     · Clip de 10 s / corte de 7 s · US$0.50 por generación</p>
    <details className="mt-2 text-xs text-slate-300">
     <summary className="cursor-pointer">Ver movimiento y prompt de Runway</summary>
     <p className="mt-2 whitespace-pre-wrap">{s.promptText}</p>
    </details>
    <div className="mt-3 flex flex-wrap gap-2">
     <button className="button-secondary text-xs" type="button" onClick={()=>void preflight(s.id)}>
      Preparar sin costo
     </button>
     {s.taskKnown&&<button className="button-secondary text-xs" type="button"
       disabled={!token||busy} onClick={()=>void resume(s.id)}>
       <RefreshCcw className="mr-1 inline h-4 w-4"/> Recuperar misma tarea
      </button>}
     {s.videoReady&&<span className="inline-flex items-center gap-1 text-xs text-emerald-200">
       <CheckCircle2 className="h-4 w-4"/> MP4 guardado</span>}
    </div>
    {s.error&&<p className="mt-2 text-xs text-amber-200">{s.error}</p>}
   </div>)}
  </div>
  <a className="button-secondary mt-4 inline-flex" href={'/v7/films/'+encodeURIComponent(filmId)+'?tab=scenes'}>
   <Film className="mr-2 h-4 w-4"/> Revisar tomas y montar Escena 01
  </a>
 </section>;
}
