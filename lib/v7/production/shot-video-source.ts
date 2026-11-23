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
   const approved=await readFile(path.join(dir,'artistic-approval.json'),'utf8')
    .catch((e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return null;throw e;});
   const approval=approved?JSON.parse(approved) as {
    filmId?:string;shotId?:string;status?:string;sourceVideoName?:string
   }:null;
   const alreadyApproved=approval?.filmId===filmId&&approval.shotId===label&&
    approval.status==='artistic-approved'&&approval.sourceVideoName===path.basename(option.file);
   const operation=record?JSON.parse(record) as {
    status?:string;candidateName?:string;filmId?:string;shotId?:string
   }:null;
   // Runway may have a recovered, validated MP4 while an earlier UI/ledger
   // version did not populate candidateName. The canonical filename, a real
   // >10 KB MP4, taskId, matching film/shot and review-required are sufficient
   // for human review; never silently approve the shot.
   const recordWithTask=operation as typeof operation & {taskId?:string};
   const matchesCandidate=operation?.candidateName===path.basename(option.file)||
     (option.provider==='runway'&&!operation?.candidateName&&Boolean(recordWithTask?.taskId));
   const completed=operation?.filmId===filmId&&operation.shotId===label&&
    operation.status==='review-required'&&matchesCandidate;
   if(!alreadyApproved&&!completed)continue;
   return {file:option.file,filename:path.basename(option.file),provider:option.provider,
    recordFile:record?option.recordFile:null};
  }catch(e){
   if((e as NodeJS.ErrnoException).code==='ENOENT')continue;throw e;
  }
 }
 return null;
}
