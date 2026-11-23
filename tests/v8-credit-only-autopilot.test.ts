import test from 'node:test';
import assert from 'node:assert/strict';
import {decideCreditOnlyAction,requiredShotGates,requiredFinalGates,
 type AutoScene,type AutoShot,type AutopilotPolicy} from '../lib/v7/orchestration/v8-credit-only-autopilot';
import {executeFreeAutonomyJob,type FreeAutonomyJob} from '../lib/v7/orchestration/v8-free-autonomy-runner';
import {readFile} from 'node:fs/promises';

const policy:AutopilotPolicy={
 provider:'runway',avatares:false,directorInteraction:'credits-only',
 maxFreeRepairs:3,maxPaidRendersPerShot:2,pricePerRenderUsd:0.5,
 authorizedRemainingUsd:0,creditBalanceConfirmed:false
};
const seven=():AutoShot[]=>Array.from({length:7},(_,i)=>({
 id:'E02-P0'+(i+1),referenceReady:true,videoReady:false,status:'not-started'
}));
const scene=():AutoScene=>({
 shots:seven(),montageReady:false,approved:false
});
const task=(shots:unknown):FreeAutonomyJob=>({
 id:'j1',job_key:'film-dos-toques-de-bocina-v7/E02/dir',
 film_id:'film-dos-toques-de-bocina-v7',scene_id:'E02',
 action:'director-plan',payload:{shots,providerAvailable:true},
 attempt:1,max_attempts:3
});
const fakeDeps={
 verifyStoredAsset:async()=> 'present' as const,
 reconcileExistingTask:async()=>({status:'running'}),
 getCreditOnlyPolicy:async()=>policy
};
test('Only financial approval is requested when Runway has no verified balance',()=>{
 let a=decideCreditOnlyAction(scene(),policy);
 assert.equal(a.kind,'request-credits');
 if(a.kind==='request-credits')assert.equal(a.minimumUsd,0.5);
 a=decideCreditOnlyAction(scene(),{...policy,creditBalanceConfirmed:true});
 assert.equal(a.kind,'request-credits');
 a=decideCreditOnlyAction(scene(),{
  ...policy,authorizedRemainingUsd:3.5,creditBalanceConfirmed:true
 });
 assert.deepEqual(a,{kind:'start-render',shotId:'E02-P01',maximumUsd:0.5,
  requiresAtomicLedger:true});
});
test('An existing provider task is reconciled without a new paid submission',()=>{
 const s=scene();s.shots[0].providerTaskId='task-exists';
 assert.deepEqual(decideCreditOnlyAction(s,policy),{
  kind:'reconcile-task',shotId:'E02-P01',providerTaskId:'task-exists'
 });
});
test('QA agents, rather than a person, inspect and approve the existing clip',()=>{
 const s=scene();
 const sh=s.shots[0];sh.videoReady=true;sh.videoSha256='a'.repeat(64);
 let a=decideCreditOnlyAction(s,policy);
 assert.equal(a.kind,'run-shot-qa');
 sh.qa={assetSha256:sh.videoSha256,verifiedBy:'qa-worker:identity',
  checks:Object.fromEntries(requiredShotGates.map(x=>[x,'pass']))};
 a=decideCreditOnlyAction(s,policy);
 assert.deepEqual(a,{kind:'approve-shot-automatically',shotId:'E02-P01',
  assetSha256:sh.videoSha256});
 sh.autoApproved=true;
 a=decideCreditOnlyAction(s,policy);
 assert.equal(a.kind,'request-credits');
});
test('Cannot autoapprove if QA evidence belongs to different MP4 or one gate is unknown',()=>{
 const s=scene();const sh=s.shots[0];
 sh.videoReady=true;sh.videoSha256='a'.repeat(64);sh.autoApproved=true;
 sh.qa={assetSha256:'b'.repeat(64),verifiedBy:'qa-agent',checks:{
  decode:'pass',duration:'pass',identity:'pass',continuity:'pass',motion:'pass'
 }};
 assert.equal(decideCreditOnlyAction(s,policy).kind,'run-shot-qa');
 sh.qa.assetSha256=sh.videoSha256;
 sh.qa.checks.motion='unknown';
 assert.equal(decideCreditOnlyAction(s,policy).kind,'run-shot-qa');
});
test('Free video repair runs automatically with upper bound; paid regeneration still needs budget',()=>{
 const s=scene();const sh=s.shots[0];sh.videoReady=true;sh.videoSha256='a'.repeat(64);
 sh.qa={assetSha256:sh.videoSha256,verifiedBy:'qa-agent',checks:{
  decode:'pass',duration:'pass',identity:'pass',continuity:'fail',motion:'pass'
 }};
 let a=decideCreditOnlyAction(s,policy);
 assert.deepEqual(a,{kind:'repair-locally',shotId:'E02-P01',attempt:1});
 sh.freeRepairsUsed=3;
 assert.equal(decideCreditOnlyAction(s,policy).kind,'request-credits');
 sh.paidRendersUsed=2;
 assert.equal(decideCreditOnlyAction(s,policy).kind,'hold-internal');
});
test('Final scene automatically receives QA across montage and sound before approval',()=>{
 const s=scene();
 for(const shot of s.shots){
  shot.videoReady=true;shot.videoSha256='a'.repeat(64);
  shot.qa={assetSha256:shot.videoSha256,verifiedBy:'qa-agent',
   checks:Object.fromEntries(requiredShotGates.map(g=>[g,'pass']))};
  shot.autoApproved=true;
 }
 assert.equal(decideCreditOnlyAction(s,policy).kind,'assemble-scene-automatically');
 s.montageReady=true;s.montageSha256='b'.repeat(64);
 assert.equal(decideCreditOnlyAction(s,policy).kind,'run-scene-qa');
 s.qa={assetSha256:s.montageSha256,verifiedBy:'mix-qa-agent',
  checks:Object.fromEntries(requiredFinalGates.map(g=>[g,'pass']))};
 let a=decideCreditOnlyAction(s,policy);
 assert.deepEqual(a,{kind:'approve-scene-automatically',assetSha256:s.montageSha256});
 s.approved=true;
 assert.equal(decideCreditOnlyAction(s,policy).kind,'advance-to-next-scene');
});
test('Film credit-only policy in queue is read from server-managed Supabase record',async()=>{
 const r=await executeFreeAutonomyJob(task(seven().map(s=>({...s,imageReady:true}))),fakeDeps);
 assert.equal(r.state,'waiting-approval');
 assert.equal(r.result.onlyHumanApproval,'credits');
 assert.equal(r.result.moneySpentByWorker,false);
 const schema=await readFile(new URL('../supabase/migrations/20261011_v8_credit_only_autonomy.sql',import.meta.url),'utf8');
 const worker=await readFile(new URL('../scripts/worker-v8.ts',import.meta.url),'utf8');
 assert.match(schema,/director_mode='credits-only'/);
 assert.match(schema,/authorized_spend_usd.*default 0/i);
 assert.match(schema,/avatares_enabled.*default false/i);
 assert.match(worker,/getCreditOnlyPolicy/);
 assert.match(worker,/v8_film_autonomy_policy/);
});
