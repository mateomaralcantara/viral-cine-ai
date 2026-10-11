import test from 'node:test';
import assert from 'node:assert/strict';
import {E02_GATES,assessE02VideoQA,assessE02RunwayPreflight} from '../lib/v7/orchestration/v8-e02-runway-qa-contract';

const hash='a'.repeat(64);
const preflight={
 filmId:'film-dos-toques-de-bocina-v7',shotId:'E02-P01',
 referenceReady:true,promptText:'Camera slowly moves beside the character.',
 durationSeconds:5,provider:'runway',model:'gen4_turbo',
 authorizedRemainingUsd:0,providerBalanceConfirmed:false
};
test('E02 preflight cannot authorize a render with current zero budget',()=>{
 const r=assessE02RunwayPreflight(preflight);
 assert.equal(r.eligibleForIndependentAtomicReservation,false);
 assert.equal(r.paidCallExecuted,false);
 assert.equal(r.estimatedUsd,0.25);
 assert.ok(r.reasons.includes('runway-balance-not-confirmed'));
 assert.ok(r.reasons.includes('insufficient-authorized-budget'));
});
test('Missing creative spec and existing task both block dispatch',()=>{
 let r=assessE02RunwayPreflight({...preflight,
  providerBalanceConfirmed:true,authorizedRemainingUsd:1,promptText:null});
 assert.ok(r.reasons.includes('shot-instructions-not-synced'));
 r=assessE02RunwayPreflight({...preflight,providerBalanceConfirmed:true,
  authorizedRemainingUsd:1,existingTaskId:'existing-task'});
 assert.ok(r.reasons.includes('existing-provider-task-must-be-reconciled'));
});
test('Positive preflight is NOT an actual payment authorization nor API call',()=>{
 const r=assessE02RunwayPreflight({...preflight,
  providerBalanceConfirmed:true,authorizedRemainingUsd:1});
 assert.equal(r.eligibleForIndependentAtomicReservation,true);
 assert.equal(r.paidCallExecuted,false);
});
test('QA remains unapproved without hash-bound independent evidence',()=>{
 const r=assessE02VideoQA('E02-P01',hash,null);
 assert.equal(r.approved,false);
 assert.equal(r.missing.length,5);
});
test('Hash mismatch or unknown cinematic checks never autoapprove',()=>{
 const gates=Object.fromEntries(E02_GATES.map(g=>[g,'pass']));
 assert.equal(assessE02VideoQA('E02-P01',hash,{
  shotId:'E02-P01',videoSha256:'b'.repeat(64),verifiedBy:'worker:qa',gates}).approved,false);
 gates.identity='unknown';
 assert.equal(assessE02VideoQA('E02-P01',hash,{
  shotId:'E02-P01',videoSha256:hash,verifiedBy:'worker:qa',gates}).approved,false);
});
test('Five independent checks for the exact file permit technical QA approval',()=>{
 const gates=Object.fromEntries(E02_GATES.map(g=>[g,'pass']));
 const r=assessE02VideoQA('E02-P01',hash,{
  shotId:'E02-P01',videoSha256:hash,verifiedBy:'worker:qa',gates});
 assert.equal(r.approved,true);
});
