'use client';

import {useEffect,useState} from 'react';
import {CheckCircle2,Clapperboard,Clock3,Film,KeyRound,LoaderCircle,LockKeyhole,Pause,Play,RefreshCw,ShieldCheck,WalletCards} from 'lucide-react';
import s from './scene2.module.css';

type Shot={id:string;state:string;duration:number;referenceReady:boolean;imageUrl:string|null;videoUrl:string|null;qaApproved:boolean;taskId:string|null};
type Snapshot={shots:Shot[];videoCount:number;qaCount:number;runwayKeyConfigured:boolean;policy:{status:string;authorized_spend_usd:string;spent_or_reserved_usd:string}|null};
type Reply={ok?:boolean;error?:string;setupRequired?:boolean;authenticated?:boolean;creditBalance?:number;sufficient?:boolean;status?:string};

async function api<T>(action:string,payload:Record<string,unknown>={}):Promise<T>{
 const response=await fetch('/api/v8/scene2',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({action,...payload})});
 const result=await response.json() as T & {error?:string};
 if(!response.ok||result.error)throw Error(result.error||'Error de conexión');
 return result;
}
const translate:Record<string,string>={
 'waiting-credits':'Esperando inicio','awaiting-executor':'Preparada',
 reserved:'Crédito reservado','task-known':'Generando en Runway',
 'qa-pending':'MP4 · QA pendiente','qa-approved':'QA aprobado',
 blocked:'Revisión necesaria','video-ready':'Video recibido',
 'waiting-reference':'Falta fotografía','waiting-shot-spec':'Falta guion'
};
export default function V8Scene2Control(){
 const [loading,setLoading]=useState(true),[logged,setLogged]=useState(false),
 [setup,setSetup]=useState(false),[busy,setBusy]=useState(false),[bad,setBad]=useState(false);
 const [password,setPassword]=useState(''),[activation,setActivation]=useState(''),
 [runwayKey,setRunwayKey]=useState(''),[msg,setMsg]=useState('');
 const [data,setData]=useState<Snapshot|null>(null),[credits,setCredits]=useState<number|null>(null);
 const inform=(message:string,error=false)=>{setMsg(message);setBad(error)};
 const refresh=async()=>{const d=await api<Snapshot>('status');setData(d)};
 useEffect(()=>{
  void(async()=>{
   try{
    const x=await api<Reply>('info');setSetup(x.setupRequired===true);setLogged(x.authenticated===true);
    if(x.authenticated)await refresh();
   }catch(e){inform(e instanceof Error?e.message:String(e),true)}
   finally{setLoading(false)}
  })();
 },[]);
 useEffect(()=>{
  if(!logged)return;
  const timer=setInterval(()=>{if(!busy)void refresh().catch(()=>{})},25000);
  return()=>clearInterval(timer);
 },[logged,busy]);
 const run=(fn:()=>Promise<void>)=>{if(busy)return;setBusy(true);inform('');
  void fn().catch(e=>inform(e instanceof Error?e.message:String(e),true)).finally(()=>setBusy(false))};
 const signIn=()=>run(async()=>{
  await api(''+(setup?'setup':'login'),{code:activation,password});
  setLogged(true);setPassword('');setActivation('');await refresh();
  inform('Acceso seguro activado. Todo el control de la escena está en esta pantalla.');
 });
 const connect=()=>run(async()=>{
  if(!runwayKey.trim())throw Error('Introduce primero la clave API de Runway.');
  const x=await api<Reply>('save-key',{key:runwayKey.trim()});
  setRunwayKey('');setCredits(x.creditBalance??null);await refresh();
  inform('Runway conectado. La clave quedó protegida y el saldo se verificó.');
 });
 const check=()=>run(async()=>{
  const x=await api<Reply>('balance');setCredits(x.creditBalance??null);
  inform(x.sufficient?'Saldo suficiente para las siete tomas.':'Saldo inferior a los 350 créditos necesarios.',!x.sufficient);
 });
 const start=()=>run(async()=>{
  if(!window.confirm('¿Lanzar las siete tomas por Runway Gen-4 Turbo, máximo US$3.50 y sin regeneraciones?'))return;
  const x=await api<Reply>('launch');setCredits(x.creditBalance??null);await refresh();
  inform('Escena E02 habilitada. Los agentes ejecutarán las tomas desde Supabase.');
 });
 const pause=()=>run(async()=>{
  await api('pause');await refresh();
  inform('Nuevas generaciones pausadas; las tareas Runway ya enviadas pueden continuar.');
 });
 const logOut=()=>run(async()=>{
  await api('logout');setLogged(false);setData(null);setCredits(null);inform('Sesión cerrada.');
 });
 const shots=data?.shots||[],policy=data?.policy;
 const refCount=shots.filter(v=>v.referenceReady).length;
 return <main className={s.page}>
  <header className={s.top}><div className={s.brand}>VIRAL<span>CINE</span><small>V8 · CENTRO DE PRODUCCIÓN</small></div>
   <div className={s.topRight}><span className={s.dot}/> DOS TOQUES DE BOCINA · E02</div></header>
  {loading?<div className={s.loading}><LoaderCircle size={24} className={s.spin}/> Conectando con ViralCine…</div>:
  !logged?<section className={s.login}><div className={s.panel}>
   <span className={s.eyebrow}><LockKeyhole size={16}/> ACCESO PRIVADO</span>
   <h1>Tu estudio.<br/><em>Todo visual.</em></h1>
   <p>Controla las siete tomas, conecta Runway y consulta créditos sin volver a utilizar la terminal.</p>
   {msg&&<div role="alert" className={bad?s.error:s.notice}>{msg}</div>}
   {setup&&<label className={s.fieldLabel}>Código de activación (primera vez)<input className={s.input}
    autoComplete="one-time-code" value={activation} onChange={e=>setActivation(e.target.value)}/></label>}
   <label className={s.fieldLabel}>Contraseña de director
    <input className={s.input} type="password" value={password} onChange={e=>setPassword(e.target.value)}
      onKeyDown={e=>{if(e.key==='Enter')signIn()}}
      autoComplete={setup?'new-password':'current-password'} placeholder="Mínimo 12 caracteres"/></label>
   <button disabled={busy} className={s.primary} onClick={signIn}><KeyRound size={17}/>
    {setup?'Activar estudio':'Entrar al estudio'}</button>
   <p className={s.fine}>Tu contraseña y la clave privada de Runway nunca se guardan en el navegador.</p>
  </div></section>:
  <>
   <section className={s.intro}><span className={s.eyebrow}><Film size={15}/> PRODUCCIÓN / ESCENA 02</span>
    <h1>Director de <em>producción</em></h1>
    <p>Fotografías, videos, presupuesto y agentes en un solo frontend. Supabase opera sin depender de la computadora.</p></section>
   {msg&&<div role="status" className={bad?s.error:s.notice}>{msg}</div>}
   <div className={s.metrics}>
    <div className={s.metric}><span>Fotografías aprobadas</span><strong>{refCount}/7</strong><small>Persistentes en Supabase</small></div>
    <div className={s.metric}><span>Videos recibidos</span><strong>{data?.videoCount??0}/7</strong><small>MP4 confirmados</small></div>
    <div className={s.metric}><span>Control de calidad</span><strong>{data?.qaCount??0}/7</strong><small>Tomas aprobadas</small></div>
    <div className={s.metric}><span>Presupuesto máximo</span><strong>US$3.50</strong>
     <small>{'Reservado US$'+Number(policy?.spent_or_reserved_usd||0).toFixed(2)}</small></div>
   </div>
   <div className={s.layout}>
    <section className={s.panel}><div className={s.sectionHead}><div><h2>Las siete tomas</h2><p>Fotografía → video → QA</p></div>
     <button className={s.secondary} disabled={busy} onClick={()=>run(refresh)}><RefreshCw size={16}/> Actualizar</button></div>
     <div className={s.shots}>{shots.map(v=><article key={v.id} className={s.shot}>
      <div className={s.poster}>{v.videoUrl?
       <video controls playsInline preload="none" src={v.videoUrl}/>:
       v.imageUrl?<img alt={'Referencia '+v.id} loading="lazy" src={v.imageUrl}/>:
       <Clapperboard size={30}/>}</div>
      <div className={s.shotInfo}><b>{v.id}</b><span className={s.state}>
       {v.qaApproved?'QA aprobada':translate[v.state]||v.state}</span></div>
      {v.taskId&&<small className={s.shotNote}>Tarea Runway registrada</small>}
     </article>)}</div>
    </section>
    <aside className={s.aside}>
     <section className={s.panel}><span className={s.eyebrow}><KeyRound size={15}/> 01 · CONEXIÓN</span><h2>Runway API</h2>
      <p>{data?.runwayKeyConfigured?<><CheckCircle2 size={16} className={s.inlineCheck}/> Clave protegida en Supabase Vault</>:
       'Falta conectar la clave API de tu proyecto Runway.'}</p>
      <label className={s.fieldLabel}>Clave Runway
       <input className={s.input} type="password" autoComplete="off" value={runwayKey}
        onChange={e=>setRunwayKey(e.target.value)} placeholder="Pega aquí tu clave API"/></label>
      <div className={s.buttons}><button disabled={busy} className={s.secondary} onClick={connect}>
       <ShieldCheck size={16}/> Conectar</button>
       <button disabled={busy} className={s.secondary} onClick={check}><WalletCards size={16}/> Consultar saldo</button></div>
      <p className={s.fine}>{credits===null?'El saldo se comprueba directamente con Runway Dev.':
        'Saldo disponible: '+credits+' créditos API / 350 requeridos'}</p>
     </section>
     <section className={s.panel}><span className={s.eyebrow}><Play size={15}/> 02 · PRODUCCIÓN</span><h2>Lanzar Escena 02</h2>
      <div className={s.budget}><b>US$3.50 máximo</b><span>7 tomas · 10 segundos · una sola generación por toma</span></div>
      <p>{'Estado: '+(policy?.status==='ready'?'Activa':policy?.status==='paused'?'Pausada':'Esperando proveedor')}</p>
      <button className={s.primary} disabled={busy||refCount!==7} onClick={start}><Play size={16}/> Iniciar las siete tomas</button>
      <button className={s.danger} disabled={busy} onClick={pause}><Pause size={16}/> Pausar nuevos renders</button>
      <p className={s.fine}>Antes de iniciar se verifica el saldo real. La pausa no cancela tareas ya recibidas por Runway.</p>
     </section>
     <section className={s.panel}><span className={s.eyebrow}><Clock3 size={15}/> 03 · AGENTES</span><h2>Seguimiento automático</h2>
      <p>El supervisor de Supabase revisa los trabajos cada minuto y almacena los MP4 privados. El QA aún requiere evidencia real.</p>
      <div className={s.buttons}><button className={s.secondary} disabled={busy} onClick={()=>run(refresh)}>Consultar escena</button>
       <button className={s.secondary} disabled={busy} onClick={logOut}>Cerrar sesión</button></div>
     </section>
    </aside>
   </div>
   <footer className={s.footer}><a href="/v7">← Abrir ViralCine V7</a> · Solo Runway · Sin avatares · Sin terminal</footer>
  </>}
 </main>;
}
