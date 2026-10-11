import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {E02_FILM_ID} from '../lib/v7/production/dos-toques-e02-shot-packets';
import {e02SeedReady,e02ShotImageReady,saveE02ShotImage,runwayPreflight,runwayReservedUsd}
 from '../lib/v7/production/runway-e02-engine';
import {issueLocalSession,hasLocalSession,LOCAL_SESSION_COOKIE}
 from '../lib/v7/security/local-studio-session';

test('E02 stores all 7 independent director stills and never starts a paid request',async()=>{
 const previous=process.env.VIRALCINE_DATA_DIR;
 const root=await mkdtemp(path.join(tmpdir(),'v7-e02-director-images-'));
 process.env.VIRALCINE_DATA_DIR=root;
 try{
  const photo=await sharp({create:{width:1280,height:720,channels:3,
   background:{r:120,g:79,b:44}}}).png().toBuffer();
  assert.ok(photo.length>3000);
  for(let i=1;i<=7;i++){
   const id='E02-P'+String(i).padStart(2,'0');
   assert.equal(await e02ShotImageReady(id),false);
   const result=await saveE02ShotImage(id,photo);
   assert.equal(result.imageReady,true);
   assert.equal(result.newGenerationRequests,0);
   assert.equal(await e02ShotImageReady(id),true);
   const target=path.join(root,'v7','films',E02_FILM_ID,id.toLowerCase(),
    id+'-image-reference.jpg');
   const info=await stat(target);
   assert.ok(info.size>3000);
   const p=await runwayPreflight(id);
   assert.equal(p.referenceShotId,id+'-IMAGE');
   assert.equal(p.freePreflight,true);
   const again=await saveE02ShotImage(id,photo);
   assert.equal(again.alreadySaved,true);
   assert.equal(again.newGenerationRequests,0);
  }
  assert.equal(await e02SeedReady(),true);
  assert.equal(await runwayReservedUsd(),0);
 }finally{
  if(previous===undefined)delete process.env.VIRALCINE_DATA_DIR;
  else process.env.VIRALCINE_DATA_DIR=previous;
  await rm(root,{recursive:true,force:true});
 }
});
test('Studio E02 UI upload buttons cannot be disabled by missing token and scripts require user ENTER',async()=>{
 const paths=[
  '../components/V7RunwayScene02Panel.tsx',
  '../scripts/INICIAR-V7-E01-CONSOLA.ps1',
  '../app/api/v7/films/[filmId]/runway-scene02/route.ts'
 ];
 const [ui,launch,api]=await Promise.all(paths.map(p=>
  readFile(new URL(p,import.meta.url),'utf8')));
 assert.match(ui,/selectedImage/);
 assert.match(ui,/selectedBatch/);
 assert.match(ui,/Importar siete imágenes de Escena 02/);
 assert.match(ui,/X-V7-Shot-ID/);
 assert.match(ui,/body:file/);
 assert.match(ui,/selectedBatch/);
 assert.match(ui,/Guardar imágenes no cuesta dinero/);
 assert.match(ui,/ensureLocalStudioSession/);
 assert.doesNotMatch(ui,/disabled=\{!seedImage\|\|!token/);
 assert.match(launch,/Read-Host "PRESIONA ENTER/);
 assert.match(launch,/npm run dev -- -p 3010 -H 127\.0\.0\.1/);
 assert.match(launch,/V7_STUDIO_PAIR_CODE/);
 assert.match(api,/upload-shot-image/);
 assert.match(api,/e02ShotImageReady/);
});
