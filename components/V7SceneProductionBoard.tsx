'use client';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Film, RefreshCcw, ShieldCheck } from 'lucide-react';
import {ensureLocalStudioSession} from '@/lib/v7/security/local-studio-client';
import V7E02CloudImageGallery from '@/components/V7E02CloudImageGallery';

type Shot={id:string;label:string;title:string;approved:boolean;readyForApproval:boolean;hasVideo:boolean;reason:string};
type Scene={id:string;label:string;title:string;approved:boolean;readyForApproval:boolean;readyForAssembly:boolean;assembled:boolean;reason:string;shots:Shot[]};
type Board={ok:boolean;scenes:Scene[];sceneCount:number;shotCount:number;approvedShotCount:number;
 approvedSceneCount:number;pipeline:{mode:string;plannedSteps:number;paidProviderDispatchEnabled:boolean;automaticPaidRetries:number};
 families:Array<{id:string;label:string;agents:readonly string[]}>};
export default function V7SceneProductionBoard({filmId}:{filmId:string}){
  const endpoint='/api/v7/films/'+encodeURIComponent(filmId)+'/scene-production';
  const [board,setBoard]=useState<Board|null>(null);
  const [error,setError]=useState('');
  const [localSession,setLocalSession]=useState('Conectando automáticamente…');
  const [working,setWorking]=useState('');
  const [notice,setNotice]=useState('');
  const refresh=useCallback(async()=>{
    const response=await fetch(endpoint,{cache:'no-store'});
    const data=await response.json() as Board&{error?:string};
    if(!response.ok||!data.ok)throw new Error(data.error||'Tablero no disponible');
    setBoard(data);setError('');
  },[endpoint]);
  useEffect(()=>{
    void ensureLocalStudioSession().then(()=>setLocalSession('Sesión administrativa local activa.'))
      .catch(e=>setLocalSession(String(e)));
    void refresh().catch(e=>setError(e instanceof Error?e.message:String(e)));
    const timer=setInterval(()=>{void refresh().catch(()=>undefined);},12000);
    return ()=>clearInterval(timer);
  },[refresh]);
  async function assemble(sceneId:string){
    await ensureLocalStudioSession();
    setWorking(sceneId);setNotice('');
    try{
      const response=await fetch(endpoint,{method:'POST',
        headers:{'Content-Type':'application/json'},credentials:'same-origin',
        body:JSON.stringify({action:'assemble-local',sceneId})});
      const data=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!data.ok)throw new Error(data.error||'Montaje incompleto');
      await refresh();setNotice('Escena ensamblada con FFmpeg local; revisa el MP4 y aprueba. Sin gastos.');
    }catch(e){setNotice(e instanceof Error?e.message:String(e));}
    finally{setWorking('');}
  }
  async function approve(kind:'shot'|'scene',id:string) {
    await ensureLocalStudioSession();
    setWorking(id);setNotice('');
    try{
      const response=await fetch(endpoint,{
        method:'POST',
        headers:{'Content-Type':'application/json'},credentials:'same-origin',
        body:JSON.stringify({action:'approve-artistic',targetType:kind,targetId:id,confirmHuman:true,
          checks:{identityWardrobe:'pass',voiceSound:'pass',motionContinuity:'pass'},notes:'Aprobación artística del director'})
      });
      const data=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!data.ok)throw new Error(data.error||'No se registró la aprobación');
      await refresh();
      setNotice((kind==='shot'?'Toma':'Escena')+' aprobada y guardada. Sin costos.');
    }catch(e){setNotice(e instanceof Error?e.message:String(e));}
    finally{setWorking('');}
  }
  return (
    <section className="panel mt-6 rounded-3xl p-6 md:p-8">
      <div className="flex items-center gap-3">
        <Film className="h-6 w-6 text-violet-300"/>
        <h2 className="text-2xl font-black">Producción por escenas · Familias de agentes</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        Revisa cada MP4 y pulsa «Aprobar toma». Los botones se pueden pulsar para mostrar
        cualquier bloqueo, sin repetir generaciones. La aprobación artística no genera videos ni cargos.
        La aprobación de la escena completa se habilita después del montaje.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        {[
          ['Escenas',board?.sceneCount??'—'],
          ['Tomas',board?.shotCount??'—'],
          ['Tomas aprobadas',board?.approvedShotCount??'—'],
          ['Escenas aprobadas',board?.approvedSceneCount??'—']
        ].map(([label,value])=><div key={String(label)} className="rounded-xl border border-white/10 p-3">
          <div className="text-xs text-slate-400">{label}</div><div className="mt-1 text-xl font-bold">{value}</div>
        </div>)}
      </div>
      <div className="mt-4 rounded-xl border border-amber-400/20 p-3 text-xs text-amber-200">
        <ShieldCheck className="mr-2 inline h-4 w-4"/>
        Planificación automática sin costo. Ninguna llamada pagada se envía desde este tablero.
        Reintentos de proveedor: bloqueados. La aprobación artística es siempre humana.
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-emerald-200">
          {localSession} No necesitas copiar ni pegar el token.
        </p>
        <button type="button" className="button-secondary" onClick={()=>void refresh().catch(e=>setError(String(e)))}>
          <RefreshCcw className="mr-2 inline h-4 w-4"/>Actualizar todo
        </button>
      </div>
      {error&&<p className="mt-3 text-sm text-red-300" role="alert">{error}</p>}
      {notice&&<p className="mt-3 text-sm text-amber-200" role="status">{notice}</p>}
      {board&&<p className="mt-3 text-xs text-slate-400">
        {board.families.length} familias · {board.pipeline.plannedSteps} tareas planificadas · cero envíos externos
      </p>}
      <div className="mt-5 space-y-3">
        {board?.scenes.map(scene=>(
          <details key={scene.id} className="rounded-2xl border border-white/10 p-4" open={scene.label==='E01'||(scene.label==='E02'&&filmId==='film-dos-toques-de-bocina-v7')}>
            <summary className="cursor-pointer font-bold">
              {scene.label} · {scene.title}
              <span className={'ml-2 text-xs '+(scene.approved?'text-emerald-300':'text-slate-400')}>
                {scene.approved?'APROBADA':scene.assembled?'Montada · revisión pendiente':'En producción'}
              </span>
            </summary>
            <p className="mt-3 text-xs text-slate-400">{scene.reason}</p>
            {scene.label==='E02'&&filmId==='film-dos-toques-de-bocina-v7'&&(
              <V7E02CloudImageGallery filmId={filmId} sceneShots={scene.shots}/>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className="button-secondary"
                disabled={!scene.readyForAssembly||!!working}
                onClick={()=>void assemble(scene.id)}>
                {scene.assembled?'Montaje listo':working===scene.id?'Montando…':'Montar escena completa · Sin costo'}
              </button>
              {scene.assembled&&<a className="button-secondary"
                href={endpoint+'/video?sceneId='+encodeURIComponent(scene.id)}
                target="_blank" rel="noreferrer">Revisar escena MP4</a>}
            </div>
            <button type="button" className="button-primary mt-3"
              disabled={!scene.readyForApproval||!!working}
              onClick={()=>void approve('scene',scene.id)}>
              {scene.approved?'Escena aprobada':working===scene.id?'Guardando…':'Aprobar escena completa'}
            </button>
            <div className="mt-4 space-y-2">
              {scene.shots.map(shot=>(
                <div key={shot.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {shot.label} · {shot.approved&&<CheckCircle2 className="mr-1 inline h-4 w-4 text-emerald-300"/>}
                      {shot.approved?'APROBADA':shot.reason}
                    </p>
                    <p className="truncate text-xs text-slate-400" title={shot.title}>{shot.title}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {shot.hasVideo&&
                      <a className="button-secondary text-sm" target="_blank" rel="noreferrer"
                        href={endpoint+'/video?shotId='+encodeURIComponent(shot.id)}>Ver MP4</a>}
                    {!shot.approved&&!shot.readyForApproval&&
                      <span className="max-w-[280px] text-xs text-amber-200" role="status">
                        {shot.reason}
                      </span>}
                    <button type="button" className="button-primary"
                      disabled={shot.approved||!!working}
                      title={shot.readyForApproval?'MP4 listo para aprobación':shot.reason}
                      onClick={()=>void approve('shot',shot.id)}>
                      {shot.approved?'Aprobada':working===shot.id?'Guardando…':'Aprobar toma'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
      <details className="mt-5 rounded-2xl border border-white/10 p-4">
        <summary className="cursor-pointer font-bold">Ver familias de agentes de la producción</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {board?.families.map(f=><div key={f.id} className="rounded-xl border border-white/10 p-3">
            <p className="text-sm font-bold">{f.label}</p>
            <p className="mt-1 text-xs text-slate-400">{f.agents.join(' · ')}</p>
          </div>)}
        </div>
      </details>
    </section>
  );
}
