import {readFile,stat,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const FILM='film-dos-toques-de-bocina-v7';
const DATA=process.env.VIRALCINE_DATA_DIR;
const REPO=process.cwd();
const mode=process.argv[2];

if(!['--check','--run'].includes(mode))throw Error('Modo incorrecto');
if(!DATA)throw Error('Falta directorio de datos');

process.env.NODE_ENV='development';

const nextEnv=await import('@next/env');
const loader=nextEnv.loadEnvConfig??nextEnv.default?.loadEnvConfig;
loader(REPO,true);

for(const folder of [
 REPO,
 path.resolve(REPO,'../viral-cine-v7-integration'),
 path.resolve(REPO,'../viral-cine-ai')
]){
 for(const name of ['.env.local','.env']){
  let lines;
  try{
   lines=(await readFile(path.join(folder,name),'utf8')).split(/\r?\n/);
  }catch{continue;}

  for(const line of lines){
   const m=line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
   if(m&&!process.env[m[1]])
    process.env[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'');
  }
 }
}

process.env.VIRALCINE_DATA_DIR=DATA;
process.env.V7_RUNWAY_E02_ENABLED='true';

const store=await import('../lib/v7/storage/film-store.ts');
const eng=await import('../lib/v7/production/runway-e02-engine.ts');
const refs=await import('../lib/v7/production/e02-supabase-references.ts');

const film=await store.readV7FilmBundle(FILM);

if(film.film.id!==FILM)
 throw Error('El bundle no coincide con la pelicula original');

const photos=await refs.approvedE02References();

if(!photos.referencesReady||photos.approvedCount!==7)
 throw Error('Supabase no confirma 7/7 fotografias aprobadas');

for(const cmd of ['ffmpeg','ffprobe']){
 try{
  execFileSync(cmd,['-version'],{stdio:'ignore'});
 }catch{
  throw Error('Falta '+cmd+' en Windows. Sin cargos.');
 }
}

const specs=eng.runwayShotSpecs();

if(specs.length!==7)
 throw Error('El guion no contiene las siete tomas esperadas');

for(const s of specs)
 await eng.runwayPreflight(s.id);

const records=await Promise.all(
 specs.map(s=>eng.readRunwayRecord(s.id))
);

const videoExists=await Promise.all(specs.map(async s=>{
 try{
  return (await stat(eng.runwayCandidatePath(s.id))).size>10000;
 }catch{return false;}
}));

function knownCreditRejection(r){
 return Boolean(
  r&&!r.taskId&&
  ['blocked-credits','failed-unknown'].includes(r.status)&&
  /(?:Runway\s+API\s*(?:400|402)|HTTP\s*(?:400|402))/i.test(r.error||'')&&
  /(?:not enough credits|do not have enough credits|insufficient credits|insufficient balance|out of credits|credit balance too low)/i.test(r.error||'')
 );
}

const pending=[];
let problem='';

for(let i=0;i<7;i++){
 const id=specs[i].id;
 const r=records[i];

 if(r?.status==='review-required'){
  if(!videoExists[i])
   problem=id+': aparece terminado pero falta MP4';
  continue;
 }

 if(r?.taskId)continue;

 if(!r){
  pending.push(id);
  continue;
 }

 if(id==='E02-P01'&&knownCreditRejection(r)&&!videoExists[i]){
  pending.push(id);
  continue;
 }

 problem=id+': operacion incierta sin identificador';
}

console.log('\n=== ESTADO DE LAS SIETE TOMAS ===');

for(let i=0;i<7;i++){
 console.log(
  specs[i].id+' | '+
  (records[i]?.status||'not-started')+
  ' | MP4: '+(videoExists[i]?'SI':'NO')+
  ' | tarea conocida: '+(records[i]?.taskId?'SI':'NO')
 );
}

if(problem)
 throw Error(problem+'. No se iniciaron nuevos renders.');

const reserved=await eng.runwayReservedUsd();
const previous=records[0];

const committed=reserved-(
 knownCreditRejection(previous)&&
 previous.status!=='blocked-credits'?0.5:0
);

if(committed+pending.length*0.5>3.5001)
 throw Error('Superaria el presupuesto maximo de USD 3.50');

const key=process.env.RUNWAYML_API_SECRET?.trim();

if(!key)
 throw Error('RUNWAYML_API_SECRET no disponible');

if(pending.length){
 const res=await fetch(
  'https://api.dev.runwayml.com/v1/organization',
  {
   headers:{
    Authorization:'Bearer '+key,
    'X-Runway-Version':'2024-11-06'
   },
   signal:AbortSignal.timeout(25000)
  }
 );

 if(!res.ok)
  throw Error('No se pudo comprobar saldo Runway. HTTP '+res.status);

 const org=await res.json();
 const needed=pending.length*50;

 console.log('Creditos API disponibles: '+org.creditBalance);
 console.log('Creditos necesarios para nuevas tomas: '+needed);

 if(!Number.isFinite(org.creditBalance)||org.creditBalance<needed)
  throw Error('Saldo API insuficiente. Sin nuevos cargos.');
}

console.log(
 'COSTO MAXIMO ADICIONAL: USD '+(pending.length*0.5).toFixed(2)
);

if(mode==='--check'){
 console.log('VERIFICACION COMPLETA. CERO RENDERS NUEVOS.');
 process.exit(0);
}

// Recuperar una P01 rechazada de manera definitiva.
// La operacion vieja queda preservada como auditoria.
if(knownCreditRejection(records[0])&&!records[0].taskId){
 const original=eng.runwayRecordPath('E02-P01');
 const audit=original+'.credito-rechazado-'+Date.now()+'.audit.json';

 await rename(original,audit);
 console.log('P01: rechazo antiguo archivado, sin borrar evidencia.');
}

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

for(const shot of specs){
 let record=await eng.readRunwayRecord(shot.id);

 if(record?.status==='review-required'){
  console.log(shot.id+': video existente reutilizado');
  continue;
 }

 if(!record){
  console.log(shot.id+': enviando primera generacion a Runway');

  await eng.submitRunwayShot(
   shot.id,
   shot.promptHash,
   0.5
  );

  record=await eng.readRunwayRecord(shot.id);
 }

 if(!record?.taskId)
  throw Error(shot.id+': sin taskId. Prohibido repetir el envio.');

 let ready=false;

 for(let i=0;i<55;i++){
  const state=await eng.resumeRunwayShot(shot.id);

  if(state.videoReady){
   ready=true;
   break;
  }

  if(state.status==='failed-unknown'||
     state.status==='blocked-credits')
   throw Error(shot.id+': fallo. No se realizara otro envio.');

  if(i%5===0)
   console.log(shot.id+': procesando, consulta '+(i+1));

  await wait(16000);
 }

 if(!ready)
  throw Error(shot.id+': tarea pendiente. Reanudar sin reenviar.');

 console.log(shot.id+': MP4 recuperado y verificado');
}

const paths=specs.map(s=>eng.runwayCandidatePath(s.id));

for(const file of paths){
 if((await stat(file)).size<=10000)
  throw Error('Falta video: '+file);
}

const destination=path.join(
 store.v7FilmRoot(FILM),
 'scenes','e02','E02-CORTE-VISUAL-55S.mp4'
);

await mkdir(path.dirname(destination),{recursive:true});

const seconds=[8,8,8,8,8,8,7];

const filters=seconds.map(
 (d,i)=>`[${i}:v]trim=duration=${d},setpts=PTS-STARTPTS,fps=24,scale=1280:720:flags=lanczos,setsar=1,format=yuv420p[v${i}]`
);

filters.push(
 seconds.map((_,i)=>`[v${i}]`).join('')+
 'concat=n=7:v=1:a=0[out]'
);

const args=[
 '-y','-hide_banner','-loglevel','error',
 ...paths.flatMap(p=>['-i',p]),
 '-filter_complex',filters.join(';'),
 '-map','[out]','-an',
 '-c:v','libx264','-crf','21','-preset','medium',
 '-movflags','+faststart',
 destination
];

console.log('Ensamblando corte cinematografico visual...');

execFileSync('ffmpeg',args,{
 stdio:'inherit',
 timeout:360000
});

const probe=execFileSync('ffprobe',[
 '-v','error',
 '-show_entries','format=duration',
 '-of','default=noprint_wrappers=1:nokey=1',
 destination
],{encoding:'utf8'});

const duration=Number(probe.trim());

if(Math.abs(duration-55)>1)
 throw Error('Duracion inesperada del corte: '+duration);

console.log('\nESCENA 02 - CORTE VISUAL TERMINADO');
console.log('Duracion: '+duration+' segundos');
console.log('ARCHIVO: '+destination);
console.log('Audio, voces y musica aun pendientes.');