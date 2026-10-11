import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {executeFreeAutonomyJob,type FreeAutonomyJob,type AutonomyDependencies}
 from '../lib/v7/orchestration/v8-free-autonomy-runner';

const template=(action:FreeAutonomyJob['action'],payload:Record<string,unknown>={}):FreeAutonomyJob=>({
 id:'job-1',job_key:'film-dos-toques-de-bocina-v7/e02/p02/'+action,
 film_id:'film-dos-toques-de-bocina-v7',scene_id:'E02',shot_id:'E02-P02',
 action,payload,attempt:1,max_attempts:3
});
function dependencies(verify:'present'|'missing'|'unauthorized'='present'):AutonomyDependencies {
 return {verifyStoredAsset:async()=>verify,
  reconcileExistingTask:async()=>({status:'RUNNING'})};
}
test('Media imported from Windows requires verified cloud asset; no hallucinated uploaded image',async()=>{
 const r=await executeFreeAutonomyJob(template('source-check',{
  files:[{bucket:'v8-film-assets',path:'film-dos-toques-de-bocina-v7/e02/E02-P02.jpg'}]
 }),dependencies('missing'));
 assert.equal(r.state,'waiting-assets');
 assert.equal(r.result.verifiedCount,0);
});
test('Seven cloud references may be checked without starting any paid render',async()=>{
 const files=Array.from({length:7},(_,i)=>({bucket:'v8-film-assets',
  path:'film-dos-toques-de-bocina-v7/e02/E02-P0'+(i+1)+'.jpg'}));
 const r=await executeFreeAutonomyJob(template('source-check',{files}),dependencies());
 assert.equal(r.state,'completed');
 assert.equal(r.result.checkedAssets,7);
 assert.equal(r.result.cinematicQaApproved,false);
});
test('Runway insufficient credits blocks without POST or retry, preserving the rejected operation',async()=>{
 let called=0;
 const deps={...dependencies(),reconcileExistingTask:async()=>{
  called++;return {status:'RUNNING'};
 }};
 const r=await executeFreeAutonomyJob(template('provider-reconcile',{
  provider:'runway',lastError:'You do not have enough credits to run this task.'
 }),deps);
 assert.equal(r.state,'waiting-provider');
 assert.equal(called,0);
 assert.match(String(r.result.reason),/sin créditos/);
});
test('Runway is the only authorized provider, without fallback and without a paid submission',async()=>{
 let providerCalls=0;
 const deps={...dependencies(),reconcileExistingTask:async()=>{
  providerCalls++;return {status:'completed'};
 }};
 const r=await executeFreeAutonomyJob(template('provider-reconcile',{
  provider:'veo',taskId:'8f27c3ae-1764-4eba-8c7c-620e6a9dc432'
 }),deps);
 assert.equal(r.state,'waiting-provider');
 assert.equal(providerCalls,0);
 assert.match(String(r.result.reason),/exclusivamente Runway/);
});

test('An existing known task can be polled safely until ready, with idempotent task ID',async()=>{
 let called=0;
 const id='8f27c3ae-1764-4eba-8c7c-620e6a9dc432';
 const deps={...dependencies(),reconcileExistingTask:async(provider:string,taskId:string)=>{
  assert.equal(provider,'runway');assert.equal(taskId,id);
  called++;return {status:'processing'};
 }};
 const r=await executeFreeAutonomyJob(template('provider-reconcile',{provider:'runway',taskId:id}),deps);
 assert.equal(r.state,'retry-wait');assert.equal(r.retrySeconds,120);
 assert.equal(r.result.providerTaskId,id);assert.equal(called,1);
});
test('Provider reconciliation does not mark an unverified output as artistically approved',async()=>{
 const id='8f27c3ae-1764-4eba-8c7c-620e6a9dc432';
 const deps={...dependencies(),reconcileExistingTask:async()=>({
  status:'succeeded',outputUri:'https://example.invalid/clip.mp4'
 })};
 const r=await executeFreeAutonomyJob(template('provider-reconcile',{provider:'runway',taskId:id}),deps);
 assert.equal(r.state,'completed');
 assert.equal(r.result.outputVerified,false);
 assert.equal(r.result.requiresIndependentQa,true);
});
test('Technical errors receive bounded backoff; unknown records never trigger new billable requests',async()=>{
 const deps={...dependencies(),verifyStoredAsset:async()=>{throw Error('temporary network failure');}};
 const r=await executeFreeAutonomyJob(template('source-check',{
  files:[{bucket:'v8-film-assets',path:'scene/E02-P02.jpg'}]}),deps);
 assert.equal(r.state,'retry-wait');
 assert.ok(r.retrySeconds!>=30&&r.retrySeconds!<=3600);
 const s=await executeFreeAutonomyJob(template('director-plan',{shots:[
  {id:'E02-P01',imageReady:true,videoReady:false,taskKnown:false,status:'blocked-credits'}
 ]}),dependencies());
 assert.equal(s.state,'waiting-provider');
});
test('Plan cannot spend by assuming a budget from job payload, and Avatares is forbidden',async()=>{
 const s=[{id:'E02-P01',imageReady:true,videoReady:false,
  taskKnown:false,status:'not-started'}];
 let r=await executeFreeAutonomyJob(template('director-plan',{shots:s,
  authorizedBudgetUsd:999999,explicitBudgetUsd:999999,providerAvailable:true}),dependencies());
 assert.equal(r.state,'waiting-approval');
 r=await executeFreeAutonomyJob(template('director-plan',{shots:s,
  mediaSource:'avatares'}),dependencies());
 assert.equal(r.state,'blocked-unknown');
});
test('Database queue has atomic leases, fencing, RLS, max attempts, and no provider payment endpoints',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261011_v8_autonomy_jobs.sql',import.meta.url),'utf8');
 const worker=await readFile(new URL('../scripts/worker-v8.ts',import.meta.url),'utf8');
 assert.match(sql,/for update skip locked/i);
 assert.match(sql,/p_lock_token uuid/);
 assert.match(sql,/rec\.attempt>=rec\.max_attempts/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/to service_role/);
 assert.match(worker,/V8_AUTONOMY_ENABLED/);
 assert.match(worker,/SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(worker,/v8_claim_autonomy_job/);
 assert.match(worker,/v8_finish_autonomy_job/);
 assert.doesNotMatch(worker,/method:'POST'.*runwayml/);
 assert.match(worker,/Avatares=DISABLED/);
});
