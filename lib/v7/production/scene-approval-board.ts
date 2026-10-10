import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { FilmV7 } from '@/lib/v7/domain/film';
import { v7FilmRoot } from '@/lib/v7/storage/film-store';
import {resolveV7ShotVideo} from '@/lib/v7/production/shot-video-source';

const probe = promisify(execFile);
const safeMissing = async (name: string) => {
  try { return await readFile(name, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
};
export type BoardShot = { id:string; label:string; title:string; approved:boolean; readyForApproval:boolean;
  hasVideo:boolean; reason:string; videoSeconds?:number };
export type BoardScene = { id:string; label:string; title:string; approved:boolean;
  readyForApproval:boolean; readyForAssembly:boolean; assembled:boolean; reason:string; shots:BoardShot[] };
type SceneLocation = { scene: FilmV7['acts'][number]['sequences'][number]['scenes'][number];
  label:string; shots: Array<{ shot: FilmV7['acts'][number]['sequences'][number]['scenes'][number]['shots'][number]; label:string }> };

function indexedScenes(film: FilmV7): SceneLocation[] {
  const all = film.acts.flatMap(act => act.sequences.flatMap(sequence => sequence.scenes));
  // Production order is film chronological order, not local sequence order.
  return all.slice().sort((a,b) => a.timeIndex - b.timeIndex).map((scene,i) => {
    const label = 'E' + String(i+1).padStart(2,'0');
    return { scene, label, shots:scene.shots.slice().sort((a,b) => a.order-b.order)
      .map((shot,j) => ({shot, label:label+'-P'+String(j+1).padStart(2,'0')})) };
  });
}
function shotRoot(filmId:string,label:string) {
  return path.join(v7FilmRoot(filmId),label.toLowerCase());
}
function sceneRoot(filmId:string,label:string) {
  return path.join(v7FilmRoot(filmId),'scenes',label.toLowerCase());
}
async function fileExists(file:string) {
  try { const s=await stat(file); return s.isFile() && s.size > 10000; }
  catch(e) { if ((e as NodeJS.ErrnoException).code==='ENOENT') return false; throw e; }
}
function candidateName(label:string){return label+'-veo-candidato.mp4';}
async function sha256(file:string){
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(file))hash.update(chunk as Buffer);
  return hash.digest('hex');
}
async function shotSnapshot(filmId:string,shotId:string,label:string,title:string):Promise<BoardShot> {
  const dir=shotRoot(filmId,label);
  const chosen=await resolveV7ShotVideo(filmId,label);
  const approvalRaw=await safeMissing(path.join(dir,'artistic-approval.json'));
  const recordRaw=chosen?.recordFile?await safeMissing(chosen.recordFile):null;
  const hasVideo=Boolean(chosen);
  const record=recordRaw ? JSON.parse(recordRaw) as {filmId?:string;shotId?:string;status?:string;candidateName?:string;providerOperationName?:string;taskId?:string} : null;
  const approval=approvalRaw ? JSON.parse(approvalRaw) as {filmId?:string;shotId?:string;status?:string;sourceVideoName?:string;sourceVideoSha256?:string;videoSeconds?:number} : null;
  const approved=hasVideo && Boolean(approval && approval.filmId===filmId && approval.shotId===label &&
    approval.status==='artistic-approved' && approval.sourceVideoName===chosen?.filename &&
    /^[a-f0-9]{64}$/.test(approval.sourceVideoSha256 ?? ''));
  const readyForApproval=!approved && hasVideo && Boolean(record && record.filmId===filmId &&
    record.shotId===label && record.status==='review-required' &&
    record.candidateName===chosen?.filename && (record.providerOperationName||record.taskId));
  return {id:shotId,label,title,approved,readyForApproval,hasVideo,
    reason:approved?'Aprobada artísticamente':readyForApproval?'MP4 disponible; aprobar al revisar':
      hasVideo?'MP4 requiere reconciliación del registro':'Falta producir/importar MP4',
    ...(approved&&approval?.videoSeconds?{videoSeconds:approval.videoSeconds}:{})};
}
export async function readSceneApprovalBoard(film:FilmV7) {
  const locations=indexedScenes(film);
  const scenes=await Promise.all(locations.map(async location=>{
    const shots=await Promise.all(location.shots.map(s=>shotSnapshot(film.id,s.shot.id,s.label,s.shot.title)));
    const sceneVideo=path.join(sceneRoot(film.id,location.label),'scene-cut.mp4');
    const assembled=await fileExists(sceneVideo);
    const raw=await safeMissing(path.join(sceneRoot(film.id,location.label),'scene-approval.json'));
    const approval=raw?JSON.parse(raw) as {filmId?:string;sceneId?:string;status?:string;sourceVideoSha256?:string}:null;
    const approved=assembled&&Boolean(approval&&approval.filmId===film.id&&
      approval.sceneId===location.scene.id&&approval.status==='artistic-approved'&&
      /^[a-f0-9]{64}$/.test(approval.sourceVideoSha256??''));
    const readyForAssembly=!assembled&&shots.length>0&&shots.every(s=>s.approved);
    const readyForApproval=!approved&&shots.length>0&&shots.every(s=>s.approved)&&assembled;
    return {id:location.scene.id,label:location.label,title:location.scene.title,approved,
      readyForApproval,readyForAssembly,assembled,shots,reason:approved?'Escena aprobada':readyForApproval?'Corte listo para revisión':
        !shots.every(s=>s.approved)?'Esperando aprobación de todas las tomas':'Falta montaje MP4 de escena'} satisfies BoardScene;
  }));
  return {filmId:film.id,scenes,sceneCount:scenes.length,
    shotCount:scenes.reduce((sum,s)=>sum+s.shots.length,0),
    approvedShotCount:scenes.reduce((sum,s)=>sum+s.shots.filter(x=>x.approved).length,0),
    approvedSceneCount:scenes.filter(s=>s.approved).length,
    externalApiCalls:0,additionalSpendUsd:0};
}
export async function approveBoardTarget(film:FilmV7,input:{
  targetType:'shot'|'scene';targetId:string;checks:{identityWardrobe:'pass';voiceSound:'pass';motionContinuity:'pass'};
  notes:string;
}) {
  if(Object.values(input.checks).some(x=>x!=='pass'))throw new Error('Debes aprobar las tres comprobaciones artísticas.');
  const location=indexedScenes(film).find(x=>x.scene.id===input.targetId||x.shots.some(y=>y.shot.id===input.targetId));
  if(!location)throw new Error('Objetivo no encontrado en el guion de la película.');
  const board=await readSceneApprovalBoard(film);
  const scene=board.scenes.find(x=>x.id===location.scene.id)!;
  const shot=scene.shots.find(s=>s.id===input.targetId);
  const isShot=input.targetType==='shot';
  if(isShot&&!shot)throw new Error('La toma no existe en el guion.');
  if(!isShot&&scene.id!==input.targetId)throw new Error('La escena no coincide.');
  const ready=isShot?shot!.readyForApproval:scene.readyForApproval;
  if(!ready) {
    if(isShot&&shot!.approved || !isShot&&scene.approved) return {alreadyApproved:true};
    throw new Error(isShot?shot!.reason:scene.reason);
  }
  const dir=isShot?shotRoot(film.id,shot!.label):sceneRoot(film.id,location.label);
  const chosen=isShot?await resolveV7ShotVideo(film.id,shot!.label):null;
  if(isShot&&!chosen)throw new Error('El MP4 de esta toma no está disponible.');
  const file=isShot?chosen!.file:path.join(dir,'scene-cut.mp4');
  const {stdout}=await probe('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',file],{maxBuffer:1024*1024});
  const metadata=JSON.parse(stdout) as {format?:{duration?:string};streams?:Array<{codec_type?:string}>};
  const seconds=Number(metadata.format?.duration||0);
  if(!Number.isFinite(seconds)||seconds<=0||!metadata.streams?.some(x=>x.codec_type==='video'))throw new Error('MP4 no supera comprobación técnica.');
  if(isShot&&(seconds<7.7||seconds>10.5))throw new Error('Duración de la toma fuera del perfil de ocho a diez segundos.');
  const statInfo=await stat(file);
  const fingerprint=await sha256(file);
  // Bind approval to exactly the candidate that passed QA; preserve source.
  const approval=isShot?{
    schemaVersion:1,filmId:film.id,shotId:shot!.label,status:'artistic-approved',
    approvedAt:new Date().toISOString(),sourceVideoName:chosen!.filename,
    sourceVideoSha256:fingerprint,videoSeconds:seconds,videoBytes:statInfo.size,
    providerOperationName:(()=>{
      // The vendor-neutral field stores the original provider task identifier.
      return undefined;
    })(),
    provider:chosen!.provider,
    productionNotes:input.notes,artisticChecks:input.checks,
    technicalQaStatus:'pending',continuityQaStatus:'pending',editingStatus:'pending',externalApiCalls:0,additionalSpendUsd:0
  }:{
    schemaVersion:1,filmId:film.id,sceneId:scene.id,status:'artistic-approved',
    approvedAt:new Date().toISOString(),sourceVideoName:'scene-cut.mp4',
    sourceVideoSha256:fingerprint,videoSeconds:seconds,videoBytes:statInfo.size,
    productionNotes:input.notes,artisticChecks:input.checks,
    technicalQaStatus:'pending',continuityQaStatus:'pending',editingStatus:'pending',externalApiCalls:0,additionalSpendUsd:0
  };
  const destination=path.join(dir,isShot?'artistic-approval.json':'scene-approval.json');
  const handle=await open(destination,'wx',0o600);
  try {await handle.writeFile(JSON.stringify(approval,null,2)+'\n','utf8');}
  finally {await handle.close();}
  return {alreadyApproved:false,approval};
}
