import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDosToquesBundle } from '../lib/v7/presets/dos-toques-de-bocina';
import { readSceneApprovalBoard } from '../lib/v7/production/scene-approval-board';

test('Board automatically discovers an existing P01 approval and enables P02 approval without rerendering', async () => {
  const previous=process.env.VIRALCINE_DATA_DIR;
  const directory=await mkdtemp(path.join(tmpdir(),'v7-scene-board-test-'));
  process.env.VIRALCINE_DATA_DIR=directory;
  try{
    const film=createDosToquesBundle().film;
    const basedir=path.join(directory,'v7','films',film.id);
    for(const label of ['E01-P01','E01-P02']){
      const dir=path.join(basedir,label.toLowerCase());
      await mkdir(dir,{recursive:true});
      await writeFile(path.join(dir,label+'-veo-candidato.mp4'),Buffer.alloc(10500,1));
      await writeFile(path.join(dir,'provider-operation.json'),JSON.stringify({
        filmId:film.id,shotId:label,status:'review-required',
        providerOperationName:'example-operation-'+label,candidateName:label+'-veo-candidato.mp4'
      }));
    }
    await writeFile(path.join(basedir,'e01-p01','artistic-approval.json'),JSON.stringify({
      filmId:film.id,shotId:'E01-P01',status:'artistic-approved',
      sourceVideoName:'E01-P01-veo-candidato.mp4',sourceVideoSha256:'a'.repeat(64),
      videoSeconds:8
    }));
    const board=await readSceneApprovalBoard(film);
    const first=board.scenes[0];
    assert.equal(first.label,'E01');
    assert.equal(first.shots[0].approved,true);
    assert.equal(first.shots[0].readyForApproval,false);
    assert.equal(first.shots[1].approved,false);
    assert.equal(first.shots[1].readyForApproval,true);
    assert.equal(first.readyForAssembly,false);
    assert.equal(first.readyForApproval,false);
    assert.equal(board.externalApiCalls,0);
    assert.equal(board.additionalSpendUsd,0);
  }finally{
    if(previous===undefined)delete process.env.VIRALCINE_DATA_DIR;
    else process.env.VIRALCINE_DATA_DIR=previous;
    await rm(directory,{recursive:true,force:true});
  }
});
