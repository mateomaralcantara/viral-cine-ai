import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { FilmV7 } from '@/lib/v7/domain/film';
import { v7FilmRoot } from '@/lib/v7/storage/film-store';
import { readSceneApprovalBoard } from './scene-approval-board';
import { runFreeRepairLoop } from '@/lib/v7/orchestration/scene-family-engine';
import {E01_FILM_ID,E01_SHOTS} from '@/lib/v7/production/dos-toques-e01-shot-packets';

const run=promisify(execFile);
async function hashFile(file:string){
  const h=createHash('sha256');
  for await(const chunk of createReadStream(file))h.update(chunk as Buffer);
  return h.digest('hex');
}
async function exists(file:string){
  try{return (await stat(file)).isFile();}catch(e){
    if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e;
  }
}
async function mediaInfo(file:string){
  const {stdout}=await run('ffprobe',['-v','error','-show_entries',
    'format=duration:stream=codec_type','-of','json',file],{maxBuffer:1024*1024});
  const data=JSON.parse(stdout) as {format?:{duration?:string};streams?:Array<{codec_type?:string}>};
  const duration=Number(data.format?.duration||0);
  if(!Number.isFinite(duration)||duration<=0||!data.streams?.some(s=>s.codec_type==='video'))
    throw new Error('MP4 inválido en ensamblado de escena.');
  return {duration,hasAudio:data.streams.some(s=>s.codec_type==='audio')};
}
/**
 * Local, zero-provider cinematic scene assembly. Needs ALL source shots approved
 * and SHA-256 unchanged. Writes only a new scene-cut.mp4, never original takes.
 * A lock and temp directory prevent concurrent or partial publication.
 */
export async function assembleApprovedSceneLocally(film:FilmV7,sceneId:string) {
  const board=await readSceneApprovalBoard(film);
  const entry=board.scenes.find(scene=>scene.id===sceneId);
  if(!entry)throw new Error('Escena no encontrada.');
  if(!entry.shots.length||!entry.shots.every(shot=>shot.approved)){
    throw new Error('Todas las tomas de la escena deben estar aprobadas antes del montaje.');
  }
  const scenes=film.acts.flatMap(a=>a.sequences.flatMap(q=>q.scenes));
  const definition=scenes.find(s=>s.id===sceneId)!;
  const root=path.join(v7FilmRoot(film.id),'scenes',entry.label.toLowerCase());
  await mkdir(root,{recursive:true});
  const destination=path.join(root,'scene-cut.mp4');
  if(await exists(destination))return {status:'already-assembled',file:'scene-cut.mp4',sceneId};
  const lock=path.join(root,'.assembly.lock');
  const handle=await open(lock,'wx');
  const stage=path.join(root,'.assembly-'+randomUUID());
  try{
    await mkdir(stage);
    const names:string[]=[];
    for(let i=0;i<entry.shots.length;i++){
      const shot=entry.shots[i];
      const src=path.join(v7FilmRoot(film.id),shot.label.toLowerCase(),shot.label+'-veo-candidato.mp4');
      const approval=JSON.parse(await readFile(path.join(path.dirname(src),'artistic-approval.json'),'utf8')) as {
        sourceVideoSha256:string;status:string;
      };
      if(approval.status!=='artistic-approved'||approval.sourceVideoSha256!==await hashFile(src))
        throw new Error('La toma '+shot.label+' cambió desde su aprobación. Montaje detenido.');
      const meta=await mediaInfo(src);
      const shotDef=definition.shots.find(s=>s.id===shot.id)!;
      const canonicalEditSeconds = film.id===E01_FILM_ID && entry.label==='E01'
        ? E01_SHOTS[i]?.editSeconds : undefined;
      const wanted=Math.min(canonicalEditSeconds ?? shotDef.durationSeconds,meta.duration);
      if(wanted<0.5)throw new Error('Duración de montaje inválida.');
      const output=path.join(stage,'block-'+String(i+1).padStart(3,'0')+'.mp4');
      const args=['-nostdin','-v','error','-y','-i',src];
      if(!meta.hasAudio)args.push('-f','lavfi','-i','anullsrc=r=48000:cl=stereo');
      args.push('-map','0:v:0','-map',meta.hasAudio?'0:a:0':'1:a:0',
        '-vf','scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p',
        '-af','aresample=async=1,apad','-t',wanted.toFixed(3),
        '-c:v','libx264','-preset','veryfast','-crf','22',
        '-c:a','aac','-ar','48000','-ac','2','-movflags','+faststart',output);
      const checks=await runFreeRepairLoop({
        maxFreeAttempts:2,
        inspect:async()=>{
          try{
            const info=await mediaInfo(output);
            const size=(await stat(output)).size;
            return {passed:size>10000&&info.duration>=wanted-0.25,
              failure:'local-transient' as const};
          }catch{return {passed:false,failure:'local-transient' as const};}
        },
        repair:async()=>{
          await rm(output,{force:true});
          try{await run('ffmpeg',args,{maxBuffer:2*1024*1024,timeout:180000});}
          catch{/* local retry is allowed, verification decides success */ }
        }
      });
      if(checks.status!=='passed')throw new Error('Autocorrección local agotada: '+shot.label);
      names.push(output);
    }
    const list=path.join(stage,'concat.txt');
    await writeFile(list,names.map(p=>"file '"+p.replace(/\\/g,'/').replace(/'/g,"'\\''")+"'").join('\n')+'\n','utf8');
    const candidate=path.join(stage,'complete.mp4');
    await run('ffmpeg',['-nostdin','-v','error','-y','-f','concat','-safe','0','-i',list,
      '-c','copy','-movflags','+faststart',candidate],{maxBuffer:2*1024*1024,timeout:180000});
    const qa=await mediaInfo(candidate);
    if(qa.duration<=0.5)throw new Error('El montaje no superó validación técnica.');
    // Exclusive creation avoids replacing someone else's assembled cut.
    const {link}=await import('node:fs/promises');
    await link(candidate,destination);
    return {status:'assembled',file:'scene-cut.mp4',sceneId,durationSeconds:qa.duration,
      additionalSpendUsd:0,providerCalls:0};
  }finally{
    await rm(stage,{recursive:true,force:true}).catch(()=>undefined);
    await handle.close();await rm(lock,{force:true}).catch(()=>undefined);
  }
}
