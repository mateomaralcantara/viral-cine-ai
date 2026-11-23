import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {E02_FILM_ID} from '@/lib/v7/production/dos-toques-e02-shot-packets';
import {createCorrectionRevision,readCorrectionRevision,latestCorrectionRevision,
 correctionAttemptsDir,usedCorrectionRevision,hasAnyCorrectionAuthorization} from '@/lib/v7/production/e02-correction-store';

test('correction revisions are immutable, validated, and do not call a provider',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'viralcine-correction-'));
 const original=process.env.VIRALCINE_DATA_DIR;
 process.env.VIRALCINE_DATA_DIR=dir;
 try{
  const id='E02-P04';
  const imageHash='a'.repeat(64);
  const prompt='Gabriel is already inside his home holding the helmet. Slow push in. No dialogue or walking.';
  const first=await createCorrectionRevision(id,prompt,imageHash);
  assert.match(first.revisionId,/^v\d{17}-/);
  assert.equal(first.promptHash,createHash('sha256').update(prompt).digest('hex'));
  assert.equal((await readCorrectionRevision(id,first.revisionId)).promptText,prompt);
  assert.equal((await latestCorrectionRevision(id))?.revisionId,first.revisionId);
  assert.equal(await usedCorrectionRevision(id,first.revisionId),false);
  assert.equal(await hasAnyCorrectionAuthorization(id),false);
  const second=await createCorrectionRevision(id,prompt+' Maintain consistent identities.',imageHash);
  assert.notEqual(second.revisionId,first.revisionId);
  assert.equal((await latestCorrectionRevision(id))?.revisionId,second.revisionId);
  assert.equal((await readCorrectionRevision(id,first.revisionId)).promptText,prompt);
  const attemptDir=correctionAttemptsDir(id);
  await mkdir(attemptDir,{recursive:true});
  await writeFile(path.join(attemptDir,first.revisionId+'.authorization.json'),'{}',{flag:'wx'});
  assert.equal(await usedCorrectionRevision(id,first.revisionId),true);
  assert.equal(await hasAnyCorrectionAuthorization(id),true);
  assert.equal(await usedCorrectionRevision(id,second.revisionId),false);
  await assert.rejects(createCorrectionRevision(id,'too short',imageHash));
  await assert.rejects(createCorrectionRevision(id,prompt,'invalid-hash'));
  await assert.rejects(readCorrectionRevision(id,'../../../escape'));
  assert.match(E02_FILM_ID,/dos-toques/);
 }finally{
  if(original===undefined)delete process.env.VIRALCINE_DATA_DIR;
  else process.env.VIRALCINE_DATA_DIR=original;
  await rm(dir,{recursive:true,force:true});
 }
});

test('isolated review never presents unavailable Supabase approval as rejected',async()=>{
 const source=await (await import('node:fs/promises')).readFile(
  new URL('../components/V7Scene02CorrectionPanel.tsx',import.meta.url),'utf8');
 assert.match(source,/No verificable \(Supabase desconectado\)/);
 assert.match(source,/Diagnóstico LOCAL \(registro guardado\)/);
 assert.match(source,/!board\?\.providerEnabled/);
});
