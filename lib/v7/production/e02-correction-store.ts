import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {v7FilmRoot} from '@/lib/v7/storage/film-store';
import {E02_FILM_ID,e02Shot} from '@/lib/v7/production/dos-toques-e02-shot-packets';

export type E02CorrectionRevision={
 schemaVersion:1;shotId:string;revisionId:string;promptText:string;promptHash:string;
 referenceSha256:string;createdAt:string;estimatedUsd:0.5;
};
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function root(id:string){
 if(!e02Shot(id))throw Error('Toma no autorizada para corrección.');
 return path.join(v7FilmRoot(E02_FILM_ID),id.toLowerCase(),'corrections');
}
export function correctionAttemptsDir(id:string){return path.join(root(id),'attempts');}
function revisionDir(id:string){return path.join(root(id),'revisions');}
function validRevisionId(id:string){
 if(!/^v\d{17}-[0-9a-f-]{36}$/.test(id))throw Error('Versión inválida.');
 return id;
}
export async function readCorrectionRevision(id:string,revisionId:string):Promise<E02CorrectionRevision>{
 const file=path.join(revisionDir(id),validRevisionId(revisionId)+'.json');
 const result=JSON.parse(await readFile(file,'utf8')) as E02CorrectionRevision;
 if(result.schemaVersion!==1||result.shotId!==id||result.revisionId!==revisionId||
  result.promptHash!==hash(result.promptText)||!/^[a-f0-9]{64}$/.test(result.referenceSha256)||
  result.estimatedUsd!==0.5)throw Error('Versión de corrección dañada.');
 return result;
}
export async function latestCorrectionRevision(id:string):Promise<E02CorrectionRevision|null>{
 try{
  const pointer=JSON.parse(await readFile(path.join(revisionDir(id),'latest.json'),'utf8')) as {revisionId:string};
  return readCorrectionRevision(id,pointer.revisionId);
 }catch(e){
  if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
 }
 // Compatibility with revisions written before the latest pointer existed.
 try{
  const names=(await readdir(revisionDir(id))).filter(s=>/^v\d{17}-[0-9a-f-]{36}\.json$/.test(s)).sort();
  return names.length?readCorrectionRevision(id,names[names.length-1].slice(0,-5)):null;
 }catch(e){
  if((e as NodeJS.ErrnoException).code==='ENOENT')return null;
  throw e;
 }
}
export async function createCorrectionRevision(id:string,promptText:string,referenceSha256:string){
 if(!e02Shot(id))throw Error('Toma inválida.');
 const prompt=promptText.trim();
 if(prompt.length<60||prompt.length>3500)throw Error('El prompt debe tener entre 60 y 3500 caracteres.');
 if(!/^[a-f0-9]{64}$/.test(referenceSha256))throw Error('Referencia sin hash verificado.');
 const now=new Date().toISOString();
 const revisionId='v'+now.replace(/\D/g,'').padEnd(17,'0').slice(0,17)+'-'+randomUUID();
 const revision:E02CorrectionRevision={schemaVersion:1,shotId:id,revisionId,
  promptText:prompt,promptHash:hash(prompt),referenceSha256,
  estimatedUsd:0.5,createdAt:now};
 await mkdir(revisionDir(id),{recursive:true});
 await writeFile(path.join(revisionDir(id),revisionId+'.json'),
  JSON.stringify(revision,null,2)+'\n',{flag:'wx',mode:0o600});
 const pointer=path.join(revisionDir(id),'latest.json');
 const temp=pointer+'.'+randomUUID()+'.tmp';
 await writeFile(temp,JSON.stringify({revisionId})+'\n',{flag:'wx',mode:0o600});
 await rename(temp,pointer);
 return revision;
}
export async function usedCorrectionRevision(id:string,revisionId:string){
 const file=path.join(correctionAttemptsDir(id),validRevisionId(revisionId)+'.authorization.json');
 try{await readFile(file);return true;}
 catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e;}
}
