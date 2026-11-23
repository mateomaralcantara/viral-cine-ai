'use client';

import {useCallback,useEffect,useState} from 'react';
import {CheckCircle2,Clapperboard,RefreshCcw,ShieldAlert} from 'lucide-react';

type CloudShot={approved:boolean;readyForScene:boolean;sha256?:string;storagePath?:string};
type CloudBoard={
 ok:boolean;configured:boolean;approvedCount:number;requiredCount:7;referencesReady:boolean;
 shots:Record<string,CloudShot>;
 error?:string;
};
type BoardShot={label:string;hasVideo:boolean;reason:string};
const IDS=Array.from({length:7},(_,i)=>'E02-P0'+(i+1));

export default function V7E02CloudImageGallery({
 filmId,sceneShots
}:{filmId:string;sceneShots:BoardShot[]}){
 const [board,setBoard]=useState<CloudBoard|null>(null);
 const [error,setError]=useState('');
 const [refreshing,setRefreshing]=useState(true);
 const base='/api/v7/films/'+encodeURIComponent(filmId)+'/scene02-references';
 const reload=useCallback(async()=>{
  const response=await fetch(base,{credentials:'same-origin',cache:'no-store'});
  const raw=await response.text();
  let result:CloudBoard;
  try{result=JSON.parse(raw) as CloudBoard;}
  catch{throw Error('El servidor local respondió sin datos válidos de Supabase (HTTP '+response.status+').');}
  if(!response.ok||!result.ok)throw Error(result.error||'Sin conexión al catálogo de referencias de Supabase.');
  setBoard(result);setError('');
 },[base]);
 useEffect(()=>{
  let mounted=true;
  const update=()=>{void reload().catch(e=>{if(mounted)setError(e instanceof Error?e.message:String(e))})
    .finally(()=>{if(mounted)setRefreshing(false)})};
  update();
  const timer=setInterval(update,30000);
  return()=>{mounted=false;clearInterval(timer)};
 },[reload]);
 const count=board?.approvedCount??0;
 return <div className="mt-4 rounded-2xl border border-violet-400/30 bg-violet-400/[.06] p-4 md:p-5">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div>
    <h3 className="flex items-center gap-2 text-lg font-black text-white">
     <Clapperboard className="h-5 w-5 text-violet-300"/>
     Fotografías originales · Escena 02
    </h3>
    <p className="mt-1 text-xs text-slate-300">
     Estas imágenes se consultan desde Supabase. No hay que volverlas a importar ni aprobar.
    </p>
   </div>
   <button type="button" className="button-secondary text-sm" onClick={()=>{
    setRefreshing(true);void reload().catch(e=>setError(e instanceof Error?e.message:String(e)))
     .finally(()=>setRefreshing(false))
   }}>
    <RefreshCcw className="mr-1 inline h-4 w-4"/> Actualizar fotografías
   </button>
  </div>
  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
   <span className={'rounded-full border px-3 py-1.5 font-bold '+(board?.referencesReady?
    'border-emerald-400/40 bg-emerald-400/10 text-emerald-200':
    'border-amber-400/30 bg-amber-400/10 text-amber-200')}>
    {refreshing&&!board?'Consultando…':board?.configured?
      count+' de 7 fotografías aprobadas en Supabase':'Conexión con Supabase pendiente'}
   </span>
   <span className="text-slate-400">Las fotos aprobadas no equivalen a videos MP4 generados.</span>
  </div>
  {error&&<p className="mt-3 flex items-center gap-2 text-xs text-amber-200" role="alert">
   <ShieldAlert className="h-4 w-4 shrink-0"/>{error}
  </p>}
  {board&&!board.configured&&<p className="mt-3 text-xs text-amber-200">
   Las fotografías pueden estar guardadas en Supabase, pero este servidor local todavía
   no tiene configurada su lectura. No se han borrado ni rechazado.
  </p>}
  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
   {IDS.map(id=>{
    const ref=board?.shots[id];
    const available=board?.configured&&ref?.readyForScene===true;
    const shot=sceneShots.find(s=>s.label===id);
    const url=base+'/'+encodeURIComponent(id)+'/image';
    return <article key={id} className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/70">
     <div className="flex aspect-video items-center justify-center overflow-hidden bg-slate-900">
      {available?
       <img src={url} alt={'Fotografía original aprobada '+id}
        loading="lazy" className="h-full w-full object-cover"
        onError={e=>{e.currentTarget.style.opacity='0.15';e.currentTarget.title='No se pudo mostrar la imagen desde el servidor local';}}/>:
       <span className="px-3 text-center text-xs text-slate-400">
        {refreshing&&!board?'Consultando Supabase…':board?.configured?
         'Fotografía no confirmada':'Conexión pendiente'}
       </span>}
     </div>
     <div className="space-y-1 p-3">
      <div className="flex flex-wrap items-center justify-between gap-1">
       <strong className="text-sm">{id}</strong>
       <span className={'inline-flex items-center gap-1 text-[11px] '+(available?'text-emerald-300':'text-amber-200')}>
        {available&&<CheckCircle2 className="h-3.5 w-3.5"/>}
        {available?'Foto aprobada':'Foto sin verificar'}
       </span>
      </div>
      <p className={'text-xs '+(shot?.hasVideo?'text-emerald-300':'text-slate-400')}>
       {shot?.hasVideo?'MP4 disponible en V7':'MP4 pendiente de producción o importación'}
      </p>
      {ref?.sha256&&<p className="text-[10px] text-slate-500">
       Referencia SHA-256: {ref.sha256.slice(0,12)}…
      </p>}
     </div>
    </article>;
   })}
  </div>
 </div>;
}
