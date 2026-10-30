'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Clapperboard,CheckCircle2,RefreshCcw,ShieldCheck,Film} from 'lucide-react';
import {ensureLocalStudioSession} from '@/lib/v7/security/local-studio-client';
import V7Scene02CorrectionPanel from '@/components/V7Scene02CorrectionPanel';

type Shot={id:string;title:string;action:string;editSeconds:number;
 promptText:string;promptHash:string;estimateUsd:number;
 status:string;taskKnown:boolean;videoReady:boolean;referenceShotId:string|null;error:string|null;imageReady:boolean;
 voiceCode?:string|null;dialog?:string|null};
type Board={ok:boolean;enabled:boolean;configured:boolean;seedReady:boolean;shots:Shot[];
 reservedUsd:number;maxSceneUsd:number;estimatedUsdPerShot:number;durationSeconds:number};
type Detail={ok?:boolean;error?:string;status?:string;referenceShotId?:string;videoReady?:boolean};
type CloudBoard={ok:boolean;configured:boolean;approvedCount:number;requiredCount:number;
 referencesReady:boolean;generationQueueEnabled:boolean;
 shots:Record<string,{approved:boolean;readyForScene:boolean;sha256?:string}>};
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
export default function V7RunwayScene02Panel({filmId}:{filmId:string}){
 const endpoint='/api/v7/films/'+encodeURIComponent(filmId)+'/runway-scene02';
 const cloudEndpoint='/api/v7/films/'+encodeURIComponent(filmId)+'/scene02-references';
 const [board,setBoard]=useState<Board|null>(null);
 const [cloudBoard,setCloudBoard]=useState<CloudBoard|null>(null);
 const [uploadingShot,setUploadingShot]=useState<string|null>(null);
 const [bulkUploading,setBulkUploading]=useState(false);
 const [uploadMessages,setUploadMessages]=useState<Record<string,string>>({});
 const [bulkMessage,setBulkMessage]=useState('');
 const [allowSpend,setAllowSpend]=useState(false);
 const [busy,setBusy]=useState(false);
 const [detail,setDetail]=useState('');
 const [error,setError]=useState('');
 const [pairNotice,setPairNotice]=useState('');
 const running=useRef(false);
 const cancel=useRef(false);
 const migrationRequested=useRef(false);
 const refresh=useCallback(async()=>{
  const response=await fetch(endpoint,{cache:'no-store'});
  const data=await response.json() as Board&{error?:string};
  if(!response.ok||!data.ok)throw Error(data.error||'Runway no está disponible.');
  setBoard(data);
  return data;
 },[endpoint]);
 const refreshCloud=useCallback(async()=>{
  await ensureLocalStudioSession();
  const response=await fetch(cloudEndpoint,{cache:'no-store',credentials:'same-origin'});
  const raw=await response.text();
  let status:CloudBoard&{error?:string};
  try{status=JSON.parse(raw) as typeof status;}
  catch{throw Error('Supabase respondió sin JSON (HTTP '+response.status+').');}
  if(!response.ok||!status.ok)throw Error(status.error||'No fue posible consultar Supabase.');
  setCloudBoard(status);return status;
 },[cloudEndpoint]);
 useEffect(()=>{
  void ensureLocalStudioSession().then(()=>setPairNotice('Sesión local lista. No necesitas token.'))
   .catch(e=>setPairNotice(e instanceof Error?e.message:String(e)));
  void refresh().catch(e=>setError(String(e)));
  void refreshCloud().then(async status=>{
   // One-time, cost-free migration of the seven existing local JPGs.
   // No repeated uploads or paid provider calls.
   if(!status.configured||status.referencesReady||migrationRequested.current)return;
   migrationRequested.current=true;
   setBulkMessage('Sincronizando fotografías existentes a Supabase…');
   try{
    const response=await fetch(cloudEndpoint,{method:'POST',credentials:'same-origin',
     headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'sync-existing'})});
    const raw=await response.text();
    if(!raw.trim())throw Error('No hubo respuesta de Supabase (HTTP '+response.status+').');
    const imported=JSON.parse(raw) as {ok?:boolean;error?:string;
     board?:CloudBoard;imported?:Array<{shotId:string;approved:boolean;reason?:string}>};
    if(!response.ok||!imported.ok)throw Error(imported.error||'No se pudo sincronizar.');
    if(imported.board)setCloudBoard(imported.board);
    const missing=imported.imported?.filter(x=>!x.approved)??[];
    setBulkMessage(missing.length?'Fotos locales pendientes: '+missing.map(x=>x.shotId).join(', ')+
     '. Selecciona solo las que faltan.':'7 fotos persistidas, aprobadas y listas en Supabase.');
   }catch(e){setError(e instanceof Error?e.message:String(e));}
  }).catch(e=>setError(e instanceof Error?e.message:String(e)));
  const timer=setInterval(()=>{if(!running.current){
   void refresh().catch(()=>undefined);
   void refreshCloud().catch(()=>undefined);
  }},14000);
  return ()=>{cancel.current=true;clearInterval(timer);};
 },[refresh,refreshCloud,cloudEndpoint]);
 async function request(action:'preflight'|'submit'|'resume',shotId:string,shot?:Shot){
  await ensureLocalStudioSession();
  const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({action,shotId,...(action==='submit'?{
    confirmHuman:true,explicitSpendConsent:true,approvedUsd:0.5,
    promptHash:shot?.promptHash}:{})})});
  const body=await response.json() as Detail;
  if(!response.ok||!body.ok)throw Error(shotId+': '+(body.error||'No se completó la solicitud.'));
  return body;
 }
 const imageName=/E02[-_ ]?P0([1-7])/i;
 async function saveImage(id:string,file:File){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))
   throw Error(id+': selecciona JPG, PNG o WebP.');
  if(file.size<3000||file.size>4000000)
   throw Error(id+': la imagen debe pesar entre 3 KB y 4 MB.');
  await ensureLocalStudioSession();
  const response=await fetch(cloudEndpoint,{method:'POST',
   credentials:'same-origin',
   headers:{'Content-Type':file.type,'X-V7-Shot-ID':id,'X-V7-Filename':encodeURIComponent(file.name)},
   body:file,cache:'no-store'});
  // The Next.js proxy or the server may return an empty 4xx/5xx response.
  // Never report "Unexpected end of JSON input" to the artist.
  const raw=await response.text();
  if(!raw.trim())throw new Error(id+': el servidor respondió vacío (HTTP '+
   response.status+'). No se guardó la imagen. Revisa la terminal de Next.js.');
  let result:{ok?:boolean;error?:string;approved?:boolean;readyForScene?:boolean};
  try{result=JSON.parse(raw) as typeof result;}
  catch{throw new Error(id+': respuesta inválida del servidor (HTTP '+
   response.status+'). Revisa el registro de Next.js.');}
  if(!response.ok||!result.ok||!result.approved||!result.readyForScene)
   throw Error(id+': '+(result.error||'El servidor no confirmó que el JPG quedara guardado.')+
    ' (HTTP '+response.status+').');
  setUploadMessages(old=>({...old,[id]:
   'Guardada en Supabase, aprobada automáticamente y lista para escena.'}));
  await refreshCloud();
  await refresh();
 }
 async function selectedImage(id:string,file:File|null){
  if(!file)return;
  setError('');
  setUploadingShot(id);
  setUploadMessages(old=>({...old,[id]:'Guardando '+file.name+'…'}));
  try{
   await saveImage(id,file);
  }catch(e){
   const message=e instanceof Error?e.message:String(e);
   setUploadMessages(old=>({...old,[id]:'Error: '+message}));
   setError(message);
  }finally{setUploadingShot(null);}
 }
 async function selectedBatch(files:FileList|null){
  if(!files?.length)return;
  setError('');setBulkMessage('');
  const uploads=new Map<string,File>();
  const unknown:string[]=[];
  for(const file of Array.from(files)){
   const match=file.name.match(imageName);
   if(!match){unknown.push(file.name);continue;}
   const id='E02-P0'+match[1];
   if(uploads.has(id)){
    setError('Hay dos imágenes para '+id+'. Selecciona una sola por toma.');
    return;
   }
   uploads.set(id,file);
  }
  if(!uploads.size){
   setError('Ningún nombre contiene E02-P01 … E02-P07. Extrae los JPG del ZIP y selecciónalos.');
   return;
  }
  setBulkUploading(true);
  let saved=0;const failures:string[]=[];
  try{
   for(const [id,file] of uploads){
    setBulkMessage('Guardando imagen '+(saved+1)+' de '+uploads.size+' · '+id+'…');
    try{await saveImage(id,file);saved++;}
    catch(e){
     const message=e instanceof Error?e.message:String(e);
     failures.push(message);
     setUploadMessages(old=>({...old,[id]:'Error: '+message}));
     if(/respondió vacío|respuesta inválida|sin JSON válido|Sesión administrativa|sesión local|El navegador no está enlazado|emparejamiento|HTTP 403|HTTP 405/i.test(message)){
      setBulkMessage('Carga detenida por error de comunicación. No se volverán a enviar las demás imágenes.');
      break;
     }
    }
   }
   setBulkMessage(old=>old.startsWith('Carga detenida')?old:
    saved+' imagen(es) guardada(s) de '+uploads.size+'.'+
    (unknown.length?' Se omitieron '+unknown.length+' archivos sin código E02-PXX.':''));
   if(failures.length)setError('Algunas imágenes no se guardaron: '+failures.join(' | '));
  }finally{setBulkUploading(false);await refreshCloud().catch(()=>undefined);
   await refresh().catch(()=>undefined);}
 }
 async function preflight(id:string){
  try{
   setError('');const r=await request('preflight',id);
   setDetail(id+': referencia disponible de '+r.referenceShotId+'. Preparada sin gasto.');
  }catch(e){setError(String(e));}
 }
 async function resume(id:string){
  await ensureLocalStudioSession();
  try{
   setError('');const r=await request('resume',id);
   setDetail(id+': '+r.status+'. Sin una nueva generación.');
   await refresh();
  }catch(e){setError(String(e));}
 }
 async function produceAll(){
  if(running.current||!board?.enabled||!cloudBoard?.referencesReady||!allowSpend||
     board.shots.some(s=>s.status==='blocked-credits'||s.status==='blocked-credentials'))return;
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
    if(state.status==='blocked-credits'||state.status==='blocked-credentials')
      throw Error(shot.id+': Runway está bloqueado. No se volverá a enviar ni se consumirá el presupuesto restante.');
    if(state.status==='not-started'){
     setDetail('Solicitando la operación de '+shot.id+' (aún no confirmada por Runway)…');
     await request('submit',shot.id,state);
     setDetail(shot.id+': operación registrada en Runway. Recuperando el MP4…');
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
   if(!cancel.current)setDetail('Los siete MP4 de E02 disponibles. Aprueba las tomas en Escenas y monta el corte de 55 segundos.');
  }catch(e){
   setDetail('');
   setError(e instanceof Error?e.message:String(e));
  }
  finally{running.current=false;setBusy(false);void refresh().catch(()=>undefined);}
 }
 const blockedCredits=board?.shots.some(s=>s.status==='blocked-credits')??false;
 const blockedCredentials=board?.shots.some(s=>s.status==='blocked-credentials')??false;
 const providerBlocked=blockedCredits||blockedCredentials;
 const outstanding=board?.shots.filter(s=>s.status==='not-started')??[];
 const outstandingCost=outstanding.length*.5;
 return <section className="rounded-3xl border border-violet-400/30 bg-violet-400/[.04] p-5 md:p-7">
  <p className="text-xs font-bold uppercase tracking-[.16em] text-violet-300">Proveedor principal de la Escena 02</p>
  <h2 className="mt-2 flex items-center gap-2 text-xl font-black">
   <Clapperboard className="h-6 w-6"/> Runway Gen-4 Turbo · Escena 02
  </h2>
  <p className="mt-2 text-sm text-slate-300">
   «La casa en silencio» · 7 tomas, 55 segundos. Primero se guardan y aprueban las siete fotos en Supabase.
   Cada clip de 10 s utiliza su fotografía aprobada y el editor
   recorta 8+8+8+8+8+8+7 segundos. Las voces y música se añaden después.
  </p>
  {providerBlocked&&<div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4"
    role="alert">
   <strong>Producción pausada: {blockedCredits?'Runway no tiene créditos suficientes.':'Runway rechazó sus credenciales.'}</strong>
   <p className="mt-1 text-sm text-slate-200">
    Tus siete fotografías siguen guardadas. No se enviarán más tareas ni se autorizarán nuevos cargos.
    Para continuar necesitas reponer el saldo del proveedor o aprobar un motor alternativo.
    El importe que antes figuraba «reservado» era del libro interno de ViralCine, no una confirmación de cobro.
   </p>
  </div>}
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
    <p className="text-xs text-slate-400">Presupuesto registrado (no es un cobro confirmado)</p>
    <strong className="text-xl">US$ {(board?.reservedUsd??0).toFixed(2)} / 3.50</strong>
   </div>
  </div>
  <div className="mt-4 rounded-xl border border-amber-400/20 p-3 text-sm text-amber-100">
   <ShieldCheck className="mr-2 inline h-4 w-4"/>
   {board?.enabled?'Proveedor habilitado: se necesita tu autorización explícita para nuevos cargos.':
   board?.configured?'Clave encontrada. Activa V7_RUNWAY_E02_ENABLED=true al iniciar el servidor.':
   'RUNWAYML_API_SECRET no configurada: el panel puede preparar pero no generar.'}
   Ninguna solicitud pagada se inicia automáticamente por abrir esta página.
  </div>
  <p className="mt-3 rounded-lg border border-emerald-400/20 p-3 text-sm text-emerald-200">
   Sesión administrativa automática · {pairNotice||'Conectando al estudio local…'}
   No escribas ni pegues el token.
  </p>
  <div className="mt-4 rounded-xl border border-violet-400/25 p-4">
    <strong className="text-sm">Imágenes de la Escena 02 — importación automática</strong>
    <p className="mt-1 text-xs text-slate-300">
      Puedes seleccionar los siete JPG del ZIP extraído al mismo tiempo. Cada archivo
      debe llamarse E02-P01, E02-P02 … E02-P07. También puedes seleccionar
      las imágenes por separado, debajo de cada toma. Guardar imágenes no cuesta dinero.
    </p>
    <p className="mt-2 text-sm font-semibold" role="status">
      {!cloudBoard?'Consultando las referencias de Supabase…':
       !cloudBoard.configured?
        'Supabase no está conectado en este entorno de revisión. Estado real de las fotografías: no verificable desde aquí.':
       cloudBoard.approvedCount+' de 7 fotografías verificadas y aprobadas en Supabase.'+
       (cloudBoard.referencesReady?' ESCENA LISTA · sin aprobaciones adicionales.':
        ' Solo importa las referencias que realmente falten.')}
    </p>
    <input className="mt-3 block max-w-full text-xs" type="file"
      accept="image/jpeg,image/png,image/webp" multiple
      aria-label="Importar siete imágenes de Escena 02"
      disabled={!cloudBoard?.configured||bulkUploading}
      onChange={e=>{void selectedBatch(e.target.files);e.target.value='';}}/>
    <p className="mt-2 text-xs text-slate-400">
      Subir = guardar en Supabase + aprobar + dejar lista. Sin botón adicional.
    </p>
    {cloudBoard&&!cloudBoard.configured&&<p role="alert" className="mt-2 text-xs text-amber-200">
      Las fotografías pueden seguir aprobadas en el servidor principal. Este entorno no puede consultarlas.
      No las vuelvas a subir ni copies secretos a la revisión; verifica el 7/7 desde tu servidor habitual.
    </p>}
    {bulkUploading&&<p className="mt-2 text-xs text-violet-200" role="status">
      Importando imágenes…</p>}
    {bulkMessage&&<p className="mt-2 text-xs text-emerald-200" role="status">{bulkMessage}</p>}
  </div>
  <label className="mt-4 flex items-center gap-3 text-sm">
   <input type="checkbox" checked={allowSpend} disabled={busy||!outstanding.length}
    onChange={e=>setAllowSpend(e.target.checked)}/>
   Autorizo hasta US$ {outstandingCost.toFixed(2)} para los {outstanding.length} clips pendientes, sin reintentos pagados
  </label>
  <button className="button-primary mt-3" type="button" onClick={()=>void produceAll()}
   disabled={busy||bulkUploading||!!uploadingShot||providerBlocked||!allowSpend||!board?.enabled||!cloudBoard?.referencesReady||!outstanding.length||
    (board?board.reservedUsd+outstandingCost>board.maxSceneUsd+0.001:true)}>
   {busy?'Generando y recuperando clips…':'Producir bloques faltantes con Runway'}
  </button>
  {detail&&<p className="mt-3 text-sm text-emerald-200" role="status">{detail}</p>}
  {error&&<p className="mt-3 text-sm text-red-300" role="alert">{error}</p>}
  <V7Scene02CorrectionPanel filmId={filmId}/>
  <div className="mt-5 space-y-3">
   {board?.shots.map(s=><div className="rounded-xl border border-white/10 p-4" key={s.id}>
    <div className="flex flex-wrap justify-between gap-2">
     <strong className="text-sm">{s.id} · {s.title}</strong>
     <span className={'text-xs '+(s.videoReady?'text-emerald-300':'text-amber-200')}>{s.status.toUpperCase()}</span>
    </div>
    <p className="mt-2 text-xs text-slate-300">{s.action}</p>
    <p className="mt-1 text-xs text-slate-400">Imagen inicial: {s.referenceShotId??'se selecciona del video anterior'}
     · Clip de 10 s / corte de {s.editSeconds} s · US$0.50 por generación</p>
    {s.dialog&&<p className="mt-2 rounded-lg bg-white/[.04] p-2 text-xs text-slate-200">
      Voz posterior · {s.voiceCode}: «{s.dialog}»</p>}
    <details className="mt-2 text-xs text-slate-300">
     <summary className="cursor-pointer">Ver movimiento y prompt de Runway</summary>
     <p className="mt-2 whitespace-pre-wrap">{s.promptText}</p>
    </details>
    <div className="mt-3 flex flex-wrap gap-2">
     <button className="button-secondary text-xs" type="button" onClick={()=>void preflight(s.id)}>
      Preparar sin costo
     </button>
     {s.taskKnown&&<button className="button-secondary text-xs" type="button"
       disabled={busy} onClick={()=>void resume(s.id)}>
       <RefreshCcw className="mr-1 inline h-4 w-4"/> Recuperar misma tarea
      </button>}
     {s.videoReady&&<span className="inline-flex items-center gap-1 text-xs text-emerald-200">
       <CheckCircle2 className="h-4 w-4"/> MP4 guardado</span>}
    </div>
    <div className="mt-3 rounded-lg border border-violet-400/20 p-3">
      <p className="text-xs font-semibold text-slate-200">
        {s.id} · {!cloudBoard?'Consultando referencia…':
         !cloudBoard.configured?'Supabase no conectado aquí — estado no verificable':
         cloudBoard.shots[s.id]?.readyForScene?'Aprobada y lista en Supabase':'Pendiente de Supabase'}
      </p>
      <input type="file" accept="image/jpeg,image/png,image/webp"
        aria-label={'Importar imagen para '+s.id}
        disabled={!cloudBoard?.configured||bulkUploading||!!uploadingShot}
        onChange={e=>{
         const file=e.target.files?.[0]??null;
         e.target.value='';
         void selectedImage(s.id,file);
        }} className="mt-2 block max-w-full text-xs"/>
      {uploadingShot===s.id&&<p role="status" className="mt-1 text-xs text-violet-200">
        Guardando automáticamente…</p>}
      {uploadMessages[s.id]&&<p role="status" className="mt-1 text-xs text-amber-100">
        {uploadMessages[s.id]}</p>}
      {s.taskKnown&&<p className="mt-1 text-xs text-slate-400">
        La toma tiene una operación Runway registrada: se conservará su imagen original.</p>}
    </div>
    {s.error&&<p className="mt-2 text-xs text-amber-200">{s.error}</p>}
   </div>)}
  </div>
  <a className="button-secondary mt-4 inline-flex" href={'/v7/films/'+encodeURIComponent(filmId)+'?tab=scenes'}>
   <Film className="mr-2 h-4 w-4"/> Revisar tomas y montar Escena 02
  </a>
 </section>;
}
