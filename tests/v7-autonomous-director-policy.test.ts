import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {classifyRunwaySubmitError,isLegacyCreditRejection} from '../lib/v7/orchestration/provider-failure-policy';
import {decideNextSceneStep,type DirectorShot} from '../lib/v7/orchestration/autonomous-director-policy';

const shots=():DirectorShot[]=>Array.from({length:7},(_,i)=>({
 id:'E02-P0'+(i+1),imageReady:true,videoReady:false,
 taskKnown:false,status:'not-started',approved:false
}));
const decide=(list:DirectorShot[],budget=3.5)=>decideNextSceneStep({
 shots:list,authorizedBudgetUsd:budget,explicitBudgetUsd:budget,
 sceneAssembled:false,sceneApproved:false,providerAvailable:true,estimatedUsdPerClip:0.5
});

test('Runway 400 insufficient credits is a definitive provider block, not an unknown paid render',()=>{
 const d=classifyRunwaySubmitError(400,'You do not have enough credits to run this task.');
 assert.equal(d.kind,'blocked-credits');
 assert.equal(d.exposure,'rejected');
 assert.equal(d.autoRetry,false);
 assert.equal(classifyRunwaySubmitError(429,'Temporarily busy').kind,'provider-capacity');
 assert.equal(classifyRunwaySubmitError(500,'Gateway timeout').kind,'unknown');
 assert.equal(classifyRunwaySubmitError(401,'Invalid API key').kind,'blocked-credentials');
});
test('Legacy P01 failed-unknown no-credit response is displayed as blocked, without overwriting audit',()=>{
 assert.equal(isLegacyCreditRejection({
  status:'failed-unknown',error:'Runway API 400: You do not have enough credits to run this task.'
 }),true);
 assert.equal(isLegacyCreditRejection({
  status:'failed-unknown',taskId:'task-existing',error:'Runway API 400: not enough credits'
 }),false);
 assert.equal(isLegacyCreditRejection({status:'failed-unknown',error:'Runway timed out'}),false);
});
test('Director pauses all seven shots if Runway P01 is blocked; no paid retry',()=>{
 const seven=shots();
 seven[0].status='blocked-credits';
 const decision=decide(seven);
 assert.equal(decision.action,'ask-director');
 if(decision.action==='ask-director')assert.equal(decision.question.kind,'credits-or-provider');
});
test('Director asks only for missing input, otherwise chooses safe next job',()=>{
 const s=shots();
 s[2].imageReady=false;
 const missing=decide(s);
 assert.equal(missing.action,'ask-director');
 if(missing.action==='ask-director')assert.deepEqual(
  [missing.question.kind,missing.question.shotId],['reference','E02-P03']);
 s[2].imageReady=true;
 assert.deepEqual(decide(s,0),{
  action:'ask-director',question:{
   kind:'economic-approval',shotId:'E02-P01',
   message:'Se requiere autorización económica explícita para la siguiente generación.'
  }});
 assert.deepEqual(decide(s),{action:'submit-authorized',shotId:'E02-P01',estimatedUsd:0.5});
 s[0].status='processing';s[0].taskKnown=true;
 assert.deepEqual(decide(s),{action:'reconcile-existing',shotId:'E02-P01'});
 s[0].status='failed-unknown';s[0].taskKnown=false;
 assert.equal(decide(s).action,'blocked-unknown');
});
test('Once MP4s exist, director requests human approval before assembling; scene approval follows',()=>{
 const s=shots().map(x=>({...x,videoReady:true,status:'review-required'}));
 let d=decide(s);
 assert.equal(d.action,'ask-director');
 if(d.action==='ask-director')assert.equal(d.question.kind,'artistic-review');
 for(const x of s)x.approved=true;
 d=decide(s);assert.equal(d.action,'assemble-local');
 const next=decideNextSceneStep({
  shots:s,explicitBudgetUsd:0,authorizedBudgetUsd:0,
  sceneAssembled:true,sceneApproved:false,providerAvailable:false,estimatedUsdPerClip:.5
 });
 assert.equal(next.action,'ask-director');
 assert.equal(decideNextSceneStep({shots:s,explicitBudgetUsd:0,authorizedBudgetUsd:0,
  sceneAssembled:true,sceneApproved:true,providerAvailable:false,estimatedUsdPerClip:.5}).action,'complete');
});
test('Runway no-credit errors are recorded as blocked, not charged or silently repeated',async()=>{
 const engine=await readFile(new URL('../lib/v7/production/runway-e02-engine.ts',import.meta.url),'utf8');
 const panel=await readFile(new URL('../components/V7RunwayScene02Panel.tsx',import.meta.url),'utf8');
 assert.match(engine,/new RunwayKnownRejection\('blocked-credits'/);
 assert.match(engine,/record\.status=e instanceof RunwayKnownRejection\?e\.kind:'failed-unknown'/);
 assert.match(engine,/isLegacyCreditRejection\(r\)/);
 assert.match(engine,/sceneRecords\.some\(r=>r&&\['blocked-credits','blocked-credentials'\]/);
 assert.match(engine,/reservedUsd|runwayReservedUsd/);
 assert.match(panel,/blockedCredits/);
 assert.match(panel,/providerBlocked\|\|!allowSpend/);
});
