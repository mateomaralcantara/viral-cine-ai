import path from 'node:path';
import {stat,readFile} from 'node:fs/promises';
import {v7FilmRoot} from '@/lib/v7/storage/film-store';

/** Resolve an existing generated MP4, preferring Runway, without altering any Veo asset. */
export async function resolveV7ShotVideo(filmId:string,label:string):Promise<{
 file:string;filename:string;provider:'runway'|'veo';recordFile:string|null}|null>{
 if(!/^E\d{2}-P\d{2}$/.test(label))throw new Error('Etiqueta de toma invalida.');
 const dir=path.join(v7FilmRoot(filmId),label.toLowerCase());
 const options=[
  {file:path.join(dir,label+'-runway-gen4-turbo.mp4'),provider:'runway' as const,
   recordFile:path.join(dir,'runway-gen4-turbo-operation.json')},
  {file:path.join(dir,label+'-veo-candidato.mp4'),provider:'veo' as const,
   recordFile:path.join(dir,'provider-operation-attempt-02.json')},
  {file:path.join(dir,label+'-veo-candidato.mp4'),provider:'veo' as const,
   recordFile:path.join(dir,'provider-operation.json')}
 ];
 for(const option of options){
  try{
   const info=await stat(option.file);
   if(!info.isFile()||info.size<=10000)continue;
   const record=await readFile(option.recordFile,'utf8').catch((e:NodeJS.ErrnoException)=>{
    if(e.code==='ENOENT')return null;throw e;
   });
   if(!record)continue;
   const operation=JSON.parse(record) as {status?:string;candidateName?:string;filmId?:string;shotId?:string};
   if(operation.filmId!==filmId||operation.shotId!==label||
      operation.status!=='review-required'||operation.candidateName!==path.basename(option.file))continue;
   return {file:option.file,filename:path.basename(option.file),provider:option.provider,
    recordFile:option.recordFile};
  }catch(e){
   if((e as NodeJS.ErrnoException).code==='ENOENT')continue;throw e;
  }
 }
 return null;
}
