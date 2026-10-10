import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createDosToquesBundle } from '../lib/v7/presets/dos-toques-de-bocina';
import { assembleApprovedSceneLocally } from '../lib/v7/production/scene-local-assembler';
const run=promisify(execFile);
test('Local scene assembly joins two approved blocks, preserves sources and never calls a provider',{timeout:120000},async()=>{
  const previous=process.env.VIRALCINE_DATA_DIR;
  const tmp=await mkdtemp(path.join(tmpdir(),'v7-local-assembly-'));
  process.env.VIRALCINE_DATA_DIR=tmp;
  try{
    const film=createDosToquesBundle().film;
    const original=film.acts[0].sequences[0].scenes[0];
    const scene={...original,shots:original.shots.slice(0,2).map(s=>({...s,durationSeconds:1}))};
    film.acts=[{...film.acts[0],sequences:[{...film.acts[0].sequences[0],scenes:[scene]}]}];
    const filmRoot=path.join(tmp,'v7','films',film.id);
    const fingerprints:string[]=[];
    for(const label of ['E01-P01','E01-P02']){
      const dir=path.join(filmRoot,label.toLowerCase());
      await mkdir(dir,{recursive:true});
      const file=path.join(dir,label+'-veo-candidato.mp4');
      await run('ffmpeg',['-nostdin','-v','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=24',
        '-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','1.5',
        '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac',file],{timeout:60000});
      const bytes=await readFile(file);
      const sha=createHash('sha256').update(bytes).digest('hex');
      fingerprints.push(sha);
      await writeFile(path.join(dir,'artistic-approval.json'),JSON.stringify({
        filmId:film.id,shotId:label,status:'artistic-approved',
        sourceVideoName:label+'-veo-candidato.mp4',sourceVideoSha256:sha
      }));
    }
    const first=await assembleApprovedSceneLocally(film,scene.id);
    assert.equal(first.status,'assembled');
    assert.equal(first.additionalSpendUsd,0);
    assert.equal(first.providerCalls,0);
    const completed=path.join(filmRoot,'scenes','e01','scene-cut.mp4');
    assert.ok((await stat(completed)).size>10000);
    const second=await assembleApprovedSceneLocally(film,scene.id);
    assert.equal(second.status,'already-assembled');
    for(const [i,label] of ['E01-P01','E01-P02'].entries()){
      const bytes=await readFile(path.join(filmRoot,label.toLowerCase(),label+'-veo-candidato.mp4'));
      assert.equal(createHash('sha256').update(bytes).digest('hex'),fingerprints[i]);
    }
  }finally{
    if(previous===undefined)delete process.env.VIRALCINE_DATA_DIR;
    else process.env.VIRALCINE_DATA_DIR=previous;
    await rm(tmp,{recursive:true,force:true});
  }

});
