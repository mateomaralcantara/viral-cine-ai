import test from 'node:test';
import assert from 'node:assert/strict';
import {
 AVATARES_INTEGRATION_STATUS,authorizeMediaSource
} from '../lib/v7/orchestration/media-source-policy';
import {
 decideNextSceneStep,type DirectorShot
} from '../lib/v7/orchestration/autonomous-director-policy';

function sevenShots():DirectorShot[]{
 return Array.from({length:7},(_,i)=>({
  id:'E02-P0'+(i+1),imageReady:true,videoReady:false,
  taskKnown:false,status:'not-started'
 }));
}
const base={
 explicitBudgetUsd:3.5,authorizedBudgetUsd:3.5,
 sceneAssembled:false,sceneApproved:false,providerAvailable:true,
 estimatedUsdPerClip:0.5
} as const;

test('Avatares is explicitly and unconditionally excluded from film creation',()=>{
 assert.equal(AVATARES_INTEGRATION_STATUS,'disabled-until-explicit-approval');
 const r=authorizeMediaSource('avatares');
 assert.equal(r.allowed,false);
 assert.match(r.reason,/Avatares está excluido/);
});
test('E02 can move forward using the seven previously uploaded JPGs, without Avatares',()=>{
 const r=decideNextSceneStep({...base,shots:sevenShots()});
 assert.deepEqual(r,{action:'submit-authorized',shotId:'E02-P01',estimatedUsd:0.5});
 const original=authorizeMediaSource('existing-film-assets');
 assert.equal(original.allowed,true);
 if(original.allowed)assert.equal(original.requiresExternalSpendConsent,false);
});
test('When source is Avatares, director stops and asks for existing photo instead',()=>{
 const r=decideNextSceneStep({...base,shots:sevenShots(),mediaSource:'avatares'});
 assert.equal(r.action,'ask-director');
 if(r.action==='ask-director'){
  assert.equal(r.question.kind,'reference');
  assert.match(r.question.message,/fotos guardadas/);
 }
});
test('Third-party generation still requires separate explicit spending consent',()=>{
 const s=authorizeMediaSource('approved-third-party-provider');
 assert.equal(s.allowed,true);
 if(s.allowed)assert.equal(s.requiresExternalSpendConsent,true);
 const d=decideNextSceneStep({...base,shots:sevenShots(),mediaSource:'approved-third-party-provider',
  authorizedBudgetUsd:0});
 assert.equal(d.action,'ask-director');
 if(d.action==='ask-director')assert.equal(d.question.kind,'economic-approval');
});
