#!/usr/bin/env node
// E02 cloud bootstrap: upload exactly seven existing JPEGs to a PRIVATE
// Supabase bucket and auto-approve each one. No Next server, no browser,
// no Runway requests, no paid video generation, no local file writes.
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';

const projectId='wrxeerltoapvybhaxlmu';
const filmId='film-dos-toques-de-bocina-v7';
const bucket='viralcine-scene-references';
const shots=Array.from({length:7},(_,i)=>'E02-P0'+(i+1));
const sha=(data)=>createHash('sha256').update(data).digest('hex');
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
function jpegDimensions(bytes){
 if(bytes.length<8||bytes[0]!==0xff||bytes[1]!==0xd8)
  throw Error('not a JPEG');
 let i=2;
 while(i+8<bytes.length){
  if(bytes[i]!==0xff){i++;continue;}
  while(i<bytes.length&&bytes[i]===0xff)i++;
  const mark=bytes[i++];
  if(mark===0xd8||mark===0xd9||mark===0x01||(mark>=0xd0&&mark<=0xd7))continue;
  if(mark===0xda)break;
  if(i+2>bytes.length)break;
  const segmentLength=bytes.readUInt16BE(i);
  if(segmentLength<2||i+segmentLength>bytes.length)break;
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(mark)){
   if(segmentLength<7)break;
   return {width:bytes.readUInt16BE(i+5),height:bytes.readUInt16BE(i+3)};
  }
  i+=segmentLength;
 }
 throw Error('JPEG header does not contain valid dimensions');
}
function parseEnv(text){
 const out={};
 for(const raw of text.split(/\r?\n/)){
  const m=raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if(!m)continue;
  let value=m[2].trim();
  if((value.startsWith('"')&&value.endsWith('"'))||
     (value.startsWith("'")&&value.endsWith("'")))
   value=value.slice(1,-1);
  else value=value.replace(/\s+#.*$/,'');
  out[m[1]]=value;
 }
 return out;
}
async function exists(file){
 try{return (await stat(file)).isFile();}
 catch(e){if(e.code==='ENOENT')return false;throw e;}
}
async function loadConfig(){
 const roots=[
  process.cwd(),
  path.join(os.homedir(),'Desktop','VSC','BestS','viral-cine-v7-cinema-core'),
  path.join(os.homedir(),'Desktop','VSC','BestS','viral-cine-v7-integration'),
  path.join(os.homedir(),'Desktop','VSC','BestS','viral-cine-ai'),
  'C:\\Users\\martin\\Desktop\\VSC\\BestS\\viral-cine-v7-cinema-core',
  'C:\\Users\\martin\\Desktop\\VSC\\BestS\\viral-cine-v7-integration',
  'C:\\Users\\martin\\Desktop\\VSC\\BestS\\viral-cine-ai'
 ];
 const merged={};
 for(const folder of [...new Set(roots)]){
  for(const name of ['.env','.env.local']){
   const file=path.join(folder,name);
   if(await exists(file))Object.assign(merged,parseEnv(await readFile(file,'utf8')));
  }
 }
 Object.assign(merged,process.env);
 const privilegedNames=[
  'SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE','V7_SUPABASE_SERVICE_ROLE_KEY'
 ];
 const secret=privilegedNames.map(n=>merged[n]?.trim()).find(Boolean);
 if(!secret||secret.startsWith('sb_anon_'))
  throw Error('Falta una clave PRIVILEGIADA de Supabase en .env.local (SUPABASE_SERVICE_ROLE_KEY o SUPABASE_SECRET_KEY). No se necesita ninguna clave de Runway.');
 const url=(merged.SUPABASE_URL||merged.NEXT_PUBLIC_SUPABASE_URL||
  'https://'+projectId+'.supabase.co').trim().replace(/\/$/,'');
 if(url!=='https://'+projectId+'.supabase.co')
  throw Error('Supabase apunta a otro proyecto. No se enviara ninguna fotografia.');
 return {url,secret};
}
async function selectDataRoot(){
 const bases=[
  process.env.V8_E02_DATA_ROOT,process.env.VIRALCINE_DATA_DIR,
  path.join(os.homedir(),'Desktop','VSC','BestS','viral-cine-v7-integration','.data'),
  'C:\\Users\\martin\\Desktop\\VSC\\BestS\\viral-cine-v7-integration\\.data'
 ].filter(Boolean);
 for(const root of [...new Set(bases)]){
  const files=shots.map(id=>path.join(root,'v7','films',filmId,id.toLowerCase(),
   id+'-image-reference.jpg'));
  const flags=await Promise.all(files.map(exists));
  if(flags.every(Boolean))return {root,files};
 }
 throw Error('No se encontraron las siete fotografias E02 originales. No se modifico ningun archivo.');
}
function createClient({url,secret}){
 const headers={
  apikey:secret,
  ...(secret.startsWith('eyJ')?{Authorization:'Bearer '+secret}:{})
 };
 return async (api,method,body,otherHeaders={})=>{
  let last;
  for(let retry=0;retry<3;retry++){
   try{
    const response=await fetch(url+api,{
     method,headers:{...headers,...otherHeaders},
     ...(body?{body}:{ }),
     signal:AbortSignal.timeout(30000),
     cache:'no-store'
    });
    if((response.status===429||response.status>=500)&&retry<2){
     await sleep(500*(retry+1));continue;
    }
    return response;
   }catch(error){
    last=error;
    if(retry<2)await sleep(500*(retry+1));
   }
  }
  throw Error('No hay conexion con Supabase: '+String(last?.message||'error'));
 };
}
async function uploadPhoto(client,id,bytes,filename){
 if(bytes.length<3000||bytes.length>4000000)
  throw Error('tamano fuera de 3 KB a 4 MB');
 const dims=jpegDimensions(bytes);
 if(dims.width!==1280||dims.height!==720)
  throw Error('referencia JPG no es 1280 x 720 (se conserva original, no se altera)');
 const hash=sha(bytes);
 const objectName=filmId+'/e02/'+id.toLowerCase()+'/'+hash+'.jpg';
 const encoded=objectName.split('/').map(encodeURIComponent).join('/');
 const endpoint='/storage/v1/object/authenticated/'+bucket+'/'+encoded;
 let object=await client(endpoint,'GET');
 if(object.status===404){
  const write=await client('/storage/v1/object/'+bucket+'/'+encoded,
   'POST',bytes,{'Content-Type':'image/jpeg','x-upsert':'false'});
  if(!write.ok&&write.status!==409)
   throw Error('Storage HTTP '+write.status+': '+(await write.text()).slice(0,160));
  object=await client(endpoint,'GET');
 }
 if(!object.ok)throw Error('El archivo no se pudo leer en Storage (HTTP '+object.status+')');
 const remote=Buffer.from(await object.arrayBuffer());
 if(sha(remote)!==hash)throw Error('Hash SHA256 diferente: se detuvo la aprobacion');
 const req={
  p_film_id:filmId,p_scene_id:'E02',p_shot_id:id,
  p_bucket:bucket,p_path:objectName,p_filename:filename,
  p_mime:'image/jpeg',p_bytes:bytes.length,p_sha256:hash,
  p_width:1280,p_height:720
 };
 const approve=await client('/rest/v1/rpc/v8_save_approved_e02_reference',
  'POST',Buffer.from(JSON.stringify(req)),{'Content-Type':'application/json'});
 if(!approve.ok)
  throw Error('RPC aprobacion HTTP '+approve.status+': '+(await approve.text()).slice(0,150));
 const result=await approve.json();
 if(!result.approved||!result.readyForScene||result.sha256!==hash)
  throw Error('Supabase no confirmo aprobacion y persistencia');
 return result;
}
async function checkFinal(client){
 const params=new URLSearchParams({
  select:'shot_id,sha256,approved,active,status',
  film_id:'eq.'+filmId,scene_id:'eq.E02',active:'eq.true'});
 const r=await client('/rest/v1/scene_reference_images?'+params,'GET');
 if(!r.ok)throw Error('No se pudo verificar el resultado en Supabase (HTTP '+r.status+')');
 const records=await r.json();
 const unique=new Set(records.filter(x=>shots.includes(x.shot_id)&&x.approved&&
  x.active&&x.status==='ready').map(x=>x.shot_id));
 return unique.size;
}
export {jpegDimensions,parseEnv,selectDataRoot};
async function main(){
 console.log('VIRALCINE E02 - SINCRONIZACION PERSISTENTE SUPABASE');
 console.log('Solo 7 fotografias. Runway NO. Avatares NO. Cargos USD 0.');
 const [config,data]=await Promise.all([loadConfig(),selectDataRoot()]);
 const client=createClient(config);
 let failures=0;
 for(let i=0;i<shots.length;i++){
  const id=shots[i];
  try{
   const b=await readFile(data.files[i]);
   const result=await uploadPhoto(client,id,b,path.basename(data.files[i]));
   console.log(id+': GUARDADA + APROBADA + LISTA  '+result.sha256.slice(0,10));
  }catch(error){
   failures++;
   console.error(id+': ERROR '+String(error?.message||error));
  }
 }
 const confirmed=await checkFinal(client);
 console.log('REFERENCIAS APROBADAS EN SUPABASE: '+confirmed+' / 7');
 if(failures===0&&confirmed===7){
  console.log('ESCENA 02: FOTOGRAFIAS PERSISTIDAS Y LISTAS');
  console.log('No se modificaron archivos locales ni se consumieron creditos.');
 }else{
  console.error('PROCESO INCOMPLETO: conserva los originales; puedes reintentar sin duplicar.');
  process.exitCode=1;
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')))
 void main().catch(e=>{console.error('ERROR: '+String(e?.message||e));process.exitCode=1;});
