import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createDosToquesBundle} from '../lib/v7/presets/dos-toques-de-bocina';
import {readSceneApprovalBoard} from '../lib/v7/production/scene-approval-board';
import {resolveV7ShotVideo} from '../lib/v7/production/shot-video-source';

test('All five completed Runway clips unlock individual approval buttons, including migrated records', async()=>{
 const previous=process.env.VIRALCINE_DATA_DIR;
 const root=await mkdtemp(path.join(tmpdir(),'v7-runway-review-ready-'));
 process.env.VIRALCINE_DATA_DIR=root;
 try{
  const film=createDosToquesBundle().film;
  const filmRoot=path.join(root,'v7','films',film.id);
  for(let i=1;i<=7;i++){
   const label='E01-P'+String(i).padStart(2,'0');
   const dir=path.join(filmRoot,label.toLowerCase());
   await mkdir(dir,{recursive:true});
   const runway=i>=3;
   const filename=label+(runway?'-runway-gen4-turbo.mp4':'-veo-candidato.mp4');
   await writeFile(path.join(dir,filename),Buffer.alloc(16000,i));
   if(runway) {
    const record={
     filmId:film.id,shotId:label,provider:'runway',
     status:'review-required',taskId:'task-test-'+label,
     ...(i%2===0?{candidateName:filename}:{})
    };
    await writeFile(path.join(dir,'runway-gen4-turbo-operation.json'),JSON.stringify(record));
   }else{
    await writeFile(path.join(dir,'artistic-approval.json'),JSON.stringify({
     filmId:film.id,shotId:label,status:'artistic-approved',
     sourceVideoName:filename,sourceVideoSha256:'a'.repeat(64),videoSeconds:8
    }));
   }
  }
  const board=await readSceneApprovalBoard(film);
  const first=board.scenes[0];
  assert.equal(first.shots.length,7);
  assert.equal(board.approvedShotCount,2);
  assert.ok(first.shots.slice(0,2).every(x=>x.approved));
  assert.ok(first.shots.slice(2).every(x=>x.hasVideo&&x.readyForApproval&&!x.approved),
    JSON.stringify(first.shots.slice(2)));
  assert.ok(first.shots.slice(2).every(x=>x.reason==='MP4 disponible; aprobar al revisar'));
  const source=await resolveV7ShotVideo(film.id,'E01-P03');
  assert.equal(source?.provider,'runway');
  assert.equal(source?.filename,'E01-P03-runway-gen4-turbo.mp4');
 }finally{
  if(previous===undefined)delete process.env.VIRALCINE_DATA_DIR;
  else process.env.VIRALCINE_DATA_DIR=previous;
  await rm(root,{recursive:true,force:true});
 }
});
test('Unsubmitted or non-final Runway tasks never become approvable just because a file exists', async()=>{
 const previous=process.env.VIRALCINE_DATA_DIR;
 const root=await mkdtemp(path.join(tmpdir(),'v7-runway-review-gate-'));
 process.env.VIRALCINE_DATA_DIR=root;
 try{
  const film=createDosToquesBundle().film;
  const dir=path.join(root,'v7','films',film.id,'e01-p03');
  await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,'E01-P03-runway-gen4-turbo.mp4'),Buffer.alloc(15000,9));
  await writeFile(path.join(dir,'runway-gen4-turbo-operation.json'),JSON.stringify({
   filmId:film.id,shotId:'E01-P03',status:'processing',taskId:'task-test-pending'
  }));
  const board=await readSceneApprovalBoard(film);
  assert.equal(board.scenes[0].shots[2].readyForApproval,false);
  assert.equal(board.scenes[0].shots[2].approved,false);
 }finally{
  if(previous===undefined)delete process.env.VIRALCINE_DATA_DIR;
  else process.env.VIRALCINE_DATA_DIR=previous;
  await rm(root,{recursive:true,force:true});
 }
});
