import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import sharp from 'sharp';
import {E02_FILM_ID,E02_SCENE_ID,E02_SHOTS,E02_DURATION_SECONDS,E02_COST_PER_SHOT,E02_MAX_USD} from '../lib/v7/production/dos-toques-e02-shot-packets';
import {createDosToquesBundle} from '../lib/v7/presets/dos-toques-de-bocina';
import {saveE02Seed,e02SeedReady,runwayPreflight,runwayShotSpecs,
 runwayReservedUsd} from '../lib/v7/production/runway-e02-engine';

test('E02 matches the canonical seven-beat 55s screenplay exactly',()=>{
 const film=createDosToquesBundle().film;
 const scene=film.acts.flatMap(a=>a.sequences.flatMap(q=>q.scenes))[1];
 assert.equal(scene.id,E02_SCENE_ID);
 assert.equal(scene.durationSeconds,55);
 assert.equal(E02_DURATION_SECONDS,55);
 assert.deepEqual(E02_SHOTS.map(s=>s.id),['E02-P01','E02-P02','E02-P03',
 'E02-P04','E02-P05','E02-P06','E02-P07']);
 assert.deepEqual(E02_SHOTS.map(s=>s.editSeconds),[8,8,8,8,8,8,7]);
 assert.equal(E02_SHOTS.reduce((t,s)=>t+s.editSeconds,0),55);
 assert.equal(E02_MAX_USD,3.5);
 assert.equal(E02_COST_PER_SHOT,0.5);
 assert.equal(runwayShotSpecs().length,7);
 assert.ok(E02_SHOTS.every(s=>s.promptHash===
  createHash('sha256').update(s.prompt).digest('hex')));
 assert.equal(E02_FILM_ID,'film-dos-toques-de-bocina-v7');
});
test('A local E02 image seed is imported once, not a provider call, and cannot be replaced',async()=>{
 const saved=process.env.VIRALCINE_DATA_DIR;
 const dir=await mkdtemp(path.join(tmpdir(),'viralcine-e02-seed-'));
 process.env.VIRALCINE_DATA_DIR=dir;
 try{
  assert.equal(await e02SeedReady(),false);
  await assert.rejects(runwayPreflight('E02-P01'),/imagen inicial/i);
  const source=await sharp({create:{width:1280,height:720,channels:3,
    background:{r:145,g:91,b:72}}}).jpeg({quality:85}).toBuffer();
  const uploaded=await saveE02Seed(source);
  assert.equal(uploaded.seedReady,true);
  assert.equal(await e02SeedReady(),true);
  const file=path.join(dir,'v7','films',E02_FILM_ID,'scenes','e02','scene02-seed.jpg');
  assert.ok((await stat(file)).size>3000);
  const p=await runwayPreflight('E02-P01');
  assert.equal(p.referenceShotId,'E02-SEED');
  assert.equal(p.estimatedUsd,0.5);
  assert.equal(p.freePreflight,true);
  assert.equal(await runwayReservedUsd(),0);
  await assert.rejects(saveE02Seed(source),/EEXIST|exist/i);
 }finally{
  if(saved===undefined)delete process.env.VIRALCINE_DATA_DIR;
  else process.env.VIRALCINE_DATA_DIR=saved;
  await rm(dir,{recursive:true,force:true});
 }
});
test('E02 cannot begin P02 without the actual preceding video',async()=>{
 const previous=process.env.VIRALCINE_DATA_DIR;
 const dir=await mkdtemp(path.join(tmpdir(),'viralcine-e02-chain-'));
 process.env.VIRALCINE_DATA_DIR=dir;
 try{
  await assert.rejects(runwayPreflight('E02-P02'),/MP4 anterior/i);
 }finally{
  if(previous===undefined)delete process.env.VIRALCINE_DATA_DIR;
  else process.env.VIRALCINE_DATA_DIR=previous;
  await rm(dir,{recursive:true,force:true});
 }
});
test('E02 UI, API, launcher and FFmpeg assembly are wired without modifying E01',async()=>{
 const files=await Promise.all([
  '../components/V7RunwayScene02Panel.tsx',
  '../components/V7FilmWorkspace.tsx',
  '../app/api/v7/films/[filmId]/runway-scene02/route.ts',
  '../lib/v7/production/scene-local-assembler.ts',
  '../scripts/INICIAR-V7-E01-CONSOLA.ps1',
  '../lib/v7/production/runway-e02-engine.ts'
 ].map(x=>readFile(new URL(x,import.meta.url),'utf8')));
 assert.match(files[0],/Producir bloques faltantes con Runway/);
 assert.match(files[0],/uploadSeed/);
 assert.match(files[1],/tab === 'scene02'/);
 assert.match(files[2],/upload-seed/);
 assert.match(files[2],/runwayAdminAuthorized/);
 assert.match(files[3],/E02_SHOTS\[i\]\?\.editSeconds/);
 assert.match(files[4],/V7_RUNWAY_E02_ENABLED/);
 assert.match(files[5],/await writeFile\(runwayRecordPath\(id\)/);
 assert.match(files[5],/taskId=result.id/);
 assert.match(files[5],/\.runway-e02-submit\.lock/);
});
